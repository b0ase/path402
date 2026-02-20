package headers

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/transaction/chaintracker/headers_client"
)

// SyncConfig configures the header sync service.
type SyncConfig struct {
	BHSURL       string
	BHSAPIKey    string
	SyncOnBoot   bool
	PollInterval time.Duration
	BatchSize    int
	MaxRetries   int
}

// SyncService manages background synchronisation of BSV block headers from a
// Block Headers Service (BHS) into the local SQLite store.
type SyncService struct {
	cfg      SyncConfig
	store    *HeaderStore
	client   *headers_client.Client
	mu       sync.RWMutex
	progress SyncProgress
	ctx      context.Context
	cancel   context.CancelFunc
	done     chan struct{}
}

// NewSyncService creates a new header sync service.
func NewSyncService(cfg SyncConfig, store *HeaderStore) *SyncService {
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 30 * time.Second
	}
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 2000
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 5
	}

	ctx, cancel := context.WithCancel(context.Background())
	return &SyncService{
		cfg:    cfg,
		store:  store,
		client: &headers_client.Client{Url: cfg.BHSURL, ApiKey: cfg.BHSAPIKey},
		ctx:    ctx,
		cancel: cancel,
		done:   make(chan struct{}),
	}
}

// Start begins the header sync process. If no BHS URL is configured, it logs
// and returns without starting. Otherwise it runs an initial sync followed by
// a periodic poll loop.
func (s *SyncService) Start() {
	if s.cfg.BHSURL == "" {
		log.Println("[headers] No BHS URL configured — header sync disabled")
		close(s.done)
		return
	}

	go s.run()
}

// Stop cancels the sync and waits for the goroutine to exit.
func (s *SyncService) Stop() {
	s.cancel()
	<-s.done
	log.Println("[headers] Sync service stopped")
}

// Progress returns a snapshot of current sync progress.
func (s *SyncService) Progress() SyncProgress {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.progress
}

// ValidateMerkleRoot checks whether a merkle root is valid for a given height.
// Checks local DB first, falls back to remote BHS if not found locally.
func (s *SyncService) ValidateMerkleRoot(root string, height int) (bool, error) {
	// Check local store first
	found, err := s.store.HasMerkleRoot(root, height)
	if err != nil {
		return false, fmt.Errorf("local lookup: %w", err)
	}
	if found {
		return true, nil
	}

	// Fall back to remote BHS if configured
	if s.cfg.BHSURL == "" {
		return false, nil
	}

	rootBytes, err := hex.DecodeString(root)
	if err != nil {
		return false, fmt.Errorf("decode root hex: %w", err)
	}
	var rootHash chainhash.Hash
	copy(rootHash[:], rootBytes)

	valid, err := s.client.IsValidRootForHeight(s.ctx, &rootHash, uint32(height))
	if err != nil {
		return false, fmt.Errorf("remote validate: %w", err)
	}
	return valid, nil
}

func (s *SyncService) run() {
	defer close(s.done)

	if s.cfg.SyncOnBoot {
		s.initialSync()
	}

	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.incrementalSync()
		}
	}
}

func (s *SyncService) initialSync() {
	log.Println("[headers] Starting initial sync...")

	s.mu.Lock()
	s.progress.IsSyncing = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.progress.IsSyncing = false
		s.progress.LastSyncedAt = time.Now().Unix()
		s.mu.Unlock()
	}()

	// Get remote chain tip
	tipHeight, err := s.client.CurrentHeight(s.ctx)
	if err != nil {
		log.Printf("[headers] Failed to get chain tip: %v", err)
		return
	}

	s.mu.Lock()
	s.progress.ChainTipHeight = int(tipHeight)
	s.mu.Unlock()

	// Get local highest height
	localHeight, err := s.store.HighestHeight()
	if err != nil {
		log.Printf("[headers] Failed to get local height: %v", err)
		return
	}

	if localHeight >= int(tipHeight) {
		count, _ := s.store.Count()
		log.Printf("[headers] Already synced to tip %d (%d headers stored)", tipHeight, count)
		s.mu.Lock()
		s.progress.TotalHeaders = count
		s.progress.HighestHeight = localHeight
		s.mu.Unlock()
		return
	}

	log.Printf("[headers] Syncing from height %d to %d (%d headers to fetch)",
		localHeight+1, tipHeight, int(tipHeight)-localHeight)

	s.fetchRange(localHeight+1, int(tipHeight))

	count, _ := s.store.Count()
	highest, _ := s.store.HighestHeight()
	s.mu.Lock()
	s.progress.TotalHeaders = count
	s.progress.HighestHeight = highest
	s.mu.Unlock()

	log.Printf("[headers] Initial sync complete: %d headers stored, highest=%d", count, highest)
}

func (s *SyncService) incrementalSync() {
	tipHeight, err := s.client.CurrentHeight(s.ctx)
	if err != nil {
		log.Printf("[headers] Poll: failed to get chain tip: %v", err)
		return
	}

	localHeight, err := s.store.HighestHeight()
	if err != nil {
		log.Printf("[headers] Poll: failed to get local height: %v", err)
		return
	}

	s.mu.Lock()
	s.progress.ChainTipHeight = int(tipHeight)
	s.mu.Unlock()

	if localHeight >= int(tipHeight) {
		return
	}

	s.mu.Lock()
	s.progress.IsSyncing = true
	s.mu.Unlock()

	s.fetchRange(localHeight+1, int(tipHeight))

	count, _ := s.store.Count()
	highest, _ := s.store.HighestHeight()
	s.mu.Lock()
	s.progress.TotalHeaders = count
	s.progress.HighestHeight = highest
	s.progress.IsSyncing = false
	s.progress.LastSyncedAt = time.Now().Unix()
	s.mu.Unlock()
}

func (s *SyncService) fetchRange(from, to int) {
	batch := make([]BlockHeader, 0, s.cfg.BatchSize)
	fetched := 0
	retries := 0

	for height := from; height <= to; height++ {
		select {
		case <-s.ctx.Done():
			// Flush remaining batch before exit
			if len(batch) > 0 {
				s.store.InsertBatch(batch)
			}
			return
		default:
		}

		header, err := s.client.BlockByHeight(s.ctx, uint32(height))
		if err != nil {
			retries++
			if retries > s.cfg.MaxRetries {
				log.Printf("[headers] Too many errors at height %d, pausing sync: %v", height, err)
				break
			}
			log.Printf("[headers] Error at height %d (retry %d/%d): %v", height, retries, s.cfg.MaxRetries, err)
			height-- // retry same height
			time.Sleep(time.Duration(retries) * time.Second)
			continue
		}
		retries = 0

		batch = append(batch, BlockHeader{
			Height:     int(header.Height),
			Hash:       hex.EncodeToString(header.Hash[:]),
			Version:    int(header.Version),
			MerkleRoot: hex.EncodeToString(header.MerkleRoot[:]),
			Timestamp:  int(header.Timestamp),
			Bits:       int(header.Bits),
			Nonce:      int(header.Nonce),
			PrevHash:   hex.EncodeToString(header.PreviousBlock[:]),
		})

		if len(batch) >= s.cfg.BatchSize {
			inserted, err := s.store.InsertBatch(batch)
			if err != nil {
				log.Printf("[headers] Batch insert error: %v", err)
			}
			fetched += inserted
			batch = batch[:0]

			s.mu.Lock()
			s.progress.TotalHeaders += inserted
			s.progress.HighestHeight = height
			s.mu.Unlock()
		}

		// Log progress every 10K headers
		if (height-from) > 0 && (height-from)%10000 == 0 {
			log.Printf("[headers] Progress: %d/%d headers (%.1f%%)",
				height-from, to-from, float64(height-from)/float64(to-from)*100)
		}
	}

	// Flush remaining batch
	if len(batch) > 0 {
		inserted, err := s.store.InsertBatch(batch)
		if err != nil {
			log.Printf("[headers] Final batch insert error: %v", err)
		}
		fetched += inserted
	}

	_ = fetched
}
