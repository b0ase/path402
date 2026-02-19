package gossip

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

// These tests verify that Go gossip protocol functions produce the
// EXACT same outputs as packages/core/src/gossip/protocol.ts.

func TestCompat_TopicNames(t *testing.T) {
	// Must match TypeScript GossipTopic enum exactly
	expected := map[string]bool{
		"$402/tokens/v1":    true,
		"$402/transfers/v1": true,
		"$402/stamps/v1":    true,
		"$402/chat/v1":      true,
		"$402/content/v1":   true,
	}

	topics := AllTopics()
	if len(topics) != 5 {
		t.Fatalf("AllTopics() returned %d topics, want 5", len(topics))
	}

	for _, topic := range topics {
		if !expected[topic] {
			t.Errorf("unexpected topic: %s", topic)
		}
	}
}

func TestCompat_TopicForType(t *testing.T) {
	tests := map[MessageType]string{
		MsgAnnounceToken:  "$402/tokens/v1",
		MsgTransferEvent:  "$402/transfers/v1",
		MsgTicketStamp:    "$402/stamps/v1",
		MsgChatMessage:    "$402/chat/v1",
		MsgContentRequest: "$402/content/v1",
		MsgHello:          "$402/tokens/v1", // default
		MsgPing:           "$402/tokens/v1", // default
	}

	for msgType, want := range tests {
		got := TopicForType(msgType)
		if got != want {
			t.Errorf("TopicForType(%s) = %s, want %s", msgType, got, want)
		}
	}
}

func TestCompat_MessageTypes(t *testing.T) {
	// All 15 message types must exist and be valid
	allTypes := []MessageType{
		MsgHello, MsgHelloAck, MsgPeerListRequest, MsgPeerList,
		MsgAnnounceToken, MsgRequestToken, MsgTokenData,
		MsgTransferEvent, MsgHolderUpdate,
		MsgContentRequest, MsgContentOffer,
		MsgTicketStamp, MsgChatMessage,
		MsgPing, MsgPong,
	}

	if len(allTypes) != 15 {
		t.Errorf("expected 15 message types, got %d", len(allTypes))
	}

	for _, mt := range allTypes {
		if mt == "" {
			t.Error("empty message type")
		}
	}
}

func TestCompat_MessageHash_Deterministic(t *testing.T) {
	msg, err := NewPing("test-node-123")
	if err != nil {
		t.Fatalf("NewPing: %v", err)
	}

	hash1 := HashMessage(msg)
	hash2 := HashMessage(msg)

	if hash1 != hash2 {
		t.Errorf("hash not deterministic: %s != %s", hash1, hash2)
	}

	// Verify it matches the expected format: SHA256 of specific JSON, truncated to 16 bytes
	if len(hash1) != 32 { // 16 bytes = 32 hex chars
		t.Errorf("hash length = %d, want 32 hex chars", len(hash1))
	}
}

func TestCompat_MessageHash_Format(t *testing.T) {
	// HashMessage uses: SHA256(`{"type":"...","sender_id":"...","payload":...}`)[:16]
	msg, _ := NewPing("test-node")
	hash := HashMessage(msg)

	// Reconstruct manually
	content := `{"type":"` + string(msg.Type) + `","sender_id":"` + msg.SenderID + `","payload":` + string(msg.Payload) + `}`
	h := sha256.Sum256([]byte(content))
	want := hex.EncodeToString(h[:16])

	if hash != want {
		t.Errorf("hash format mismatch: got %s, want %s", hash, want)
	}
}

func TestCompat_MessageEnvelope(t *testing.T) {
	msg, err := NewHello("node-abc", 4020, 0)
	if err != nil {
		t.Fatalf("NewHello: %v", err)
	}

	if msg.Type != MsgHello {
		t.Errorf("type = %s, want HELLO", msg.Type)
	}
	if msg.SenderID != "node-abc" {
		t.Errorf("sender = %s, want node-abc", msg.SenderID)
	}
	if msg.Version != ProtocolVersion {
		t.Errorf("version = %s, want %s", msg.Version, ProtocolVersion)
	}
	if msg.Hops != 0 {
		t.Errorf("hops = %d, want 0", msg.Hops)
	}
	if msg.Timestamp == 0 {
		t.Error("timestamp is 0")
	}

	var payload HelloPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		t.Fatalf("unmarshal hello payload: %v", err)
	}
	if payload.ListeningPort != 4020 {
		t.Errorf("payload.port = %d, want 4020", payload.ListeningPort)
	}
}

func TestCompat_Serialization_Roundtrip(t *testing.T) {
	original, err := NewAnnounceToken("node-1", &AnnounceTokenPayload{
		TokenID:      "tx123_0",
		CurrentPrice: 100,
	})
	if err != nil {
		t.Fatalf("NewAnnounceToken: %v", err)
	}

	data, err := Serialize(original)
	if err != nil {
		t.Fatalf("Serialize: %v", err)
	}

	restored, err := Deserialize(data)
	if err != nil {
		t.Fatalf("Deserialize: %v", err)
	}

	if restored.Type != original.Type {
		t.Errorf("type: %s != %s", restored.Type, original.Type)
	}
	if restored.SenderID != original.SenderID {
		t.Errorf("sender: %s != %s", restored.SenderID, original.SenderID)
	}
	if restored.Timestamp != original.Timestamp {
		t.Errorf("timestamp: %d != %d", restored.Timestamp, original.Timestamp)
	}

	if HashMessage(original) != HashMessage(restored) {
		t.Error("hash differs after roundtrip")
	}
}

func TestCompat_ValidationRules(t *testing.T) {
	if MaxMessageSize != 65536 {
		t.Errorf("MaxMessageSize = %d, want 65536 (64KB)", MaxMessageSize)
	}
	if MessageTTL != 300 {
		t.Errorf("MessageTTL = %d, want 300 (5 minutes)", MessageTTL)
	}
	if MaxHops != 10 {
		t.Errorf("MaxHops = %d, want 10", MaxHops)
	}
	if ProtocolVersion != "0.1.0" {
		t.Errorf("ProtocolVersion = %s, want 0.1.0", ProtocolVersion)
	}
}

func TestCompat_PrepareForRelay(t *testing.T) {
	msg, _ := NewPing("original-sender")
	msg.Hops = 3

	relayed := PrepareForRelay(msg)
	if relayed == nil {
		t.Fatal("PrepareForRelay returned nil")
	}

	if relayed.Hops != 4 {
		t.Errorf("relay hops = %d, want 4", relayed.Hops)
	}
	if relayed.SenderID != msg.SenderID {
		t.Errorf("relay changed sender: %s != %s", relayed.SenderID, msg.SenderID)
	}
}
