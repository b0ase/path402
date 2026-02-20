package headers

import (
	"path/filepath"
	"testing"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

func setupTestDB(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	if err := db.Open(filepath.Join(dir, "test.db")); err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
}

func TestEnsureSchema(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	if err := store.EnsureSchema(); err != nil {
		t.Fatalf("EnsureSchema: %v", err)
	}
	// Calling twice should be idempotent
	if err := store.EnsureSchema(); err != nil {
		t.Fatalf("EnsureSchema (2nd call): %v", err)
	}
}

func TestHighestHeightEmpty(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	store.EnsureSchema()

	h, err := store.HighestHeight()
	if err != nil {
		t.Fatalf("HighestHeight: %v", err)
	}
	if h != -1 {
		t.Errorf("expected -1 for empty store, got %d", h)
	}
}

func TestCountEmpty(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	store.EnsureSchema()

	c, err := store.Count()
	if err != nil {
		t.Fatalf("Count: %v", err)
	}
	if c != 0 {
		t.Errorf("expected 0 for empty store, got %d", c)
	}
}

func TestInsertBatchAndQuery(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	store.EnsureSchema()

	headers := []BlockHeader{
		{Height: 100, Hash: "aaa", Version: 1, MerkleRoot: "mr100", Timestamp: 1000, Bits: 0x1d00ffff, Nonce: 42, PrevHash: "prev99"},
		{Height: 101, Hash: "bbb", Version: 1, MerkleRoot: "mr101", Timestamp: 1001, Bits: 0x1d00ffff, Nonce: 43, PrevHash: "aaa"},
		{Height: 102, Hash: "ccc", Version: 1, MerkleRoot: "mr102", Timestamp: 1002, Bits: 0x1d00ffff, Nonce: 44, PrevHash: "bbb"},
	}

	inserted, err := store.InsertBatch(headers)
	if err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}
	if inserted != 3 {
		t.Errorf("expected 3 inserted, got %d", inserted)
	}

	// Count
	c, _ := store.Count()
	if c != 3 {
		t.Errorf("expected count 3, got %d", c)
	}

	// HighestHeight
	h, _ := store.HighestHeight()
	if h != 102 {
		t.Errorf("expected highest 102, got %d", h)
	}

	// GetByHeight
	hdr, err := store.GetByHeight(101)
	if err != nil {
		t.Fatalf("GetByHeight: %v", err)
	}
	if hdr == nil {
		t.Fatal("expected header at height 101, got nil")
	}
	if hdr.Hash != "bbb" {
		t.Errorf("expected hash bbb, got %s", hdr.Hash)
	}

	// GetByHash
	hdr, err = store.GetByHash("ccc")
	if err != nil {
		t.Fatalf("GetByHash: %v", err)
	}
	if hdr == nil {
		t.Fatal("expected header with hash ccc, got nil")
	}
	if hdr.Height != 102 {
		t.Errorf("expected height 102, got %d", hdr.Height)
	}

	// GetByHeight - not found
	hdr, err = store.GetByHeight(999)
	if err != nil {
		t.Fatalf("GetByHeight (not found): %v", err)
	}
	if hdr != nil {
		t.Errorf("expected nil for missing height, got %+v", hdr)
	}
}

func TestInsertBatchResumeSafety(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	store.EnsureSchema()

	headers := []BlockHeader{
		{Height: 100, Hash: "aaa", Version: 1, MerkleRoot: "mr100", Timestamp: 1000, Bits: 0x1d00ffff, Nonce: 42, PrevHash: "prev99"},
	}
	store.InsertBatch(headers)

	// Insert again with same height — should be ignored (INSERT OR IGNORE)
	inserted, err := store.InsertBatch(headers)
	if err != nil {
		t.Fatalf("InsertBatch duplicate: %v", err)
	}
	if inserted != 0 {
		t.Errorf("expected 0 inserted for duplicate, got %d", inserted)
	}

	c, _ := store.Count()
	if c != 1 {
		t.Errorf("expected count still 1, got %d", c)
	}
}

func TestHasMerkleRoot(t *testing.T) {
	setupTestDB(t)
	store := NewHeaderStore()
	store.EnsureSchema()

	store.InsertBatch([]BlockHeader{
		{Height: 500, Hash: "h500", Version: 1, MerkleRoot: "deadbeef", Timestamp: 5000, Bits: 0x1d00ffff, Nonce: 1, PrevHash: "h499"},
	})

	found, err := store.HasMerkleRoot("deadbeef", 500)
	if err != nil {
		t.Fatalf("HasMerkleRoot: %v", err)
	}
	if !found {
		t.Error("expected merkle root found")
	}

	found, err = store.HasMerkleRoot("deadbeef", 501)
	if err != nil {
		t.Fatalf("HasMerkleRoot wrong height: %v", err)
	}
	if found {
		t.Error("expected merkle root not found at wrong height")
	}

	found, err = store.HasMerkleRoot("baadf00d", 500)
	if err != nil {
		t.Fatalf("HasMerkleRoot wrong root: %v", err)
	}
	if found {
		t.Error("expected wrong merkle root not found")
	}
}
