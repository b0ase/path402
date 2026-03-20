package uhrp

// BRC-26 UHRP (Universal Hash Resolution Protocol) types and constants.

// ProtocolPrefix is the BSV address prefix used in UHRP UTXO advertisement tokens.
const ProtocolPrefix = "1UHRPYnMHPuQ5Tgb3AF8JXqwKkmZVy5hG"

// OverlayTopic is the GossipSub topic for UHRP messages.
const OverlayTopic = "$402/uhrp/v1"

// ProtocolID identifies $402 UHRP advertisements.
const ProtocolID = "$402-uhrp"

// Version is the current UHRP protocol version.
const Version = "1.0"

// Advertisement represents a UHRP content advertisement.
// Hosts broadcast these to announce content availability.
type Advertisement struct {
	ContentHash  string `json:"content_hash"`
	UhrpURL      string `json:"uhrp_url"`
	ContentType  string `json:"content_type,omitempty"`
	ContentSize  int    `json:"content_size"`
	DownloadURL  string `json:"download_url"`
	Advertiser   string `json:"advertiser"`
	Expiry       int64  `json:"expiry,omitempty"` // Unix timestamp, 0 = permanent
	InscribeTxid string `json:"inscription_txid,omitempty"`
	CreatedAt    int64  `json:"created_at"`
}

// ResolveResult holds the resolution of a UHRP URL.
type ResolveResult struct {
	ContentHash    string   `json:"content_hash"`
	UhrpURL        string   `json:"uhrp_url"`
	DownloadURLs   []string `json:"download_urls"`
	Advertisements []Advertisement `json:"advertisements"`
}
