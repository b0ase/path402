package mining

import (
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

// mockUTXOProvider returns pre-configured UTXOs for testing.
type mockUTXOProvider struct {
	utxos []UTXO
	err   error
}

func (m *mockUTXOProvider) GetUTXOs(address string) ([]UTXO, error) {
	return m.utxos, m.err
}

func TestBSVBroadcaster_Create(t *testing.T) {
	privKey, err := ec.NewPrivateKey()
	if err != nil {
		t.Fatalf("NewPrivateKey: %v", err)
	}

	b, err := NewBSVBroadcaster(BSVBroadcasterConfig{
		PrivateKey: privKey,
		ArcURL:     "https://arc.taal.com",
		TokenID:    "test_token_123",
		UTXOs:      &mockUTXOProvider{},
	})
	if err != nil {
		t.Fatalf("NewBSVBroadcaster: %v", err)
	}

	if b.address == nil {
		t.Error("address is nil")
	}
	if b.arcURL != "https://arc.taal.com" {
		t.Errorf("arcURL = %s, want https://arc.taal.com", b.arcURL)
	}
}

func TestBSVBroadcaster_NoUTXOs(t *testing.T) {
	privKey, _ := ec.NewPrivateKey()

	b, _ := NewBSVBroadcaster(BSVBroadcasterConfig{
		PrivateKey: privKey,
		TokenID:    "token123",
		UTXOs:      &mockUTXOProvider{utxos: nil},
	})

	result, err := b.BroadcastMint("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")
	if err != nil {
		t.Fatalf("BroadcastMint: %v", err)
	}

	// Should return retry action when no UTXOs available
	if result.Success {
		t.Error("expected failure when no UTXOs")
	}
	if result.Action != "retry" {
		t.Errorf("action = %s, want retry", result.Action)
	}
}

func TestBSVBroadcaster_DefaultArcURL(t *testing.T) {
	privKey, _ := ec.NewPrivateKey()

	b, _ := NewBSVBroadcaster(BSVBroadcasterConfig{
		PrivateKey: privKey,
		TokenID:    "token123",
		UTXOs:      &mockUTXOProvider{},
	})

	if b.arcURL != "https://arc.taal.com" {
		t.Errorf("default arcURL = %s, want https://arc.taal.com", b.arcURL)
	}
}

func TestIsUTXOContention(t *testing.T) {
	tests := []struct {
		msg  string
		want bool
	}{
		{"utxo_spent: already consumed", true},
		{"txn-mempool-conflict", true},
		{"Missing inputs", true},
		{"double spend detected", true},
		{"insufficient fee", false},
		{"network error", false},
	}

	for _, tc := range tests {
		got := isUTXOContention(tc.msg)
		if got != tc.want {
			t.Errorf("isUTXOContention(%q) = %v, want %v", tc.msg, got, tc.want)
		}
	}
}
