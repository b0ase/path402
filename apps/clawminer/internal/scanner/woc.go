package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// WocClient talks to the WhatsOnChain BSV mainnet API.
type WocClient struct {
	baseURL string
	client  *http.Client
}

// NewWocClient creates a WhatsOnChain API client.
func NewWocClient(baseURL string) *WocClient {
	if baseURL == "" {
		baseURL = "https://api.whatsonchain.com/v1/bsv/main"
	}
	return &WocClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// FetchRawTx retrieves a raw transaction hex by txid.
// WoC returns plain text hex, not JSON.
func (c *WocClient) FetchRawTx(ctx context.Context, txid string) (string, error) {
	url := fmt.Sprintf("%s/tx/%s/hex", c.baseURL, txid)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("woc fetch raw tx: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("woc /tx/%s/hex returned %d", txid, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("woc read body: %w", err)
	}
	return string(body), nil
}

// BSV21Info is the JSON shape returned by the WoC BSV-21 info endpoint.
type BSV21Info struct {
	ID          string `json:"id"`
	Symbol      string `json:"sym"`
	Icon        string `json:"icon"`
	Amount      int64  `json:"amt"`
	Decimals    int    `json:"dec"`
	FundAddress string `json:"fundAddress"`
}

// FetchBSV21Info retrieves BSV-21 token info by contract ID from the ordinals API.
func (c *WocClient) FetchBSV21Info(ctx context.Context, contractID string) (*BSV21Info, error) {
	// WoC doesn't have a native BSV-21 endpoint — use GorillaPool ordinals API
	// This is kept here as a fallback if WoC adds the endpoint later
	url := fmt.Sprintf("https://ordinals.gorillapool.io/api/bsv20/id/%s", contractID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("woc fetch bsv21 info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("woc bsv21 info returned %d", resp.StatusCode)
	}

	var info BSV21Info
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("woc decode bsv21 info: %w", err)
	}
	return &info, nil
}
