package headers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// pad32 returns a 64-char hex string padded from the given short string.
func pad32(s string) string {
	h := fmt.Sprintf("%x", s)
	if len(h) < 64 {
		h = strings.Repeat("0", 64-len(h)) + h
	}
	return h
}

// mockBHS creates an httptest server that mimics the Block Headers Service API.
// It serves headers for heights 0..tipHeight with properly hex-encoded hashes.
func mockBHS(tipHeight int) *httptest.Server {
	// Pre-compute hashes for each height
	hashes := make(map[int]string)
	for i := 0; i <= tipHeight; i++ {
		hashes[i] = fmt.Sprintf("%064x", i+1) // 0000...0001, 0000...0002, etc.
	}

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/api/v1/chain/tip/longest":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"header": map[string]interface{}{
					"height": tipHeight,
					"hash":   hashes[tipHeight],
				},
				"state":  "LONGEST_CHAIN",
				"height": tipHeight,
			})

		case r.URL.Path == "/api/v1/chain/header/byHeight":
			heightStr := r.URL.Query().Get("height")
			var height int
			fmt.Sscanf(heightStr, "%d", &height)
			hash, ok := hashes[height]
			if !ok {
				w.WriteHeader(404)
				json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
				return
			}
			prevHash := fmt.Sprintf("%064x", 0)
			if height > 0 {
				prevHash = hashes[height-1]
			}
			json.NewEncoder(w).Encode([]map[string]interface{}{
				{
					"height":            height,
					"hash":              hash,
					"version":           1,
					"merkleRoot":        fmt.Sprintf("%064x", height+100),
					"creationTimestamp":  1000 + height,
					"difficultyTarget":  0x1d00ffff,
					"nonce":             height,
					"prevBlockHash":     prevHash,
				},
			})

		case strings.HasPrefix(r.URL.Path, "/api/v1/chain/header/state/"):
			hash := r.URL.Path[len("/api/v1/chain/header/state/"):]
			// Find the height for this hash
			height := 0
			for h, hh := range hashes {
				if hh == hash {
					height = h
					break
				}
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"header": map[string]interface{}{
					"height": height,
					"hash":   hash,
				},
				"state":  "LONGEST_CHAIN",
				"height": height,
			})

		default:
			w.WriteHeader(404)
		}
	}))
}

func TestSyncServiceDisabledWithoutURL(t *testing.T) {
	dir := t.TempDir()
	db.Open(filepath.Join(dir, "test.db"))
	defer db.Close()

	store := NewHeaderStore()
	store.EnsureSchema()

	svc := NewSyncService(SyncConfig{
		BHSURL:       "", // empty — disabled
		SyncOnBoot:   true,
		PollInterval: 100 * time.Millisecond,
	}, store)

	svc.Start()
	time.Sleep(50 * time.Millisecond)

	p := svc.Progress()
	if p.IsSyncing {
		t.Error("expected not syncing when URL is empty")
	}

	svc.Stop()
}

func TestSyncServiceProgress(t *testing.T) {
	dir := t.TempDir()
	db.Open(filepath.Join(dir, "test.db"))
	defer db.Close()

	store := NewHeaderStore()
	store.EnsureSchema()

	srv := mockBHS(4)
	defer srv.Close()

	svc := NewSyncService(SyncConfig{
		BHSURL:       srv.URL,
		SyncOnBoot:   true,
		PollInterval: 24 * time.Hour, // don't poll during test
		BatchSize:    10,
		MaxRetries:   2,
	}, store)

	svc.Start()

	// Wait for initial sync to complete
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		p := svc.Progress()
		if !p.IsSyncing && p.TotalHeaders >= 5 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	svc.Stop()

	p := svc.Progress()
	if p.TotalHeaders < 5 {
		t.Errorf("expected at least 5 headers, got %d", p.TotalHeaders)
	}
	if p.HighestHeight < 4 {
		t.Errorf("expected highest height >= 4, got %d", p.HighestHeight)
	}
	if p.ChainTipHeight != 4 {
		t.Errorf("expected chain tip 4, got %d", p.ChainTipHeight)
	}

	// Verify headers in store
	count, _ := store.Count()
	if count < 5 {
		t.Errorf("expected at least 5 in store, got %d", count)
	}
}

func TestSyncConfigDefaults(t *testing.T) {
	svc := NewSyncService(SyncConfig{}, NewHeaderStore())
	if svc.cfg.PollInterval != 30*time.Second {
		t.Errorf("expected default poll interval 30s, got %v", svc.cfg.PollInterval)
	}
	if svc.cfg.BatchSize != 2000 {
		t.Errorf("expected default batch size 2000, got %d", svc.cfg.BatchSize)
	}
	if svc.cfg.MaxRetries != 5 {
		t.Errorf("expected default max retries 5, got %d", svc.cfg.MaxRetries)
	}
}
