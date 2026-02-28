package content

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// Store is a hash-addressed filesystem content store.
// Port of packages/core/src/content/fs-store.ts.
type Store struct {
	baseDir string
	mu      sync.RWMutex
}

// NewStore creates a content store rooted at dataDir/content.
func NewStore(dataDir string) (*Store, error) {
	dir := filepath.Join(dataDir, "content")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create content dir: %w", err)
	}
	log.Printf("[content] Store initialized at %s", dir)
	return &Store{baseDir: dir}, nil
}

// hashPath returns the filesystem path for a content hash.
// Uses first 2 chars as directory prefix (like git objects).
func (s *Store) hashPath(hash string) string {
	prefix := hash[:2]
	dir := filepath.Join(s.baseDir, prefix)
	os.MkdirAll(dir, 0755)
	return filepath.Join(dir, hash)
}

// Put stores content and returns its SHA-256 hash.
func (s *Store) Put(tokenID string, data []byte, contentType string, pricePaidSats int) (string, error) {
	h := sha256.Sum256(data)
	hash := hex.EncodeToString(h[:])

	s.mu.Lock()
	defer s.mu.Unlock()

	filePath := s.hashPath(hash)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("write content: %w", err)
	}

	if err := db.InsertContent(&db.ContentItem{
		TokenID:      tokenID,
		ContentHash:  hash,
		ContentType:  contentType,
		ContentSize:  len(data),
		ContentPath:  filePath,
		PricePaidSats: pricePaidSats,
	}); err != nil {
		log.Printf("[content] DB insert failed for %s: %v", hash[:16], err)
	}

	log.Printf("[content] Stored %s (%d bytes, %s)", hash[:16], len(data), contentType)
	return hash, nil
}

// Get retrieves content bytes by hash.
func (s *Store) Get(hash string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, err := db.GetContentByHash(hash)
	if err != nil {
		return nil, err
	}

	path := item.ContentPath
	if path == "" {
		path = s.hashPath(hash)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read content: %w", err)
	}
	return data, nil
}

// GetStream opens a file reader for streaming content by hash.
func (s *Store) GetStream(hash string) (io.ReadCloser, int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, err := db.GetContentByHash(hash)
	if err != nil {
		return nil, 0, err
	}

	path := item.ContentPath
	if path == "" {
		path = s.hashPath(hash)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, 0, fmt.Errorf("open content: %w", err)
	}

	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, 0, err
	}

	return f, info.Size(), nil
}

// Has checks whether content exists by hash.
func (s *Store) Has(hash string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	_, err := db.GetContentByHash(hash)
	if err != nil {
		return false
	}

	path := s.hashPath(hash)
	_, err = os.Stat(path)
	return err == nil
}

// Delete removes content by hash from filesystem and DB.
func (s *Store) Delete(hash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, err := db.GetContentByHash(hash)
	if err != nil {
		return err
	}

	path := item.ContentPath
	if path == "" {
		path = s.hashPath(hash)
	}

	os.Remove(path)
	return db.DeleteContent(hash)
}

// List returns all stored content metadata.
func (s *Store) List() ([]db.ContentItem, error) {
	return db.ListContent()
}

// Stats returns storage statistics.
func (s *Store) Stats() map[string]interface{} {
	items, _ := db.ListContent()
	totalBytes := 0
	for _, item := range items {
		totalBytes += item.ContentSize
	}
	serves, revenue, _ := db.GetServeStats()
	return map[string]interface{}{
		"total_items":      len(items),
		"total_bytes":      totalBytes,
		"total_serves":     serves,
		"total_revenue_sats": revenue,
		"base_dir":         s.baseDir,
	}
}

// LogServe records a content serve event in the database.
func (s *Store) LogServe(tokenID, requesterAddr, requesterPeerID string, revenueSats int, txid string) error {
	return db.InsertServeLog(&db.ServeEntry{
		TokenID:         tokenID,
		RequesterAddr:   requesterAddr,
		RequesterPeerID: requesterPeerID,
		RevenueSats:     revenueSats,
		Txid:            txid,
		ServedAt:        time.Now().Unix(),
	})
}
