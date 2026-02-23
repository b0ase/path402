package db

import "time"

// PoIBlock represents a stored Proof-of-Indexing block.
type PoIBlock struct {
	Hash         string  `json:"hash"`
	Height       int     `json:"height"`
	PrevHash     string  `json:"prev_hash"`
	MerkleRoot   string  `json:"merkle_root"`
	MinerAddress string  `json:"miner_address"`
	Timestamp    int64   `json:"timestamp"`
	Bits         int     `json:"bits"`
	Nonce        int64   `json:"nonce"`
	Version      int     `json:"version"`
	ItemCount    int     `json:"item_count"`
	ItemsJSON    *string `json:"items_json,omitempty"`
	IsOwn        bool    `json:"is_own"`
	MintTxid     *string `json:"mint_txid,omitempty"`
	TargetHex    *string `json:"target_hex,omitempty"`
	SourcePeer   *string `json:"source_peer,omitempty"`
	CreatedAt    int64   `json:"created_at"`
}

// InsertPoIBlock stores a block, ignoring duplicates.
func InsertPoIBlock(block *PoIBlock) error {
	_, err := db.Exec(`
		INSERT OR IGNORE INTO poi_blocks
			(hash, height, prev_hash, merkle_root, miner_address, timestamp,
			 bits, nonce, version, item_count, items_json, is_own, mint_txid,
			 target_hex, source_peer)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		block.Hash, block.Height, block.PrevHash, block.MerkleRoot,
		block.MinerAddress, block.Timestamp,
		block.Bits, block.Nonce, block.Version, block.ItemCount,
		block.ItemsJSON, block.IsOwn, block.MintTxid,
		block.TargetHex, block.SourcePeer)
	return err
}

// UpdateBlockMintTxid links a BSV inscription txid to a mined block.
func UpdateBlockMintTxid(hash, txid string) error {
	_, err := db.Exec(`UPDATE poi_blocks SET mint_txid = ? WHERE hash = ?`, txid, hash)
	return err
}

// GetPoIBlockByHash returns a single block by its hash.
func GetPoIBlockByHash(hash string) (*PoIBlock, error) {
	b := &PoIBlock{}
	err := db.QueryRow(`
		SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
			bits, nonce, version, item_count, items_json, is_own, mint_txid,
			target_hex, source_peer, created_at
		FROM poi_blocks WHERE hash = ?`, hash).Scan(
		&b.Hash, &b.Height, &b.PrevHash, &b.MerkleRoot,
		&b.MinerAddress, &b.Timestamp,
		&b.Bits, &b.Nonce, &b.Version, &b.ItemCount,
		&b.ItemsJSON, &b.IsOwn, &b.MintTxid,
		&b.TargetHex, &b.SourcePeer, &b.CreatedAt)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// GetPoIBlockByHeight returns a single block by its height.
func GetPoIBlockByHeight(height int) (*PoIBlock, error) {
	b := &PoIBlock{}
	err := db.QueryRow(`
		SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
			bits, nonce, version, item_count, items_json, is_own, mint_txid,
			target_hex, source_peer, created_at
		FROM poi_blocks WHERE height = ? ORDER BY is_own DESC LIMIT 1`, height).Scan(
		&b.Hash, &b.Height, &b.PrevHash, &b.MerkleRoot,
		&b.MinerAddress, &b.Timestamp,
		&b.Bits, &b.Nonce, &b.Version, &b.ItemCount,
		&b.ItemsJSON, &b.IsOwn, &b.MintTxid,
		&b.TargetHex, &b.SourcePeer, &b.CreatedAt)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// GetLatestPoIBlock returns the most recent block by height.
func GetLatestPoIBlock() (*PoIBlock, error) {
	b := &PoIBlock{}
	err := db.QueryRow(`
		SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
			bits, nonce, version, item_count, items_json, is_own, mint_txid,
			target_hex, source_peer, created_at
		FROM poi_blocks ORDER BY height DESC LIMIT 1`).Scan(
		&b.Hash, &b.Height, &b.PrevHash, &b.MerkleRoot,
		&b.MinerAddress, &b.Timestamp,
		&b.Bits, &b.Nonce, &b.Version, &b.ItemCount,
		&b.ItemsJSON, &b.IsOwn, &b.MintTxid,
		&b.TargetHex, &b.SourcePeer, &b.CreatedAt)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// GetPoIBlockCount returns the total number of stored blocks.
func GetPoIBlockCount() (int, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM poi_blocks`).Scan(&count)
	return count, err
}

// GetOwnBlockCount returns the number of locally mined blocks.
func GetOwnBlockCount() (int, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM poi_blocks WHERE is_own = 1`).Scan(&count)
	return count, err
}

// GetRecentPoIBlocks returns the latest N blocks ordered by height descending.
func GetRecentPoIBlocks(limit, offset int) ([]PoIBlock, error) {
	rows, err := db.Query(`
		SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
			bits, nonce, version, item_count, items_json, is_own, mint_txid,
			target_hex, source_peer, created_at
		FROM poi_blocks ORDER BY height DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var blocks []PoIBlock
	for rows.Next() {
		var b PoIBlock
		if err := rows.Scan(
			&b.Hash, &b.Height, &b.PrevHash, &b.MerkleRoot,
			&b.MinerAddress, &b.Timestamp,
			&b.Bits, &b.Nonce, &b.Version, &b.ItemCount,
			&b.ItemsJSON, &b.IsOwn, &b.MintTxid,
			&b.TargetHex, &b.SourcePeer, &b.CreatedAt); err != nil {
			return nil, err
		}
		blocks = append(blocks, b)
	}
	return blocks, nil
}

// GetBlockTimestampsSince returns block timestamps after the given time, ordered ascending.
// Used to restore the difficulty adjuster's block window on startup.
func GetBlockTimestampsSince(since time.Time) ([]time.Time, error) {
	sinceMs := since.UnixMilli()
	rows, err := db.Query(`
		SELECT timestamp FROM poi_blocks
		WHERE timestamp >= ?
		ORDER BY timestamp ASC`, sinceMs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var timestamps []time.Time
	for rows.Next() {
		var ts int64
		if err := rows.Scan(&ts); err != nil {
			return nil, err
		}
		timestamps = append(timestamps, time.UnixMilli(ts))
	}
	return timestamps, nil
}

// GetChainTip returns the latest block's hash and height.
func GetChainTip() (hash string, height int, err error) {
	err = db.QueryRow(`SELECT hash, height FROM poi_blocks ORDER BY height DESC LIMIT 1`).Scan(&hash, &height)
	return
}
