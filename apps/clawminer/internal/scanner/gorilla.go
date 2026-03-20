package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// GorillaClient talks to the GorillaPool BSV-20 ordinals API.
type GorillaClient struct {
	baseURL string
	client  *http.Client
}

// NewGorillaClient creates a client for the GorillaPool API.
func NewGorillaClient(baseURL string) *GorillaClient {
	return &GorillaClient{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// flexInt handles JSON values that may be either a number or a string.
type flexInt int

func (f *flexInt) UnmarshalJSON(b []byte) error {
	// Try number first
	var n int
	if err := json.Unmarshal(b, &n); err == nil {
		*f = flexInt(n)
		return nil
	}
	// Try string
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		if s == "" {
			*f = 0
			return nil
		}
		n, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("flexInt: cannot parse %q: %w", s, err)
		}
		*f = flexInt(n)
		return nil
	}
	return fmt.Errorf("flexInt: cannot unmarshal %s", string(b))
}

// BSV20Token is the JSON shape returned by GET /bsv20.
type BSV20Token struct {
	Tick        string  `json:"tick"`
	Max         flexInt `json:"max"`
	Limit       flexInt `json:"lim"`
	Supply      flexInt `json:"supply"`
	Available   flexInt `json:"available"`
	PctMinted   string  `json:"pctMinted"`
	TxID        string  `json:"txid"`
	FundAddress string  `json:"fundAddress"`
	Height      flexInt `json:"height"`
}

// BSV20Holder is the JSON shape returned by GET /bsv20/tick/{tick}/holders.
type BSV20Holder struct {
	Address string  `json:"address"`
	Balance flexInt `json:"amt"`
}

// FetchTokens retrieves a page of BSV-20 tokens from the GorillaPool indexer.
func (c *GorillaClient) FetchTokens(ctx context.Context, offset, limit int) ([]BSV20Token, error) {
	url := fmt.Sprintf("%s/bsv20?limit=%d&offset=%d&sort=height&dir=desc", c.baseURL, limit, offset)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gorillapool fetch tokens: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gorillapool /bsv20 returned %d", resp.StatusCode)
	}

	var tokens []BSV20Token
	if err := json.NewDecoder(resp.Body).Decode(&tokens); err != nil {
		return nil, fmt.Errorf("gorillapool decode tokens: %w", err)
	}
	return tokens, nil
}

// FetchHolders retrieves holders for a specific BSV-20 token tick.
func (c *GorillaClient) FetchHolders(ctx context.Context, tick string) ([]BSV20Holder, error) {
	url := fmt.Sprintf("%s/bsv20/tick/%s/holders", c.baseURL, tick)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gorillapool fetch holders: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gorillapool /bsv20/tick/%s/holders returned %d", tick, resp.StatusCode)
	}

	var holders []BSV20Holder
	if err := json.NewDecoder(resp.Body).Decode(&holders); err != nil {
		return nil, fmt.Errorf("gorillapool decode holders: %w", err)
	}
	return holders, nil
}
