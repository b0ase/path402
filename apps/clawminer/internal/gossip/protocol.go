package gossip

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Protocol constants — must match TypeScript implementation
const (
	ProtocolVersion = "0.1.0"
	GossipPort      = 4020
	MaxMessageSize  = 64 * 1024 // 64KB
	MessageTTL      = 300       // 5 minutes
	MaxHops         = 10
)

// MessageType enumerates all gossip message types.
type MessageType string

const (
	MsgHello           MessageType = "HELLO"
	MsgHelloAck        MessageType = "HELLO_ACK"
	MsgPeerListRequest MessageType = "PEER_LIST_REQUEST"
	MsgPeerList        MessageType = "PEER_LIST"
	MsgAnnounceToken   MessageType = "ANNOUNCE_TOKEN"
	MsgRequestToken    MessageType = "REQUEST_TOKEN"
	MsgTokenData       MessageType = "TOKEN_DATA"
	MsgTransferEvent   MessageType = "TRANSFER_EVENT"
	MsgHolderUpdate    MessageType = "HOLDER_UPDATE"
	MsgContentRequest  MessageType = "CONTENT_REQUEST"
	MsgContentOffer    MessageType = "CONTENT_OFFER"
	MsgTicketStamp     MessageType = "TICKET_STAMP"
	MsgChatMessage     MessageType = "CHAT_MESSAGE"
	MsgPing            MessageType = "PING"
	MsgPong            MessageType = "PONG"
)

var validTypes = map[MessageType]bool{
	MsgHello: true, MsgHelloAck: true,
	MsgPeerListRequest: true, MsgPeerList: true,
	MsgAnnounceToken: true, MsgRequestToken: true, MsgTokenData: true,
	MsgTransferEvent: true, MsgHolderUpdate: true,
	MsgContentRequest: true, MsgContentOffer: true,
	MsgTicketStamp: true, MsgChatMessage: true,
	MsgPing: true, MsgPong: true,
}

// GossipMessage is the envelope for all gossip communication.
type GossipMessage struct {
	ID        string          `json:"id"`
	Type      MessageType     `json:"type"`
	Version   string          `json:"version"`
	SenderID  string          `json:"sender_id"`
	Timestamp int64           `json:"timestamp"`
	TTL       int             `json:"ttl"`
	Hops      int             `json:"hops"`
	Payload   json.RawMessage `json:"payload"`
	Signature string          `json:"signature,omitempty"`
}

// Payload types

type HelloPayload struct {
	NodeID        string   `json:"node_id"`
	Version       string   `json:"version"`
	Capabilities  []string `json:"capabilities"`
	TokensCount   int      `json:"tokens_count"`
	ListeningPort int      `json:"listening_port"`
}

type HelloAckPayload struct {
	NodeID   string `json:"node_id"`
	Version  string `json:"version"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

type PeerInfo struct {
	PeerID     string `json:"peer_id"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	LastSeen   int64  `json:"last_seen"`
	Reputation int    `json:"reputation"`
}

type PeerListPayload struct {
	Peers []PeerInfo `json:"peers"`
}

type AnnounceTokenPayload struct {
	TokenID        string `json:"token_id"`
	Name           string `json:"name,omitempty"`
	IssuerHandle   string `json:"issuer_handle,omitempty"`
	CurrentSupply  int    `json:"current_supply"`
	CurrentPrice   int    `json:"current_price_sats"`
	BasePrice      int    `json:"base_price_sats"`
	PricingModel   string `json:"pricing_model"`
	ContentPreview string `json:"content_preview,omitempty"`
	Verified       bool   `json:"verified"`
	VerifyTxid     string `json:"verify_txid,omitempty"`
}

type RequestTokenPayload struct {
	TokenID string `json:"token_id"`
}

type TransferEventPayload struct {
	TokenID     string `json:"token_id"`
	FromAddress string `json:"from_address,omitempty"`
	ToAddress   string `json:"to_address"`
	Amount      int    `json:"amount"`
	Txid        string `json:"txid"`
	BlockHeight int    `json:"block_height,omitempty"`
	BlockTime   int64  `json:"block_time,omitempty"`
}

type TicketStampPayload struct {
	TokenID          string `json:"token_id"`
	Address          string `json:"address"`
	Path             string `json:"path"`
	Timestamp        string `json:"timestamp"`
	IndexerPubkey    string `json:"indexer_pubkey"`
	IndexerSignature string `json:"indexer_signature"`
}

type ChatPayload struct {
	TokenID       string `json:"token_id,omitempty"`
	Channel       string `json:"channel"`
	Content       string `json:"content"`
	SenderHandle  string `json:"sender_handle,omitempty"`
	SenderAddress string `json:"sender_address"`
	Signature     string `json:"signature,omitempty"`
	Timestamp     int64  `json:"timestamp"`
}

type PingPayload struct {
	Timestamp int64  `json:"timestamp"`
	Nonce     string `json:"nonce"`
}

type PongPayload struct {
	Timestamp        int64  `json:"timestamp"`
	Nonce            string `json:"nonce"`
	RequestTimestamp int64  `json:"request_timestamp"`
}

// Factory functions

func randomID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func newMessage(msgType MessageType, senderID string, payload interface{}, ttl int) (*GossipMessage, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &GossipMessage{
		ID:        randomID(),
		Type:      msgType,
		Version:   ProtocolVersion,
		SenderID:  senderID,
		Timestamp: time.Now().UnixMilli(),
		TTL:       ttl,
		Hops:      0,
		Payload:   data,
	}, nil
}

func NewHello(nodeID string, port, tokensCount int) (*GossipMessage, error) {
	return newMessage(MsgHello, nodeID, &HelloPayload{
		NodeID:        nodeID,
		Version:       ProtocolVersion,
		Capabilities:  []string{"index", "serve", "gossip"},
		TokensCount:   tokensCount,
		ListeningPort: port,
	}, MessageTTL)
}

func NewPing(nodeID string) (*GossipMessage, error) {
	nonce := make([]byte, 8)
	rand.Read(nonce)
	return newMessage(MsgPing, nodeID, &PingPayload{
		Timestamp: time.Now().UnixMilli(),
		Nonce:     hex.EncodeToString(nonce),
	}, 30)
}

func NewPong(nodeID string, ping *PingPayload) (*GossipMessage, error) {
	return newMessage(MsgPong, nodeID, &PongPayload{
		Timestamp:        time.Now().UnixMilli(),
		Nonce:            ping.Nonce,
		RequestTimestamp: ping.Timestamp,
	}, 30)
}

func NewAnnounceToken(nodeID string, token *AnnounceTokenPayload) (*GossipMessage, error) {
	return newMessage(MsgAnnounceToken, nodeID, token, MessageTTL)
}

func NewTransferEvent(nodeID string, transfer *TransferEventPayload) (*GossipMessage, error) {
	return newMessage(MsgTransferEvent, nodeID, transfer, MessageTTL)
}

func NewTicketStamp(nodeID string, stamp *TicketStampPayload) (*GossipMessage, error) {
	return newMessage(MsgTicketStamp, nodeID, stamp, MessageTTL)
}

func NewChatMessage(nodeID string, chat *ChatPayload) (*GossipMessage, error) {
	return newMessage(MsgChatMessage, nodeID, chat, MessageTTL)
}

// Validation

type ValidationResult struct {
	Valid bool
	Error string
}

func ValidateMessage(msg *GossipMessage) ValidationResult {
	if msg.ID == "" {
		return ValidationResult{false, "missing id"}
	}
	if !validTypes[msg.Type] {
		return ValidationResult{false, fmt.Sprintf("invalid type: %s", msg.Type)}
	}
	if msg.Version == "" {
		return ValidationResult{false, "missing version"}
	}
	if msg.SenderID == "" {
		return ValidationResult{false, "missing sender_id"}
	}
	if msg.Timestamp == 0 {
		return ValidationResult{false, "missing timestamp"}
	}
	if msg.TTL < 0 {
		return ValidationResult{false, "invalid ttl"}
	}
	if msg.Hops < 0 {
		return ValidationResult{false, "invalid hops"}
	}
	if msg.Payload == nil {
		return ValidationResult{false, "missing payload"}
	}

	// Check TTL expiry
	ageSeconds := float64(time.Now().UnixMilli()-msg.Timestamp) / 1000.0
	if ageSeconds > float64(msg.TTL) {
		return ValidationResult{false, "message expired (TTL exceeded)"}
	}

	if msg.Hops > MaxHops {
		return ValidationResult{false, "max hops exceeded"}
	}

	return ValidationResult{Valid: true}
}

// HashMessage produces a deduplication hash for a message.
func HashMessage(msg *GossipMessage) string {
	content := fmt.Sprintf(`{"type":"%s","sender_id":"%s","payload":%s}`, msg.Type, msg.SenderID, string(msg.Payload))
	h := sha256.Sum256([]byte(content))
	return hex.EncodeToString(h[:16])
}

// PrepareForRelay clones a message with incremented hops, or returns nil if expired.
func PrepareForRelay(msg *GossipMessage) *GossipMessage {
	ageSeconds := float64(time.Now().UnixMilli()-msg.Timestamp) / 1000.0
	if ageSeconds > float64(msg.TTL) || msg.Hops >= MaxHops {
		return nil
	}
	relay := *msg
	relay.Hops++
	return &relay
}

// Serialize encodes a message to JSON bytes.
func Serialize(msg *GossipMessage) ([]byte, error) {
	data, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}
	if len(data) > MaxMessageSize {
		return nil, fmt.Errorf("message too large: %d > %d", len(data), MaxMessageSize)
	}
	return data, nil
}

// Deserialize decodes JSON bytes into a GossipMessage.
func Deserialize(data []byte) (*GossipMessage, error) {
	if len(data) > MaxMessageSize {
		return nil, fmt.Errorf("message too large: %d > %d", len(data), MaxMessageSize)
	}
	var msg GossipMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
