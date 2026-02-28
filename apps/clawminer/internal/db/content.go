package db

import (
	"fmt"
)

// ContentItem represents a row in the content_cache table.
type ContentItem struct {
	ID            int    `json:"id"`
	TokenID       string `json:"token_id"`
	ContentHash   string `json:"content_hash"`
	ContentType   string `json:"content_type"`
	ContentSize   int    `json:"content_size"`
	ContentPath   string `json:"content_path"`
	AcquiredAt    int64  `json:"acquired_at"`
	PricePaidSats int    `json:"price_paid_sats"`
}

// ServeEntry represents a row in the serve_log table.
type ServeEntry struct {
	ID              int    `json:"id"`
	TokenID         string `json:"token_id"`
	RequesterAddr   string `json:"requester_address"`
	RequesterPeerID string `json:"requester_peer_id"`
	RevenueSats     int    `json:"revenue_sats"`
	Txid            string `json:"txid"`
	ServedAt        int64  `json:"served_at"`
}

// InsertContent upserts a content item into content_cache.
func InsertContent(item *ContentItem) error {
	if db == nil {
		return fmt.Errorf("database not open")
	}
	_, err := db.Exec(`
		INSERT OR REPLACE INTO content_cache
			(token_id, content_hash, content_type, content_size, content_path, price_paid_sats)
		VALUES (?, ?, ?, ?, ?, ?)`,
		item.TokenID, item.ContentHash, item.ContentType, item.ContentSize, item.ContentPath, item.PricePaidSats,
	)
	return err
}

// GetContentByHash retrieves a content item by its SHA-256 hash.
func GetContentByHash(hash string) (*ContentItem, error) {
	if db == nil {
		return nil, fmt.Errorf("database not open")
	}
	row := db.QueryRow(`
		SELECT id, token_id, content_hash, content_type, content_size, content_path,
		       acquired_at, COALESCE(price_paid_sats, 0)
		FROM content_cache WHERE content_hash = ?`, hash)

	var item ContentItem
	if err := row.Scan(&item.ID, &item.TokenID, &item.ContentHash, &item.ContentType,
		&item.ContentSize, &item.ContentPath, &item.AcquiredAt, &item.PricePaidSats); err != nil {
		return nil, err
	}
	return &item, nil
}

// ListContent returns all cached content items.
func ListContent() ([]ContentItem, error) {
	if db == nil {
		return nil, fmt.Errorf("database not open")
	}
	rows, err := db.Query(`
		SELECT id, token_id, content_hash, content_type, content_size, content_path,
		       acquired_at, COALESCE(price_paid_sats, 0)
		FROM content_cache ORDER BY acquired_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ContentItem
	for rows.Next() {
		var item ContentItem
		if err := rows.Scan(&item.ID, &item.TokenID, &item.ContentHash, &item.ContentType,
			&item.ContentSize, &item.ContentPath, &item.AcquiredAt, &item.PricePaidSats); err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

// DeleteContent removes a content item by hash.
func DeleteContent(hash string) error {
	if db == nil {
		return fmt.Errorf("database not open")
	}
	_, err := db.Exec(`DELETE FROM content_cache WHERE content_hash = ?`, hash)
	return err
}

// InsertServeLog records a content serve event.
func InsertServeLog(entry *ServeEntry) error {
	if db == nil {
		return fmt.Errorf("database not open")
	}
	_, err := db.Exec(`
		INSERT INTO serve_log (token_id, requester_address, requester_peer_id, revenue_sats, txid, served_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		entry.TokenID, entry.RequesterAddr, entry.RequesterPeerID,
		entry.RevenueSats, entry.Txid, entry.ServedAt,
	)
	return err
}

// GetServeStats returns total serves and total revenue.
func GetServeStats() (totalServes int, totalRevenue int, err error) {
	if db == nil {
		return 0, 0, fmt.Errorf("database not open")
	}
	row := db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(revenue_sats), 0) FROM serve_log`)
	err = row.Scan(&totalServes, &totalRevenue)
	return
}

// GetRecentServes returns the most recent serve log entries.
func GetRecentServes(limit int) ([]ServeEntry, error) {
	if db == nil {
		return nil, fmt.Errorf("database not open")
	}
	rows, err := db.Query(`
		SELECT id, token_id, requester_address, requester_peer_id,
		       revenue_sats, COALESCE(txid, ''), served_at
		FROM serve_log ORDER BY served_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []ServeEntry
	for rows.Next() {
		var e ServeEntry
		if err := rows.Scan(&e.ID, &e.TokenID, &e.RequesterAddr, &e.RequesterPeerID,
			&e.RevenueSats, &e.Txid, &e.ServedAt); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return entries, nil
}
