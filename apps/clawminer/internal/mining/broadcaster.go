package mining

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"
)

// MintBroadcasterResult is the outcome of a broadcast attempt.
type MintBroadcasterResult struct {
	Success bool   `json:"success"`
	Txid    string `json:"txid,omitempty"`
	Amount  int64  `json:"amount,omitempty"`
	Error   string `json:"error,omitempty"`
	Action  string `json:"action"` // "done", "retry", "stop"
}

// MintBroadcaster broadcasts a mined block's merkle root on-chain.
type MintBroadcaster interface {
	BroadcastMint(merkleRoot string) (*MintBroadcasterResult, error)
}

// ClaimConfig configures the claim retry logic.
type ClaimConfig struct {
	MaxRetries int
	MinBackoff time.Duration
	MaxBackoff time.Duration
}

// DefaultClaimConfig returns the standard retry parameters.
func DefaultClaimConfig() ClaimConfig {
	return ClaimConfig{
		MaxRetries: 3,
		MinBackoff: 2 * time.Second,
		MaxBackoff: 5 * time.Second,
	}
}

// ClaimMint attempts to broadcast a mint with retry logic.
// Matches the TypeScript claimMint() behavior:
//   - On "retry" (UTXO contention), wait 2-5s and retry up to MaxRetries times.
//   - On "stop" (mining exhausted), return immediately.
//   - On success, return the result.
func ClaimMint(broadcaster MintBroadcaster, merkleRoot string, cfg ClaimConfig) *MintBroadcasterResult {
	for attempt := 0; attempt <= cfg.MaxRetries; attempt++ {
		result, err := broadcaster.BroadcastMint(merkleRoot)
		if err != nil {
			log.Printf("[mining] Broadcast error (attempt %d/%d): %v", attempt+1, cfg.MaxRetries+1, err)
			if attempt < cfg.MaxRetries {
				backoff := cfg.MinBackoff + time.Duration(rand.Int63n(int64(cfg.MaxBackoff-cfg.MinBackoff)))
				time.Sleep(backoff)
				continue
			}
			return &MintBroadcasterResult{
				Success: false,
				Error:   err.Error(),
				Action:  "done",
			}
		}

		switch result.Action {
		case "retry":
			if attempt < cfg.MaxRetries {
				backoff := cfg.MinBackoff + time.Duration(rand.Int63n(int64(cfg.MaxBackoff-cfg.MinBackoff)))
				log.Printf("[mining] UTXO contention, retrying in %v (attempt %d/%d)", backoff, attempt+1, cfg.MaxRetries+1)
				time.Sleep(backoff)
				continue
			}
			return result
		case "stop":
			log.Println("[mining] Mining exhausted — no more tokens to mint")
			return result
		default:
			return result
		}
	}
	return &MintBroadcasterResult{
		Success: false,
		Error:   "max retries exceeded",
		Action:  "done",
	}
}

// ── HTTP Broadcaster ─────────────────────────────────────────────
// Calls an external HTM mint service (TypeScript sCrypt bridge)
// running at a configurable URL. This keeps sCrypt/CJS deps out
// of the Go binary.

// HTTPBroadcaster calls an external mint service over HTTP.
type HTTPBroadcaster struct {
	Endpoint     string // e.g. "http://127.0.0.1:8403/mint"
	MinerAddress string
	TokenID      string
	client       *http.Client
}

// NewHTTPBroadcaster creates a broadcaster pointing at the HTM service.
func NewHTTPBroadcaster(endpoint, minerAddress, tokenID string) *HTTPBroadcaster {
	return &HTTPBroadcaster{
		Endpoint:     endpoint,
		MinerAddress: minerAddress,
		TokenID:      tokenID,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type mintRequest struct {
	MerkleRoot   string `json:"merkle_root"`
	MinerAddress string `json:"miner_address"`
	TokenID      string `json:"token_id"`
}

// BroadcastMint sends the merkle root to the HTM mint service.
func (b *HTTPBroadcaster) BroadcastMint(merkleRoot string) (*MintBroadcasterResult, error) {
	body, err := json.Marshal(mintRequest{
		MerkleRoot:   merkleRoot,
		MinerAddress: b.MinerAddress,
		TokenID:      b.TokenID,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := b.client.Post(b.Endpoint, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("HTTP post: %w", err)
	}
	defer resp.Body.Close()

	var result MintBroadcasterResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && !result.Success {
		if result.Action == "" {
			result.Action = "done"
		}
	}

	return &result, nil
}

// ── No-op Broadcaster ────────────────────────────────────────────
// Used when no HTM token is configured (logs only).

// NoopBroadcaster logs blocks but does not broadcast on-chain.
type NoopBroadcaster struct{}

// BroadcastMint logs the merkle root without broadcasting.
func (n *NoopBroadcaster) BroadcastMint(merkleRoot string) (*MintBroadcasterResult, error) {
	log.Printf("[mining] Block mined (no broadcaster configured), merkle root: %s", merkleRoot[:16])
	return &MintBroadcasterResult{
		Success: true,
		Action:  "done",
	}, nil
}
