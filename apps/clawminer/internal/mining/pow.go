package mining

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// BlockHeader mirrors the TypeScript BlockHeader.
type BlockHeader struct {
	Version      int    `json:"version"`
	PrevHash     string `json:"prevHash"`
	MerkleRoot   string `json:"merkleRoot"`
	Timestamp    int64  `json:"timestamp"`
	Bits         int    `json:"bits"` // Difficulty (leading zeros)
	Nonce        int    `json:"nonce"`
	MinerAddress string `json:"minerAddress"`
}

// PoWSolution is a solved block header with its hash.
type PoWSolution struct {
	Header BlockHeader `json:"header"`
	Hash   string      `json:"hash"`
}

// SerializeHeader formats the header for hashing.
// Format: {version}:{prevHash}:{merkleRoot}:{timestamp}:{bits}:{nonce}:{minerAddress}
func SerializeHeader(h *BlockHeader) []byte {
	s := fmt.Sprintf("%d:%s:%s:%d:%d:%d:%s",
		h.Version, h.PrevHash, h.MerkleRoot, h.Timestamp, h.Bits, h.Nonce, h.MinerAddress)
	return []byte(s)
}

// CalculateBlockHash performs double-SHA256: SHA256(SHA256(header)).
func CalculateBlockHash(h *BlockHeader) string {
	data := SerializeHeader(h)
	h1 := sha256.Sum256(data)
	h2 := sha256.Sum256(h1[:])
	return hex.EncodeToString(h2[:])
}

// CheckDifficulty returns true if hash starts with `bits` leading zeros.
func CheckDifficulty(hash string, bits int) bool {
	prefix := strings.Repeat("0", bits)
	return strings.HasPrefix(hash, prefix)
}

// MineBlock tries maxIterations nonces. Returns a solution or nil.
func MineBlock(header *BlockHeader, maxIterations int) *PoWSolution {
	nonce := header.Nonce

	for i := 0; i < maxIterations; i++ {
		header.Nonce = nonce + i

		// Refresh timestamp every 10k iterations
		if i%10000 == 0 {
			header.Timestamp = time.Now().UnixMilli()
		}

		hash := CalculateBlockHash(header)
		if CheckDifficulty(hash, header.Bits) {
			// Return a copy
			solved := *header
			return &PoWSolution{Header: solved, Hash: hash}
		}
	}
	return nil
}

// CheckTarget returns true if hash (hex string) is <= target (big.Int).
// This is more precise than CheckDifficulty — it allows fine-grained
// difficulty adjustment rather than 16x jumps between integer levels.
func CheckTarget(hash string, target *big.Int) bool {
	h := new(big.Int)
	h.SetString(hash, 16)
	return h.Cmp(target) <= 0
}

// MineBlockWithTarget tries maxIterations nonces against a big.Int target.
// Used when a DifficultyAdjuster provides fine-grained difficulty control.
func MineBlockWithTarget(header *BlockHeader, target *big.Int, maxIterations int) *PoWSolution {
	nonce := header.Nonce

	for i := 0; i < maxIterations; i++ {
		header.Nonce = nonce + i

		if i%10000 == 0 {
			header.Timestamp = time.Now().UnixMilli()
		}

		hash := CalculateBlockHash(header)
		if CheckTarget(hash, target) {
			solved := *header
			return &PoWSolution{Header: solved, Hash: hash}
		}
	}
	return nil
}
