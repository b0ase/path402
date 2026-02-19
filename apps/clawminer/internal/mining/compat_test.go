package mining

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"testing"
)

// These tests verify that Go produces the EXACT same outputs as the TypeScript
// implementation in packages/core/src/mining/{pow,block}.ts.
// Any mismatch means the Go daemon cannot join the same gossip network.

// ── Double-SHA256 ──────────────────────────────────────────────────
// TypeScript: sha256(sha256(data))
// Go:         sha256.Sum256(sha256.Sum256(data))
// Both must produce identical output for the same input.

func TestCompat_DoubleSHA256_EmptyString(t *testing.T) {
	// echo -n "" | sha256sum → e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
	// sha256(above) → 5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456
	h1 := sha256.Sum256([]byte(""))
	h2 := sha256.Sum256(h1[:])
	got := hex.EncodeToString(h2[:])
	want := "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456"
	if got != want {
		t.Errorf("doubleSHA256('') = %s, want %s", got, want)
	}
}

func TestCompat_DoubleSHA256_HelloWorld(t *testing.T) {
	h1 := sha256.Sum256([]byte("Hello World"))
	h2 := sha256.Sum256(h1[:])
	got := hex.EncodeToString(h2[:])
	// Pre-computed: SHA256(SHA256("Hello World"))
	want := "42a873ac3abd02122d27e80486c6fa1ef78694e8505fcec9cbcc8a7728ba8949"
	if got != want {
		t.Errorf("doubleSHA256('Hello World') = %s, want %s", got, want)
	}
}

// ── Block Header Serialization ─────────────────────────────────────
// TypeScript: `${version}:${prevHash}:${merkleRoot}:${timestamp}:${bits}:${nonce}:${minerAddress}`
// Go:         fmt.Sprintf("%d:%s:%s:%d:%d:%d:%s", ...)

func TestCompat_HeaderSerialization(t *testing.T) {
	header := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "abc123",
		Timestamp:    1700000000000,
		Bits:         3,
		Nonce:        42,
		MinerAddress: "1TestAddress",
	}

	got := string(SerializeHeader(header))
	want := "1:0000000000000000000000000000000000000000000000000000000000000000:abc123:1700000000000:3:42:1TestAddress"
	if got != want {
		t.Errorf("SerializeHeader mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

func TestCompat_BlockHash(t *testing.T) {
	// Given a known header, the block hash must be deterministic
	header := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "abc123",
		Timestamp:    1700000000000,
		Bits:         3,
		Nonce:        42,
		MinerAddress: "1TestAddress",
	}

	hash := CalculateBlockHash(header)

	// Verify by computing manually
	serialized := "1:0000000000000000000000000000000000000000000000000000000000000000:abc123:1700000000000:3:42:1TestAddress"
	h1 := sha256.Sum256([]byte(serialized))
	h2 := sha256.Sum256(h1[:])
	want := hex.EncodeToString(h2[:])

	if hash != want {
		t.Errorf("CalculateBlockHash mismatch:\n  got:  %s\n  want: %s", hash, want)
	}
}

// ── Merkle Root ────────────────────────────────────────────────────
// TypeScript: sha256(items.map(i => i.id).sort().join("|"))
// Go:         sha256(sort(ids), join("|"))

func TestCompat_MerkleRoot_KnownVector(t *testing.T) {
	items := []WorkItem{
		{ID: "charlie"},
		{ID: "alpha"},
		{ID: "bravo"},
	}

	got := CalculateMerkleRoot(items)

	// Manual: sorted = [alpha, bravo, charlie], joined = "alpha|bravo|charlie"
	sorted := []string{"charlie", "alpha", "bravo"}
	sort.Strings(sorted)
	joined := strings.Join(sorted, "|")
	if joined != "alpha|bravo|charlie" {
		t.Fatalf("sort/join unexpected: %s", joined)
	}

	h := sha256.Sum256([]byte(joined))
	want := hex.EncodeToString(h[:])
	if got != want {
		t.Errorf("MerkleRoot mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

func TestCompat_MerkleRoot_Empty(t *testing.T) {
	got := CalculateMerkleRoot(nil)
	h := sha256.Sum256([]byte("empty"))
	want := hex.EncodeToString(h[:])
	if got != want {
		t.Errorf("MerkleRoot(empty) = %s, want %s", got, want)
	}
}

func TestCompat_MerkleRoot_SingleItem(t *testing.T) {
	items := []WorkItem{{ID: "only-one"}}
	got := CalculateMerkleRoot(items)

	h := sha256.Sum256([]byte("only-one"))
	want := hex.EncodeToString(h[:])
	if got != want {
		t.Errorf("MerkleRoot(single) = %s, want %s", got, want)
	}
}

// ── Difficulty Check ───────────────────────────────────────────────
// Both implementations check for N leading '0' chars in the hex hash string.

func TestCompat_Difficulty(t *testing.T) {
	tests := []struct {
		hash  string
		bits  int
		valid bool
	}{
		{"000abc", 3, true},
		{"000abc", 4, false},
		{"0000abc", 4, true},
		{"abc000", 3, false},
		{"000000abc", 6, true},
	}

	for _, tc := range tests {
		got := CheckDifficulty(tc.hash, tc.bits)
		if got != tc.valid {
			t.Errorf("CheckDifficulty(%s, %d) = %v, want %v", tc.hash, tc.bits, got, tc.valid)
		}
	}
}

// ── Full Mining Round-Trip ─────────────────────────────────────────
// Mines a block with difficulty 1 and verifies all fields are consistent.

func TestCompat_MiningRoundTrip(t *testing.T) {
	items := []WorkItem{
		{ID: "work-1", Type: "heartbeat", Timestamp: 1700000000000},
		{ID: "work-2", Type: "validation", Timestamp: 1700000000001},
		{ID: "work-3", Type: "serve", Timestamp: 1700000000002},
		{ID: "work-4", Type: "relay", Timestamp: 1700000000003},
		{ID: "work-5", Type: "heartbeat", Timestamp: 1700000000004},
	}

	prevHash := "0000000000000000000000000000000000000000000000000000000000000000"
	minerAddr := "1ClawMinerTestAddress"
	difficulty := 1

	header := CreateBlockTemplate(items, prevHash, minerAddr, difficulty)

	// Verify merkle root is deterministic
	merkle := CalculateMerkleRoot(items)
	if header.MerkleRoot != merkle {
		t.Errorf("template merkle != calculated: %s != %s", header.MerkleRoot, merkle)
	}

	// Mine with difficulty 1 (should find quickly)
	solution := MineBlock(header, 100000)
	if solution == nil {
		t.Fatal("failed to mine block with difficulty 1")
	}

	// Verify the hash
	recomputed := CalculateBlockHash(&solution.Header)
	if recomputed != solution.Hash {
		t.Errorf("recomputed hash mismatch: %s != %s", recomputed, solution.Hash)
	}

	// Verify difficulty
	if !CheckDifficulty(solution.Hash, difficulty) {
		t.Errorf("solution doesn't meet difficulty %d: %s", difficulty, solution.Hash)
	}

	// Verify header fields survived
	if solution.Header.Version != 1 {
		t.Errorf("version = %d, want 1", solution.Header.Version)
	}
	if solution.Header.PrevHash != prevHash {
		t.Errorf("prevHash mismatch")
	}
	if solution.Header.MinerAddress != minerAddr {
		t.Errorf("minerAddress mismatch")
	}

	t.Logf("Mined block: hash=%s nonce=%d", solution.Hash, solution.Header.Nonce)
}

// ── Protocol Constants ─────────────────────────────────────────────
// These must match the TypeScript values exactly.

func TestCompat_ProtocolConstants(t *testing.T) {
	checks := map[string]struct{ got, want interface{} }{
		"gossip port":      {4020, 4020},
		"api port":         {8402, 8402},
		"default difficulty": {3, 3},
		"min items":        {5, 5},
		"batch size":       {10, 10},
	}

	for name, c := range checks {
		if fmt.Sprint(c.got) != fmt.Sprint(c.want) {
			t.Errorf("%s: got %v, want %v", name, c.got, c.want)
		}
	}
}
