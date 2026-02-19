package mining

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNoopBroadcaster(t *testing.T) {
	b := &NoopBroadcaster{}
	result, err := b.BroadcastMint("abcdef1234567890abcdef1234567890")
	if err != nil {
		t.Fatalf("BroadcastMint: %v", err)
	}
	if !result.Success {
		t.Error("expected success")
	}
	if result.Action != "done" {
		t.Errorf("action = %s, want done", result.Action)
	}
}

func TestHTTPBroadcaster_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req mintRequest
		json.NewDecoder(r.Body).Decode(&req)

		if req.MerkleRoot == "" {
			t.Error("merkle_root is empty")
		}
		if req.MinerAddress == "" {
			t.Error("miner_address is empty")
		}

		json.NewEncoder(w).Encode(MintBroadcasterResult{
			Success: true,
			Txid:    "abc123def456",
			Amount:  1000,
			Action:  "done",
		})
	}))
	defer server.Close()

	b := NewHTTPBroadcaster(server.URL, "1TestAddress", "token123")
	result, err := b.BroadcastMint("merkleroot123")
	if err != nil {
		t.Fatalf("BroadcastMint: %v", err)
	}
	if !result.Success {
		t.Error("expected success")
	}
	if result.Txid != "abc123def456" {
		t.Errorf("txid = %s, want abc123def456", result.Txid)
	}
	if result.Amount != 1000 {
		t.Errorf("amount = %d, want 1000", result.Amount)
	}
}

func TestHTTPBroadcaster_Retry(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			json.NewEncoder(w).Encode(MintBroadcasterResult{
				Success: false,
				Error:   "utxo_spent",
				Action:  "retry",
			})
			return
		}
		json.NewEncoder(w).Encode(MintBroadcasterResult{
			Success: true,
			Txid:    "finally_worked",
			Amount:  500,
			Action:  "done",
		})
	}))
	defer server.Close()

	b := NewHTTPBroadcaster(server.URL, "1TestAddress", "token123")
	cfg := ClaimConfig{
		MaxRetries: 3,
		MinBackoff: 10 * time.Millisecond,
		MaxBackoff: 20 * time.Millisecond,
	}

	result := ClaimMint(b, "merkle123", cfg)
	if !result.Success {
		t.Errorf("expected success after retries, got: %s", result.Error)
	}
	if result.Txid != "finally_worked" {
		t.Errorf("txid = %s, want finally_worked", result.Txid)
	}
	if attempts != 3 {
		t.Errorf("attempts = %d, want 3", attempts)
	}
}

func TestHTTPBroadcaster_Stop(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(MintBroadcasterResult{
			Success: false,
			Error:   "mining exhausted",
			Action:  "stop",
		})
	}))
	defer server.Close()

	b := NewHTTPBroadcaster(server.URL, "1TestAddress", "token123")
	cfg := ClaimConfig{
		MaxRetries: 3,
		MinBackoff: 10 * time.Millisecond,
		MaxBackoff: 20 * time.Millisecond,
	}

	result := ClaimMint(b, "merkle123", cfg)
	if result.Success {
		t.Error("expected failure on stop")
	}
	if result.Action != "stop" {
		t.Errorf("action = %s, want stop", result.Action)
	}
}

func TestClaimMint_MaxRetries(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		json.NewEncoder(w).Encode(MintBroadcasterResult{
			Success: false,
			Error:   "utxo_spent",
			Action:  "retry",
		})
	}))
	defer server.Close()

	b := NewHTTPBroadcaster(server.URL, "1TestAddress", "token123")
	cfg := ClaimConfig{
		MaxRetries: 2,
		MinBackoff: 10 * time.Millisecond,
		MaxBackoff: 20 * time.Millisecond,
	}

	result := ClaimMint(b, "merkle123", cfg)
	if result.Success {
		t.Error("expected failure after max retries")
	}
	// MaxRetries=2 means 3 attempts total (0, 1, 2)
	if attempts != 3 {
		t.Errorf("attempts = %d, want 3", attempts)
	}
}
