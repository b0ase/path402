package db

import "time"

type Token struct {
	TokenID            string  `json:"token_id"`
	Name               *string `json:"name"`
	Description        *string `json:"description"`
	IssuerAddress      *string `json:"issuer_address"`
	IssuerHandle       *string `json:"issuer_handle"`
	BasePriceSats      int     `json:"base_price_sats"`
	PricingModel       string  `json:"pricing_model"`
	DecayFactor        float64 `json:"decay_factor"`
	CurrentSupply      int     `json:"current_supply"`
	MaxSupply          *int    `json:"max_supply"`
	IssuerShareBps     int     `json:"issuer_share_bps"`
	NetworkShareBps    int     `json:"network_share_bps"`
	ContentType        *string `json:"content_type"`
	ContentPreview     *string `json:"content_preview"`
	AccessURL          *string `json:"access_url"`
	DiscoveredAt       int64   `json:"discovered_at"`
	VerificationStatus string  `json:"verification_status"`
	DiscoveredVia      *string `json:"discovered_via"`
	GossipPeerID       *string `json:"gossip_peer_id"`
}

func InsertToken(t *Token) error {
	_, err := db.Exec(`
		INSERT OR IGNORE INTO tokens (token_id, name, description, issuer_address, issuer_handle,
			base_price_sats, pricing_model, current_supply, discovered_via, gossip_peer_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.TokenID, t.Name, t.Description, t.IssuerAddress, t.IssuerHandle,
		t.BasePriceSats, t.PricingModel, t.CurrentSupply, t.DiscoveredVia, t.GossipPeerID)
	return err
}

func GetToken(tokenID string) (*Token, error) {
	t := &Token{}
	err := db.QueryRow(`SELECT token_id, name, description, issuer_address, issuer_handle,
		base_price_sats, pricing_model, decay_factor, current_supply, max_supply,
		issuer_share_bps, network_share_bps, verification_status, discovered_at
		FROM tokens WHERE token_id = ?`, tokenID).Scan(
		&t.TokenID, &t.Name, &t.Description, &t.IssuerAddress, &t.IssuerHandle,
		&t.BasePriceSats, &t.PricingModel, &t.DecayFactor, &t.CurrentSupply, &t.MaxSupply,
		&t.IssuerShareBps, &t.NetworkShareBps, &t.VerificationStatus, &t.DiscoveredAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func GetAllTokens() ([]Token, error) {
	rows, err := db.Query(`SELECT token_id, name, description, issuer_address,
		base_price_sats, pricing_model, current_supply, verification_status, discovered_at
		FROM tokens ORDER BY discovered_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []Token
	for rows.Next() {
		var t Token
		if err := rows.Scan(&t.TokenID, &t.Name, &t.Description, &t.IssuerAddress,
			&t.BasePriceSats, &t.PricingModel, &t.CurrentSupply, &t.VerificationStatus, &t.DiscoveredAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

func UpdateTokenSupply(tokenID string, supply int) error {
	_, err := db.Exec(`UPDATE tokens SET current_supply = ?, last_gossip_at = ? WHERE token_id = ?`,
		supply, time.Now().Unix(), tokenID)
	return err
}
