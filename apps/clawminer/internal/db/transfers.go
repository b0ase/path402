package db

type Transfer struct {
	ID              int     `json:"id"`
	TokenID         string  `json:"token_id"`
	FromAddress     *string `json:"from_address"`
	ToAddress       string  `json:"to_address"`
	Amount          int     `json:"amount"`
	Txid            *string `json:"txid"`
	BlockHeight     *int    `json:"block_height"`
	BlockTime       *int64  `json:"block_time"`
	ReceivedFromPeer *string `json:"received_from_peer"`
	CreatedAt       int64   `json:"created_at"`
}

func InsertTransfer(t *Transfer) error {
	_, err := db.Exec(`
		INSERT OR IGNORE INTO transfers (token_id, from_address, to_address, amount, txid,
			block_height, block_time, received_from_peer)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		t.TokenID, t.FromAddress, t.ToAddress, t.Amount, t.Txid,
		t.BlockHeight, t.BlockTime, t.ReceivedFromPeer)
	return err
}

func GetTransfersByToken(tokenID string, limit int) ([]Transfer, error) {
	rows, err := db.Query(`
		SELECT id, token_id, from_address, to_address, amount, txid,
			block_height, block_time, created_at
		FROM transfers WHERE token_id = ?
		ORDER BY created_at DESC LIMIT ?`, tokenID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transfers []Transfer
	for rows.Next() {
		var t Transfer
		if err := rows.Scan(&t.ID, &t.TokenID, &t.FromAddress, &t.ToAddress, &t.Amount,
			&t.Txid, &t.BlockHeight, &t.BlockTime, &t.CreatedAt); err != nil {
			return nil, err
		}
		transfers = append(transfers, t)
	}
	return transfers, nil
}
