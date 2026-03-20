package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// OneSatClient talks to the 1Sat / GorillaPool ordinals market API.
type OneSatClient struct {
	baseURL string
	client  *http.Client
}

// NewOneSatClient creates a 1Sat market API client.
func NewOneSatClient(baseURL string) *OneSatClient {
	if baseURL == "" {
		baseURL = "https://ordinals.gorillapool.io/api/bsv20"
	}
	return &OneSatClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// OneSatTokenInfo is the JSON shape returned by the 1Sat token endpoint.
type OneSatTokenInfo struct {
	Tick      string  `json:"tick"`
	Max       flexInt `json:"max"`
	Supply    flexInt `json:"supply"`
	Available flexInt `json:"available"`
	PctMinted string  `json:"pctMinted"`
	TxID      string  `json:"txid"`
	Height    flexInt `json:"height"`
}

// FetchTokenSupply retrieves token supply info by tick symbol.
func (c *OneSatClient) FetchTokenSupply(ctx context.Context, tick string) (*OneSatTokenInfo, error) {
	url := fmt.Sprintf("%s/tick/%s", c.baseURL, tick)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("1sat fetch token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("1sat /tick/%s returned %d", tick, resp.StatusCode)
	}

	var info OneSatTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("1sat decode token: %w", err)
	}
	return &info, nil
}
