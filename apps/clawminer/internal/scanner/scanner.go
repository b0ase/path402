package scanner

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// WorkSubmitter is the callback signature for submitting work to the mining mempool.
type WorkSubmitter func(id, workType string, data interface{})

// ScanProgress holds thread-safe scanner status.
type ScanProgress struct {
	TotalScanned   int       `json:"total_scanned"`
	TotalHolders   int       `json:"total_holders_scanned"`
	TotalVerified  int       `json:"total_verified"`
	TotalDisputed  int       `json:"total_disputed"`
	LastScanAt     time.Time `json:"last_scan_at"`
	LastVerifyAt   time.Time `json:"last_verify_at,omitempty"`
	LastVerifyTick string    `json:"last_verify_tick,omitempty"`
	CurrentOffset  int       `json:"current_offset"`
	TickCount      int       `json:"tick_count"`
	IsRunning      bool      `json:"is_running"`
	LastError      string    `json:"last_error,omitempty"`
}

// Service is the BSV-20 token scanner that pulls from GorillaPool.
type Service struct {
	cfg      config.ScannerConfig
	client   *GorillaClient
	verifier *Verifier
	submit   WorkSubmitter

	mu       sync.RWMutex
	progress ScanProgress
	tickNum  int // counts ticks for holder scan cadence

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

// New creates a scanner service.
func New(cfg config.ScannerConfig, submit WorkSubmitter) *Service {
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 60 * time.Second
	}
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 20
	}
	if cfg.APIURL == "" {
		cfg.APIURL = "https://ordinals.gorillapool.io/api"
	}

	// Initialize cross-verification clients
	wocClient := NewWocClient(cfg.WocURL)
	oneSatClient := NewOneSatClient(cfg.OneSatURL)
	verifier := NewVerifier(wocClient, oneSatClient)

	return &Service{
		cfg:      cfg,
		client:   NewGorillaClient(cfg.APIURL),
		verifier: verifier,
		submit:   submit,
		done:     make(chan struct{}),
	}
}

// Start begins the scanning loop in a goroutine.
func (s *Service) Start() {
	if !s.cfg.Enabled {
		log.Println("[scanner] Disabled by config")
		close(s.done)
		return
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.mu.Lock()
	s.progress.IsRunning = true
	s.mu.Unlock()

	// Restore cursor from DB
	if val, err := db.GetConfig("scanner_offset"); err == nil && val != "" {
		if offset, err := strconv.Atoi(val); err == nil {
			s.mu.Lock()
			s.progress.CurrentOffset = offset
			s.mu.Unlock()
			log.Printf("[scanner] Restored cursor offset=%d", offset)
		}
	}

	go s.run()
	log.Printf("[scanner] Started (interval=%v, batch=%d, api=%s)",
		s.cfg.PollInterval, s.cfg.BatchSize, s.cfg.APIURL)
}

// Stop terminates the scanner gracefully.
func (s *Service) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	<-s.done
	s.mu.Lock()
	s.progress.IsRunning = false
	s.mu.Unlock()
	log.Println("[scanner] Stopped")
}

// Progress returns a snapshot of the scanner status.
func (s *Service) Progress() ScanProgress {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.progress
}

func (s *Service) run() {
	defer close(s.done)

	// Initial scan immediately
	s.scanTick()

	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.scanTick()
		}
	}
}

func (s *Service) scanTick() {
	s.tickNum++

	s.mu.RLock()
	offset := s.progress.CurrentOffset
	s.mu.RUnlock()

	// Fetch a batch of tokens
	tokens, err := s.client.FetchTokens(s.ctx, offset, s.cfg.BatchSize)
	if err != nil {
		log.Printf("[scanner] Token fetch error: %v", err)
		s.mu.Lock()
		s.progress.LastError = err.Error()
		s.mu.Unlock()
		return
	}

	if len(tokens) == 0 {
		// Wrap around to beginning
		log.Println("[scanner] Reached end of token list, resetting cursor")
		s.mu.Lock()
		s.progress.CurrentOffset = 0
		s.mu.Unlock()
		db.SetConfig("scanner_offset", "0")
		return
	}

	// Upsert each token into DB and submit work to miner
	scanned := 0
	for _, t := range tokens {
		if t.Tick == "" || t.TxID == "" {
			continue
		}

		changed, err := db.UpsertBSV20Token(t.Tick, t.TxID, int(t.Supply), int(t.Max), t.FundAddress)
		if err != nil {
			log.Printf("[scanner] DB upsert error for %s: %v", t.Tick, err)
			continue
		}

		// Submit validation work to the mining mempool
		workID := fmt.Sprintf("bsv20:%s", t.Tick)
		s.submit(workID, "validation", map[string]interface{}{
			"tick":   t.Tick,
			"txid":   t.TxID,
			"supply": int(t.Supply),
			"max":    int(t.Max),
			"height": int(t.Height),
		})

		if changed {
			scanned++
		}
	}

	// Advance cursor
	newOffset := offset + len(tokens)
	s.mu.Lock()
	s.progress.CurrentOffset = newOffset
	s.progress.TotalScanned += len(tokens)
	s.progress.LastScanAt = time.Now()
	s.progress.LastError = ""
	s.mu.Unlock()

	db.SetConfig("scanner_offset", strconv.Itoa(newOffset))

	// Update tick count from DB
	if count, err := db.GetTokenCount(); err == nil {
		s.mu.Lock()
		s.progress.TickCount = count
		s.mu.Unlock()
	}

	log.Printf("[scanner] Scanned %d tokens (offset=%d, %d new/updated)", len(tokens), newOffset, scanned)

	// Every 10th tick: fetch holders for the oldest-verified token
	if s.tickNum%10 == 0 {
		s.scanHolders()
	}

	// Every N ticks: cross-verify one token against on-chain data
	if s.cfg.VerifyInterval > 0 && s.tickNum%s.cfg.VerifyInterval == 0 {
		s.verifyTick()
	}
}

func (s *Service) scanHolders() {
	token, err := db.GetNextTokenForHolderScan()
	if err != nil {
		return // no indexed tokens yet
	}

	tick := ""
	if token.Name != nil {
		tick = *token.Name
	}
	if tick == "" {
		return
	}

	holders, err := s.client.FetchHolders(s.ctx, tick)
	if err != nil {
		log.Printf("[scanner] Holder fetch error for %s: %v", tick, err)
		return
	}

	// Convert to DB records
	records := make([]db.BSV20HolderRecord, len(holders))
	for i, h := range holders {
		records[i] = db.BSV20HolderRecord{
			Address: h.Address,
			Balance: int(h.Balance),
		}
	}

	if err := db.UpsertBSV20Holders(token.TokenID, records); err != nil {
		log.Printf("[scanner] Holder upsert error for %s: %v", tick, err)
		return
	}

	// Submit holder work to miner
	workID := fmt.Sprintf("holders:%s", tick)
	s.submit(workID, "validation", map[string]interface{}{
		"tick":          tick,
		"holder_count":  len(holders),
		"token_id":      token.TokenID,
	})

	s.mu.Lock()
	s.progress.TotalHolders += len(holders)
	s.mu.Unlock()

	log.Printf("[scanner] Scanned %d holders for %s", len(holders), tick)
}

func (s *Service) verifyTick() {
	token, err := db.GetNextTokenForVerification()
	if err != nil {
		return // no indexed tokens to verify
	}

	tick := ""
	if token.Name != nil {
		tick = *token.Name
	}
	if tick == "" {
		return
	}

	maxSupply := 0
	if token.MaxSupply != nil {
		maxSupply = *token.MaxSupply
	}

	result, err := s.verifier.VerifyToken(s.ctx, tick, token.TokenID, token.CurrentSupply, maxSupply)
	if err != nil {
		log.Printf("[scanner] Verify error for %s: %v", tick, err)
		return
	}

	// Update DB status
	if err := db.UpdateVerificationStatus(token.TokenID, result.Status); err != nil {
		log.Printf("[scanner] Failed to update verification status for %s: %v", tick, err)
		return
	}

	s.mu.Lock()
	s.progress.LastVerifyAt = time.Now()
	s.progress.LastVerifyTick = tick
	if result.Status == "cross-verified" {
		s.progress.TotalVerified++
	} else {
		s.progress.TotalDisputed++
	}
	s.mu.Unlock()

	log.Printf("[scanner] Verified: %s (%s) via %s", tick, result.Status, result.Source)

	// Submit dispute work if mismatch
	if result.Status == "disputed" {
		workID := fmt.Sprintf("dispute:%s", tick)
		s.submit(workID, "dispute", map[string]interface{}{
			"tick":     tick,
			"token_id": token.TokenID,
			"status":   result.Status,
			"reason":   result.Reason,
			"source":   result.Source,
		})
		log.Printf("[scanner] DISPUTE submitted for %s: %s", tick, result.Reason)
	}
}
