package mining

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
)

// WorkItem represents a unit of useful indexing work.
type WorkItem struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"` // validation, serve, relay, heartbeat
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

// IndexerBlock is a mined block of work items.
type IndexerBlock struct {
	Header BlockHeader `json:"header"`
	Items  []WorkItem  `json:"items"`
	Hash   string      `json:"hash"`
}

// CalculateMerkleRoot hashes the sorted item IDs.
// Simplified implementation matching the TypeScript version.
func CalculateMerkleRoot(items []WorkItem) string {
	if len(items) == 0 {
		h := sha256.Sum256([]byte("empty"))
		return hex.EncodeToString(h[:])
	}

	ids := make([]string, len(items))
	for i, item := range items {
		ids[i] = item.ID
	}
	sort.Strings(ids)
	data := strings.Join(ids, "|")

	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

// CreateBlockTemplate creates a block header from mempool items.
func CreateBlockTemplate(items []WorkItem, prevHash, minerAddress string, difficulty int) *BlockHeader {
	return &BlockHeader{
		Version:      1,
		PrevHash:     prevHash,
		MerkleRoot:   CalculateMerkleRoot(items),
		Timestamp:    0, // set by miner
		Bits:         difficulty,
		Nonce:        0,
		MinerAddress: minerAddress,
	}
}

// IndexerMempool is an in-memory pool of unmined work items.
type IndexerMempool struct {
	items []WorkItem
	mu    sync.Mutex
}

func NewMempool() *IndexerMempool {
	return &IndexerMempool{}
}

// Add appends a work item, deduplicating by ID.
func (m *IndexerMempool) Add(item WorkItem) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.items {
		if existing.ID == item.ID {
			return
		}
	}
	m.items = append(m.items, item)
}

// GetItems returns up to count items from the front.
func (m *IndexerMempool) GetItems(count int) []WorkItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	if count > len(m.items) {
		count = len(m.items)
	}
	result := make([]WorkItem, count)
	copy(result, m.items[:count])
	return result
}

// RemoveItems removes items by ID.
func (m *IndexerMempool) RemoveItems(ids []string) {
	idSet := make(map[string]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	filtered := m.items[:0]
	for _, item := range m.items {
		if !idSet[item.ID] {
			filtered = append(filtered, item)
		}
	}
	m.items = filtered
}

// Size returns the number of items in the mempool.
func (m *IndexerMempool) Size() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.items)
}
