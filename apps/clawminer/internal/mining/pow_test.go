package mining

import (
	"strings"
	"testing"
)

func TestSerializeHeader(t *testing.T) {
	h := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "abc123",
		Timestamp:    1700000000000,
		Bits:         3,
		Nonce:        42,
		MinerAddress: "1TestAddress",
	}
	got := string(SerializeHeader(h))
	want := "1:0000000000000000000000000000000000000000000000000000000000000000:abc123:1700000000000:3:42:1TestAddress"
	if got != want {
		t.Errorf("SerializeHeader mismatch\ngot:  %s\nwant: %s", got, want)
	}
}

func TestCalculateBlockHash_DoubleSHA256(t *testing.T) {
	h := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "abc123",
		Timestamp:    1700000000000,
		Bits:         3,
		Nonce:        0,
		MinerAddress: "1TestAddress",
	}
	hash := CalculateBlockHash(h)

	// Hash should be 64 hex chars (SHA256 output)
	if len(hash) != 64 {
		t.Errorf("hash length = %d, want 64", len(hash))
	}

	// Same input should produce same hash (deterministic)
	hash2 := CalculateBlockHash(h)
	if hash != hash2 {
		t.Error("CalculateBlockHash is not deterministic")
	}
}

func TestCheckDifficulty(t *testing.T) {
	tests := []struct {
		hash string
		bits int
		want bool
	}{
		{"000abc", 3, true},
		{"000abc", 4, false},
		{"0000ab", 4, true},
		{"abc000", 3, false},
		{"000000", 6, true},
		{"100000", 1, false},
		{"0abcde", 1, true},
	}
	for _, tt := range tests {
		got := CheckDifficulty(tt.hash, tt.bits)
		if got != tt.want {
			t.Errorf("CheckDifficulty(%q, %d) = %v, want %v", tt.hash, tt.bits, got, tt.want)
		}
	}
}

func TestMineBlock_FindsSolution(t *testing.T) {
	h := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		Timestamp:    1700000000000,
		Bits:         1, // Very easy — just need one leading zero
		Nonce:        0,
		MinerAddress: "1TestMiner",
	}

	solution := MineBlock(h, 100000)
	if solution == nil {
		t.Fatal("MineBlock returned nil with difficulty 1 after 100k iterations")
	}

	if !strings.HasPrefix(solution.Hash, "0") {
		t.Errorf("solution hash %s does not start with '0'", solution.Hash)
	}
}

func TestMineBlock_ReturnsNilOnExhaustion(t *testing.T) {
	h := &BlockHeader{
		Version:      1,
		PrevHash:     "0000000000000000000000000000000000000000000000000000000000000000",
		MerkleRoot:   "abc",
		Timestamp:    1700000000000,
		Bits:         20, // Impossibly hard for 10 iterations
		Nonce:        0,
		MinerAddress: "1TestMiner",
	}

	solution := MineBlock(h, 10)
	if solution != nil {
		t.Error("MineBlock should return nil for impossibly high difficulty with low iterations")
	}
}
