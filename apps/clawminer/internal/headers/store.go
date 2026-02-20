package headers

import (
	"database/sql"
	"fmt"
	"sync"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// BlockHeader represents a BSV block header stored locally for SPV validation.
type BlockHeader struct {
	Height     int    `json:"height"`
	Hash       string `json:"hash"`
	Version    int    `json:"version"`
	MerkleRoot string `json:"merkle_root"`
	Timestamp  int    `json:"timestamp"`
	Bits       int    `json:"bits"`
	Nonce      int    `json:"nonce"`
	PrevHash   string `json:"prev_hash"`
}

// SyncProgress tracks the state of header synchronisation.
type SyncProgress struct {
	TotalHeaders   int   `json:"total_headers"`
	HighestHeight  int   `json:"highest_height"`
	ChainTipHeight int   `json:"chain_tip_height"`
	IsSyncing      bool  `json:"is_syncing"`
	LastSyncedAt   int64 `json:"last_synced_at"`
}

// HeaderStore provides SQLite storage for block headers.
type HeaderStore struct {
	mu sync.RWMutex
}

// NewHeaderStore creates a new HeaderStore.
func NewHeaderStore() *HeaderStore {
	return &HeaderStore{}
}

const headerSchema = `
CREATE TABLE IF NOT EXISTS block_headers (
    height INTEGER PRIMARY KEY,
    hash TEXT NOT NULL,
    version INTEGER NOT NULL,
    merkle_root TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    bits INTEGER NOT NULL,
    nonce INTEGER NOT NULL,
    prev_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_block_headers_hash ON block_headers(hash);
CREATE INDEX IF NOT EXISTS idx_block_headers_merkle ON block_headers(merkle_root);
`

// EnsureSchema creates the block_headers table if it doesn't exist.
func (s *HeaderStore) EnsureSchema() error {
	d := db.DB()
	if d == nil {
		return fmt.Errorf("database not open")
	}
	_, err := d.Exec(headerSchema)
	return err
}

// InsertBatch inserts a batch of block headers in a single transaction.
// Uses INSERT OR IGNORE for resume safety. Returns the number of rows inserted.
func (s *HeaderStore) InsertBatch(headers []BlockHeader) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	d := db.DB()
	if d == nil {
		return 0, fmt.Errorf("database not open")
	}

	tx, err := d.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO block_headers
		(height, hash, version, merkle_root, timestamp, bits, nonce, prev_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	inserted := 0
	for _, h := range headers {
		res, err := stmt.Exec(h.Height, h.Hash, h.Version, h.MerkleRoot, h.Timestamp, h.Bits, h.Nonce, h.PrevHash)
		if err != nil {
			return inserted, fmt.Errorf("insert height %d: %w", h.Height, err)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			inserted++
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return inserted, nil
}

// HighestHeight returns the maximum stored block height, or -1 if empty.
func (s *HeaderStore) HighestHeight() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d := db.DB()
	if d == nil {
		return -1, fmt.Errorf("database not open")
	}

	var height sql.NullInt64
	err := d.QueryRow("SELECT MAX(height) FROM block_headers").Scan(&height)
	if err != nil {
		return -1, err
	}
	if !height.Valid {
		return -1, nil
	}
	return int(height.Int64), nil
}

// Count returns the total number of stored headers.
func (s *HeaderStore) Count() (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d := db.DB()
	if d == nil {
		return 0, fmt.Errorf("database not open")
	}

	var count int
	err := d.QueryRow("SELECT COUNT(*) FROM block_headers").Scan(&count)
	return count, err
}

// GetByHeight returns the header at the given height, or nil if not found.
func (s *HeaderStore) GetByHeight(height int) (*BlockHeader, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d := db.DB()
	if d == nil {
		return nil, fmt.Errorf("database not open")
	}

	h := &BlockHeader{}
	err := d.QueryRow(
		"SELECT height, hash, version, merkle_root, timestamp, bits, nonce, prev_hash FROM block_headers WHERE height = ?",
		height,
	).Scan(&h.Height, &h.Hash, &h.Version, &h.MerkleRoot, &h.Timestamp, &h.Bits, &h.Nonce, &h.PrevHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return h, nil
}

// GetByHash returns the header with the given hash, or nil if not found.
func (s *HeaderStore) GetByHash(hash string) (*BlockHeader, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d := db.DB()
	if d == nil {
		return nil, fmt.Errorf("database not open")
	}

	h := &BlockHeader{}
	err := d.QueryRow(
		"SELECT height, hash, version, merkle_root, timestamp, bits, nonce, prev_hash FROM block_headers WHERE hash = ?",
		hash,
	).Scan(&h.Height, &h.Hash, &h.Version, &h.MerkleRoot, &h.Timestamp, &h.Bits, &h.Nonce, &h.PrevHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return h, nil
}

// HasMerkleRoot checks whether the given merkle root exists at the given height.
func (s *HeaderStore) HasMerkleRoot(root string, height int) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d := db.DB()
	if d == nil {
		return false, fmt.Errorf("database not open")
	}

	var count int
	err := d.QueryRow(
		"SELECT COUNT(*) FROM block_headers WHERE merkle_root = ? AND height = ?",
		root, height,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
