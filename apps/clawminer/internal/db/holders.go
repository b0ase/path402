package db

import "time"

// BSV20HolderRecord represents a single holder entry from the GorillaPool indexer.
type BSV20HolderRecord struct {
	Address string `json:"address"`
	Handle  string `json:"handle,omitempty"`
	Balance int    `json:"balance"`
}

// UpsertBSV20Holders bulk-inserts or updates holder records for a given token tick.
// Wraps the batch in a transaction for atomicity.
func UpsertBSV20Holders(tokenID string, holders []BSV20HolderRecord) error {
	if len(holders) == 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO holders (token_id, address, handle, balance, last_verified_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(token_id, address) DO UPDATE SET
			handle = excluded.handle,
			balance = excluded.balance,
			last_verified_at = excluded.last_verified_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().Unix()
	for _, h := range holders {
		if _, err := stmt.Exec(tokenID, h.Address, h.Handle, h.Balance, now); err != nil {
			return err
		}
	}

	return tx.Commit()
}
