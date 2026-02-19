package db

type Holding struct {
	ID               int     `json:"id"`
	TokenID          string  `json:"token_id"`
	Balance          int     `json:"balance"`
	AvgCostSats      *int    `json:"avg_cost_sats"`
	TotalSpentSats   int     `json:"total_spent_sats"`
	TotalServes      int     `json:"total_serves"`
	TotalRevenueSats int     `json:"total_revenue_sats"`
	IsSpeculative    bool    `json:"is_speculative"`
	Name             *string `json:"name,omitempty"` // from join
}

type PortfolioSummary struct {
	TotalValue   int `json:"total_value"`
	TotalSpent   int `json:"total_spent"`
	TotalRevenue int `json:"total_revenue"`
	TotalPnL     int `json:"total_pnl"`
}

func GetPortfolio() ([]Holding, error) {
	rows, err := db.Query(`
		SELECT h.id, h.token_id, h.balance, h.avg_cost_sats, h.total_spent_sats,
			h.total_serves, h.total_revenue_sats, h.is_speculative, t.name
		FROM holdings h
		JOIN tokens t ON h.token_id = t.token_id
		WHERE h.balance > 0
		ORDER BY h.total_revenue_sats DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var holdings []Holding
	for rows.Next() {
		var h Holding
		if err := rows.Scan(&h.ID, &h.TokenID, &h.Balance, &h.AvgCostSats,
			&h.TotalSpentSats, &h.TotalServes, &h.TotalRevenueSats, &h.IsSpeculative, &h.Name); err != nil {
			return nil, err
		}
		holdings = append(holdings, h)
	}
	return holdings, nil
}

func GetPortfolioSummary() (*PortfolioSummary, error) {
	s := &PortfolioSummary{}
	err := db.QueryRow(`
		SELECT COALESCE(SUM(total_spent_sats), 0),
			COALESCE(SUM(total_revenue_sats), 0)
		FROM holdings WHERE balance > 0`).Scan(&s.TotalSpent, &s.TotalRevenue)
	if err != nil {
		return nil, err
	}
	s.TotalPnL = s.TotalRevenue - s.TotalSpent
	s.TotalValue = s.TotalSpent + s.TotalPnL
	return s, nil
}

func UpdateHolding(tokenID string, balance int, costSats int) error {
	_, err := db.Exec(`
		INSERT INTO holdings (token_id, balance, total_spent_sats)
		VALUES (?, ?, ?)
		ON CONFLICT(token_id) DO UPDATE SET
			balance = excluded.balance,
			total_spent_sats = total_spent_sats + excluded.total_spent_sats`,
		tokenID, balance, costSats)
	return err
}
