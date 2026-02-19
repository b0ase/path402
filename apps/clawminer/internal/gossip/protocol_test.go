package gossip

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewMessage_Fields(t *testing.T) {
	msg, err := newMessage(MsgPing, "node-123", &PingPayload{
		Timestamp: time.Now().UnixMilli(),
		Nonce:     "abc",
	}, 30)
	if err != nil {
		t.Fatalf("newMessage: %v", err)
	}

	if msg.ID == "" {
		t.Error("message ID is empty")
	}
	if msg.Type != MsgPing {
		t.Errorf("type = %s, want PING", msg.Type)
	}
	if msg.Version != ProtocolVersion {
		t.Errorf("version = %s, want %s", msg.Version, ProtocolVersion)
	}
	if msg.SenderID != "node-123" {
		t.Errorf("sender_id = %s", msg.SenderID)
	}
	if msg.TTL != 30 {
		t.Errorf("ttl = %d, want 30", msg.TTL)
	}
	if msg.Hops != 0 {
		t.Errorf("hops = %d, want 0", msg.Hops)
	}
}

func TestSerializeDeserialize_Roundtrip(t *testing.T) {
	msg, _ := NewHello("node-abc", 4020, 5)

	data, err := Serialize(msg)
	if err != nil {
		t.Fatalf("Serialize: %v", err)
	}

	got, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize: %v", err)
	}

	if got.ID != msg.ID {
		t.Errorf("ID mismatch: %s != %s", got.ID, msg.ID)
	}
	if got.Type != msg.Type {
		t.Errorf("Type mismatch: %s != %s", got.Type, msg.Type)
	}
	if got.SenderID != msg.SenderID {
		t.Errorf("SenderID mismatch")
	}

	// Verify payload round-trips
	var payload HelloPayload
	if err := json.Unmarshal(got.Payload, &payload); err != nil {
		t.Fatalf("payload unmarshal: %v", err)
	}
	if payload.NodeID != "node-abc" {
		t.Errorf("payload.NodeID = %s", payload.NodeID)
	}
	if payload.ListeningPort != 4020 {
		t.Errorf("payload.ListeningPort = %d", payload.ListeningPort)
	}
	if payload.TokensCount != 5 {
		t.Errorf("payload.TokensCount = %d", payload.TokensCount)
	}
}

func TestValidateMessage_Valid(t *testing.T) {
	msg, _ := NewPing("node-1")
	result := ValidateMessage(msg)
	if !result.Valid {
		t.Errorf("expected valid, got error: %s", result.Error)
	}
}

func TestValidateMessage_Expired(t *testing.T) {
	msg, _ := NewPing("node-1")
	msg.Timestamp = time.Now().Add(-10 * time.Minute).UnixMilli() // 10 min ago
	msg.TTL = 30                                                    // 30s TTL

	result := ValidateMessage(msg)
	if result.Valid {
		t.Error("expired message should be invalid")
	}
	if result.Error != "message expired (TTL exceeded)" {
		t.Errorf("unexpected error: %s", result.Error)
	}
}

func TestValidateMessage_MaxHops(t *testing.T) {
	msg, _ := NewPing("node-1")
	msg.Hops = 11

	result := ValidateMessage(msg)
	if result.Valid {
		t.Error("message with hops > MaxHops should be invalid")
	}
}

func TestValidateMessage_InvalidType(t *testing.T) {
	msg, _ := NewPing("node-1")
	msg.Type = "INVALID_TYPE"

	result := ValidateMessage(msg)
	if result.Valid {
		t.Error("message with invalid type should be invalid")
	}
}

func TestHashMessage_Deterministic(t *testing.T) {
	msg, _ := NewAnnounceToken("node-1", &AnnounceTokenPayload{
		TokenID:       "test-token",
		CurrentSupply: 10,
		BasePrice:     500,
		PricingModel:  "alice_bond",
	})

	h1 := HashMessage(msg)
	h2 := HashMessage(msg)
	if h1 != h2 {
		t.Error("HashMessage is not deterministic")
	}
	if len(h1) != 32 {
		t.Errorf("hash length = %d, want 32", len(h1))
	}
}

func TestPrepareForRelay_IncrementsHops(t *testing.T) {
	msg, _ := NewPing("node-1")
	msg.Hops = 3

	relay := PrepareForRelay(msg)
	if relay == nil {
		t.Fatal("PrepareForRelay returned nil for valid message")
	}
	if relay.Hops != 4 {
		t.Errorf("relay hops = %d, want 4", relay.Hops)
	}
	// Original should be unchanged
	if msg.Hops != 3 {
		t.Error("original message hops was modified")
	}
}

func TestPrepareForRelay_NilAtMaxHops(t *testing.T) {
	msg, _ := NewPing("node-1")
	msg.Hops = MaxHops

	relay := PrepareForRelay(msg)
	if relay != nil {
		t.Error("PrepareForRelay should return nil at MaxHops")
	}
}

func TestSerialize_RejectsOversized(t *testing.T) {
	msg, _ := NewPing("node-1")
	// Stuff huge payload
	big := make([]byte, MaxMessageSize+1)
	msg.Payload = big

	_, err := Serialize(msg)
	if err == nil {
		t.Error("Serialize should reject oversized messages")
	}
}

func TestTopicForType(t *testing.T) {
	tests := []struct {
		mt   MessageType
		want string
	}{
		{MsgAnnounceToken, TopicTokens},
		{MsgRequestToken, TopicTokens},
		{MsgTransferEvent, TopicTransfers},
		{MsgHolderUpdate, TopicTransfers},
		{MsgTicketStamp, TopicStamps},
		{MsgChatMessage, TopicChat},
		{MsgContentRequest, TopicContent},
		{MsgContentOffer, TopicContent},
	}
	for _, tt := range tests {
		got := TopicForType(tt.mt)
		if got != tt.want {
			t.Errorf("TopicForType(%s) = %s, want %s", tt.mt, got, tt.want)
		}
	}
}
