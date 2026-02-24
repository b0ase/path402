// Package relay implements the SPV Relay Mesh for ClawMiner.
//
// It provides an in-memory transaction cache and HTTP endpoints so peers can
// fetch recently broadcast transactions even if they missed the GossipSub message.
package relay

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sync"
	"time"
)

const (
	maxCacheSize  = 10_000
	cacheTTL      = 1 * time.Hour
	pruneInterval = 60 * time.Second
)

var txidRe = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

// CachedTx holds a recently seen transaction.
type CachedTx struct {
	RawHex    string `json:"raw_hex"`
	Confirmed bool   `json:"confirmed"`
	BlockHash string `json:"block_hash,omitempty"`
	Source    string `json:"source,omitempty"`
	StoredAt  time.Time
}

// Service is the relay mesh cache and HTTP server.
type Service struct {
	mu        sync.RWMutex
	cache     map[string]*CachedTx
	startTime time.Time
	peerCount func() int // callback to get current peer count
	stopCh    chan struct{}
}

// New creates a relay service. peerCountFn should return the current gossip peer count.
func New(peerCountFn func() int) *Service {
	return &Service{
		cache:     make(map[string]*CachedTx),
		peerCount: peerCountFn,
		stopCh:    make(chan struct{}),
	}
}

// Start begins the background pruning goroutine.
func (s *Service) Start() {
	s.startTime = time.Now()
	go s.pruneLoop()
	log.Println("[relay] Service started")
}

// Stop halts the background pruning.
func (s *Service) Stop() {
	close(s.stopCh)
	log.Println("[relay] Service stopped")
}

// StoreTx stores a transaction in the in-memory cache.
func (s *Service) StoreTx(txid, rawHex string, confirmed bool, blockHash, source string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Evict oldest if at capacity
	if len(s.cache) >= maxCacheSize {
		s.evictOldest()
	}

	if existing, ok := s.cache[txid]; ok {
		// Update confirmation status if confirmed
		if confirmed && !existing.Confirmed {
			existing.Confirmed = true
			existing.BlockHash = blockHash
		}
		return
	}

	s.cache[txid] = &CachedTx{
		RawHex:    rawHex,
		Confirmed: confirmed,
		BlockHash: blockHash,
		Source:    source,
		StoredAt:  time.Now(),
	}
}

// GetTx retrieves a transaction from the cache.
func (s *Service) GetTx(txid string) *CachedTx {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cache[txid]
}

// HasTx checks if a transaction exists in the cache.
func (s *Service) HasTx(txid string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.cache[txid]
	return ok
}

// CacheSize returns the number of transactions in the cache.
func (s *Service) CacheSize() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.cache)
}

func (s *Service) evictOldest() {
	var oldestKey string
	var oldestTime time.Time
	first := true
	for k, v := range s.cache {
		if first || v.StoredAt.Before(oldestTime) {
			oldestKey = k
			oldestTime = v.StoredAt
			first = false
		}
	}
	if oldestKey != "" {
		delete(s.cache, oldestKey)
	}
}

func (s *Service) pruneLoop() {
	ticker := time.NewTicker(pruneInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.prune()
		}
	}
}

func (s *Service) prune() {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-cacheTTL)
	pruned := 0
	for k, v := range s.cache {
		if v.StoredAt.Before(cutoff) {
			delete(s.cache, k)
			pruned++
		}
	}
	if pruned > 0 {
		log.Printf("[relay] Pruned %d expired entries, %d remaining", pruned, len(s.cache))
	}
}

// ── HTTP Handlers ─────────────────────────────────────────────────

// RegisterRoutes mounts relay endpoints on the provided mux.
func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /relay/tx/{txid}", s.handleGetTx)
	mux.HandleFunc("GET /relay/tx/{txid}/status", s.handleGetTxStatus)
	mux.HandleFunc("GET /relay/health", s.handleHealth)
	mux.HandleFunc("POST /relay/tx", s.handlePostTx)
}

func (s *Service) handleGetTx(w http.ResponseWriter, r *http.Request) {
	txid := r.PathValue("txid")
	if txid == "" || !txidRe.MatchString(txid) {
		writeRelayError(w, 400, "invalid txid")
		return
	}

	tx := s.GetTx(txid)
	if tx == nil {
		writeRelayError(w, 404, "tx not found")
		return
	}

	writeRelayJSON(w, map[string]interface{}{
		"txid":       txid,
		"raw_hex":    tx.RawHex,
		"confirmed":  tx.Confirmed,
		"block_hash": tx.BlockHash,
	})
}

func (s *Service) handleGetTxStatus(w http.ResponseWriter, r *http.Request) {
	txid := r.PathValue("txid")
	if txid == "" || !txidRe.MatchString(txid) {
		writeRelayError(w, 400, "invalid txid")
		return
	}

	tx := s.GetTx(txid)
	writeRelayJSON(w, map[string]interface{}{
		"txid":       txid,
		"found":      tx != nil,
		"confirmed":  tx != nil && tx.Confirmed,
		"block_hash": func() string { if tx != nil { return tx.BlockHash }; return "" }(),
	})
}

func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
	peers := 0
	if s.peerCount != nil {
		peers = s.peerCount()
	}
	writeRelayJSON(w, map[string]interface{}{
		"peer_count": peers,
		"cache_size": s.CacheSize(),
		"uptime_ms":  time.Since(s.startTime).Milliseconds(),
	})
}

func (s *Service) handlePostTx(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Txid   string `json:"txid"`
		RawHex string `json:"raw_hex"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeRelayError(w, 400, fmt.Sprintf("invalid json: %v", err))
		return
	}

	if body.Txid == "" || body.RawHex == "" {
		writeRelayError(w, 400, "txid and raw_hex required")
		return
	}

	if !txidRe.MatchString(body.Txid) {
		writeRelayError(w, 400, "invalid txid format")
		return
	}

	nomesh := r.URL.Query().Get("nomesh") == "1"
	s.StoreTx(body.Txid, body.RawHex, false, "", "http")

	writeRelayJSON(w, map[string]interface{}{
		"stored":  true,
		"relayed": !nomesh,
	})
}

func writeRelayJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeRelayError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
