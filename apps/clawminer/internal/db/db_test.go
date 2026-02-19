package db

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestDB(t *testing.T) func() {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	if err := Open(path); err != nil {
		t.Fatalf("Open: %v", err)
	}
	return func() {
		Close()
		os.Remove(path)
	}
}

func TestOpenClose(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	if DB() == nil {
		t.Fatal("DB() returned nil after Open")
	}
}

func TestGetNodeID(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	id, err := GetNodeID()
	if err != nil {
		t.Fatalf("GetNodeID: %v", err)
	}
	if len(id) != 32 {
		t.Errorf("node_id length = %d, want 32 (hex of 16 random bytes)", len(id))
	}
}

func TestConfigGetSet(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	if err := SetConfig("test_key", "test_value"); err != nil {
		t.Fatalf("SetConfig: %v", err)
	}

	val, err := GetConfig("test_key")
	if err != nil {
		t.Fatalf("GetConfig: %v", err)
	}
	if val != "test_value" {
		t.Errorf("GetConfig = %q, want %q", val, "test_value")
	}

	// Overwrite
	SetConfig("test_key", "new_value")
	val, _ = GetConfig("test_key")
	if val != "new_value" {
		t.Errorf("after overwrite: %q, want %q", val, "new_value")
	}
}

func TestTokenCRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	name := "Test Token"
	via := "gossip"
	tok := &Token{
		TokenID:       "$test/token",
		Name:          &name,
		BasePriceSats: 500,
		PricingModel:  "alice_bond",
		CurrentSupply: 10,
		DiscoveredVia: &via,
	}

	if err := InsertToken(tok); err != nil {
		t.Fatalf("InsertToken: %v", err)
	}

	got, err := GetToken("$test/token")
	if err != nil {
		t.Fatalf("GetToken: %v", err)
	}
	if *got.Name != "Test Token" {
		t.Errorf("name = %v", got.Name)
	}
	if got.CurrentSupply != 10 {
		t.Errorf("supply = %d", got.CurrentSupply)
	}

	all, err := GetAllTokens()
	if err != nil {
		t.Fatalf("GetAllTokens: %v", err)
	}
	if len(all) != 1 {
		t.Errorf("GetAllTokens count = %d, want 1", len(all))
	}
}

func TestPeerCRUD(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	via := "bootstrap"
	p := &Peer{
		PeerID:        "peer-abc",
		Host:          "192.168.1.1",
		Port:          4020,
		DiscoveredVia: &via,
	}

	if err := UpsertPeer(p); err != nil {
		t.Fatalf("UpsertPeer: %v", err)
	}

	peers, err := GetActivePeers()
	if err != nil {
		t.Fatalf("GetActivePeers: %v", err)
	}
	if len(peers) != 1 {
		t.Fatalf("GetActivePeers count = %d, want 1", len(peers))
	}
	if peers[0].Host != "192.168.1.1" {
		t.Errorf("host = %s", peers[0].Host)
	}

	// Reputation
	if err := UpdateReputation("peer-abc", 5); err != nil {
		t.Fatalf("UpdateReputation: %v", err)
	}
}

func TestPortfolioSummary_Empty(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	summary, err := GetPortfolioSummary()
	if err != nil {
		t.Fatalf("GetPortfolioSummary: %v", err)
	}
	if summary.TotalSpent != 0 {
		t.Errorf("TotalSpent = %d, want 0", summary.TotalSpent)
	}
}
