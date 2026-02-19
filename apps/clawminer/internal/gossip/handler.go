package gossip

import (
	"encoding/json"
	"log"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// WorkSubmitter is called to feed validated gossip events into the mining pipeline.
type WorkSubmitter func(id, workType string, data interface{})

// Handler dispatches incoming gossip messages to the appropriate db operations.
type Handler struct {
	nodeID        string
	submitWork    WorkSubmitter
}

func NewHandler(nodeID string) *Handler {
	return &Handler{nodeID: nodeID}
}

// SetWorkSubmitter wires the gossip handler to the mining service.
func (h *Handler) SetWorkSubmitter(fn WorkSubmitter) {
	h.submitWork = fn
}

// HandleMessage processes an incoming GossipMessage.
func (h *Handler) HandleMessage(msg *GossipMessage) {
	switch msg.Type {
	case MsgHello:
		h.handleHello(msg)
	case MsgAnnounceToken:
		h.handleAnnounceToken(msg)
	case MsgTransferEvent:
		h.handleTransferEvent(msg)
	case MsgTicketStamp:
		h.handleTicketStamp(msg)
	case MsgChatMessage:
		h.handleChat(msg)
	case MsgPing:
		h.handlePing(msg)
	default:
		log.Printf("[gossip] Unhandled message type: %s from %s", msg.Type, msg.SenderID)
	}
}

func (h *Handler) handleHello(msg *GossipMessage) {
	var payload HelloPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad HELLO payload: %v", err)
		return
	}
	log.Printf("[gossip] HELLO from %s (v%s, %d tokens, port %d)",
		payload.NodeID, payload.Version, payload.TokensCount, payload.ListeningPort)
}

func (h *Handler) handleAnnounceToken(msg *GossipMessage) {
	var payload AnnounceTokenPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad ANNOUNCE_TOKEN payload: %v", err)
		return
	}

	peerID := msg.SenderID
	token := &db.Token{
		TokenID:       payload.TokenID,
		BasePriceSats: payload.BasePrice,
		PricingModel:  payload.PricingModel,
		CurrentSupply: payload.CurrentSupply,
		GossipPeerID:  &peerID,
	}
	if payload.Name != "" {
		token.Name = &payload.Name
	}
	via := "gossip"
	token.DiscoveredVia = &via

	if err := db.InsertToken(token); err != nil {
		log.Printf("[gossip] Failed to store token %s: %v", payload.TokenID, err)
		return
	}
	log.Printf("[gossip] Token discovered: %s (supply: %d)", payload.TokenID, payload.CurrentSupply)

	// Feed to mining pipeline — indexing a token is real work
	if h.submitWork != nil {
		h.submitWork("token:"+payload.TokenID, "validation", map[string]interface{}{
			"token_id": payload.TokenID,
			"supply":   payload.CurrentSupply,
			"from":     msg.SenderID,
		})
	}
}

func (h *Handler) handleTransferEvent(msg *GossipMessage) {
	var payload TransferEventPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad TRANSFER_EVENT payload: %v", err)
		return
	}

	peer := msg.SenderID
	t := &db.Transfer{
		TokenID:          payload.TokenID,
		ToAddress:        payload.ToAddress,
		Amount:           payload.Amount,
		ReceivedFromPeer: &peer,
	}
	if payload.FromAddress != "" {
		t.FromAddress = &payload.FromAddress
	}
	if payload.Txid != "" {
		t.Txid = &payload.Txid
	}

	if err := db.InsertTransfer(t); err != nil {
		log.Printf("[gossip] Failed to store transfer: %v", err)
		return
	}
	log.Printf("[gossip] Transfer: %d of %s → %s", payload.Amount, payload.TokenID, payload.ToAddress)

	// Feed to mining pipeline — indexing a transfer is real work
	if h.submitWork != nil {
		workID := "transfer:" + payload.TokenID
		if payload.Txid != "" {
			workID = "transfer:" + payload.Txid
		}
		h.submitWork(workID, "validation", map[string]interface{}{
			"token_id": payload.TokenID,
			"amount":   payload.Amount,
			"to":       payload.ToAddress,
		})
	}
}

func (h *Handler) handleTicketStamp(msg *GossipMessage) {
	var payload TicketStampPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	log.Printf("[gossip] Stamp: %s on %s by %s", payload.Address, payload.TokenID, payload.IndexerPubkey[:16])
}

func (h *Handler) handleChat(msg *GossipMessage) {
	var payload ChatPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	handle := payload.SenderHandle
	if handle == "" {
		handle = payload.SenderAddress[:8]
	}
	log.Printf("[gossip] Chat [%s] %s: %s", payload.Channel, handle, payload.Content)
}

func (h *Handler) handlePing(msg *GossipMessage) {
	// Ping handling — in Phase 1 we just log it
	log.Printf("[gossip] PING from %s", msg.SenderID)
}
