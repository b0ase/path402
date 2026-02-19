package mining

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestCalculateMerkleRoot_Empty(t *testing.T) {
	root := CalculateMerkleRoot(nil)
	// SHA256("empty") — must match TypeScript: createHash('sha256').update('empty').digest('hex')
	h := sha256.Sum256([]byte("empty"))
	want := hex.EncodeToString(h[:])
	if root != want {
		t.Errorf("empty merkle root = %s, want %s", root, want)
	}
}

func TestCalculateMerkleRoot_Deterministic(t *testing.T) {
	items := []WorkItem{
		{ID: "tx-b", Type: "validation", Timestamp: 1},
		{ID: "tx-a", Type: "serve", Timestamp: 2},
		{ID: "tx-c", Type: "relay", Timestamp: 3},
	}

	root1 := CalculateMerkleRoot(items)
	root2 := CalculateMerkleRoot(items)

	if root1 != root2 {
		t.Error("MerkleRoot is not deterministic")
	}

	// Should sort IDs: tx-a|tx-b|tx-c then SHA256
	h := sha256.Sum256([]byte("tx-a|tx-b|tx-c"))
	want := hex.EncodeToString(h[:])
	if root1 != want {
		t.Errorf("merkle root = %s, want %s (SHA256 of sorted IDs joined by |)", root1, want)
	}
}

func TestCalculateMerkleRoot_OrderIndependent(t *testing.T) {
	items1 := []WorkItem{
		{ID: "aaa", Timestamp: 1},
		{ID: "bbb", Timestamp: 2},
	}
	items2 := []WorkItem{
		{ID: "bbb", Timestamp: 2},
		{ID: "aaa", Timestamp: 1},
	}

	if CalculateMerkleRoot(items1) != CalculateMerkleRoot(items2) {
		t.Error("MerkleRoot should be order-independent (sorts by ID)")
	}
}

func TestMempool_Dedup(t *testing.T) {
	m := NewMempool()
	m.Add(WorkItem{ID: "tx-1", Type: "validation", Timestamp: 1})
	m.Add(WorkItem{ID: "tx-1", Type: "validation", Timestamp: 1}) // dupe
	m.Add(WorkItem{ID: "tx-2", Type: "serve", Timestamp: 2})

	if m.Size() != 2 {
		t.Errorf("mempool size = %d, want 2", m.Size())
	}
}

func TestMempool_GetAndRemove(t *testing.T) {
	m := NewMempool()
	for i := 0; i < 20; i++ {
		m.Add(WorkItem{ID: "tx-" + string(rune('a'+i)), Timestamp: int64(i)})
	}

	batch := m.GetItems(5)
	if len(batch) != 5 {
		t.Errorf("GetItems(5) returned %d items", len(batch))
	}

	ids := make([]string, len(batch))
	for i, item := range batch {
		ids[i] = item.ID
	}
	m.RemoveItems(ids)

	if m.Size() != 15 {
		t.Errorf("after removing 5, size = %d, want 15", m.Size())
	}
}

func TestCreateBlockTemplate(t *testing.T) {
	items := []WorkItem{
		{ID: "work-1", Type: "heartbeat", Timestamp: 1},
	}
	header := CreateBlockTemplate(items, "prevhash", "1Miner", 3)

	if header.Version != 1 {
		t.Errorf("version = %d, want 1", header.Version)
	}
	if header.PrevHash != "prevhash" {
		t.Errorf("prevHash = %s", header.PrevHash)
	}
	if header.MinerAddress != "1Miner" {
		t.Errorf("minerAddress = %s", header.MinerAddress)
	}
	if header.Bits != 3 {
		t.Errorf("bits = %d, want 3", header.Bits)
	}
	if header.MerkleRoot == "" {
		t.Error("merkleRoot is empty")
	}
}
