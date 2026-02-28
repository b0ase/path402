package gossip

import (
	"encoding/json"
	"log"

	"github.com/b0ase/path402/apps/clawminer/internal/db"
)

// WorkSubmitter is called to feed validated gossip events into the mining pipeline.
type WorkSubmitter func(id, workType string, data interface{})

// BlockObserver is called when a block announcement is received from a peer.
// The daemon uses this to verify the block and feed it to the difficulty adjuster.
type BlockObserver func(senderID string, payload *BlockAnnouncePayload)

// TxRelayObserver is called when a TX_RELAY message is received from a peer.
type TxRelayObserver func(senderID string, payload *TxRelayPayload)

// TxRequestObserver is called when a TX_REQUEST message is received from a peer.
type TxRequestObserver func(senderID string, payload *TxRequestPayload)

// ContentOfferObserver is called when a CONTENT_OFFER message is received.
type ContentOfferObserver func(senderID string, payload *ContentOfferPayload)

// ContentRequestObserver is called when a CONTENT_REQUEST message is received.
type ContentRequestObserver func(senderID string, payload *ContentRequestPayload)

// Handler dispatches incoming gossip messages to the appropriate db operations.
type Handler struct {
	nodeID                 string
	submitWork             WorkSubmitter
	blockObserver          BlockObserver
	txRelayObserver        TxRelayObserver
	txRequestObserver      TxRequestObserver
	contentOfferObserver   ContentOfferObserver
	contentRequestObserver ContentRequestObserver
}

func NewHandler(nodeID string) *Handler {
	return &Handler{nodeID: nodeID}
}

// SetWorkSubmitter wires the gossip handler to the mining service.
func (h *Handler) SetWorkSubmitter(fn WorkSubmitter) {
	h.submitWork = fn
}

// SetBlockObserver registers a callback for block announcements from peers.
func (h *Handler) SetBlockObserver(fn BlockObserver) {
	h.blockObserver = fn
}

// SetTxRelayObserver registers a callback for TX_RELAY messages from peers.
func (h *Handler) SetTxRelayObserver(fn TxRelayObserver) {
	h.txRelayObserver = fn
}

// SetTxRequestObserver registers a callback for TX_REQUEST messages from peers.
func (h *Handler) SetTxRequestObserver(fn TxRequestObserver) {
	h.txRequestObserver = fn
}

// SetContentOfferObserver registers a callback for CONTENT_OFFER messages.
func (h *Handler) SetContentOfferObserver(fn ContentOfferObserver) {
	h.contentOfferObserver = fn
}

// SetContentRequestObserver registers a callback for CONTENT_REQUEST messages.
func (h *Handler) SetContentRequestObserver(fn ContentRequestObserver) {
	h.contentRequestObserver = fn
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
	case MsgBlockAnnounce:
		h.handleBlockAnnounce(msg)
	case MsgTxRelay:
		h.handleTxRelay(msg)
	case MsgTxRequest:
		h.handleTxRequest(msg)
	case MsgContentOffer:
		h.handleContentOffer(msg)
	case MsgContentRequest:
		h.handleContentRequest(msg)
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

func (h *Handler) handleBlockAnnounce(msg *GossipMessage) {
	var payload BlockAnnouncePayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad BLOCK_ANNOUNCE payload: %v", err)
		return
	}

	log.Printf("[gossip] Block from %s: %s (height %d, difficulty %d, %d items)",
		msg.SenderID[:min(16, len(msg.SenderID))], payload.Hash[:min(16, len(payload.Hash))],
		payload.Height, payload.Bits, payload.ItemCount)

	if h.blockObserver != nil {
		h.blockObserver(msg.SenderID, &payload)
	}
}

func (h *Handler) handleTxRelay(msg *GossipMessage) {
	var payload TxRelayPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad TX_RELAY payload: %v", err)
		return
	}
	txidShort := payload.Txid
	if len(txidShort) > 16 {
		txidShort = txidShort[:16]
	}
	log.Printf("[gossip] TX_RELAY: %s... from %s (source: %s)",
		txidShort, msg.SenderID[:min(8, len(msg.SenderID))], payload.Source)

	if h.txRelayObserver != nil {
		h.txRelayObserver(msg.SenderID, &payload)
	}
}

func (h *Handler) handleTxRequest(msg *GossipMessage) {
	var payload TxRequestPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad TX_REQUEST payload: %v", err)
		return
	}
	txidShort := payload.Txid
	if len(txidShort) > 16 {
		txidShort = txidShort[:16]
	}
	log.Printf("[gossip] TX_REQUEST: %s... from %s", txidShort, msg.SenderID[:min(8, len(msg.SenderID))])

	if h.txRequestObserver != nil {
		h.txRequestObserver(msg.SenderID, &payload)
	}
}

func (h *Handler) handleContentOffer(msg *GossipMessage) {
	var payload ContentOfferPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad CONTENT_OFFER payload: %v", err)
		return
	}

	hashShort := payload.ContentHash
	if len(hashShort) > 16 {
		hashShort = hashShort[:16]
	}
	log.Printf("[gossip] CONTENT_OFFER: %s (%d bytes, %d sats) from %s",
		hashShort, payload.ContentSize, payload.PriceSats, msg.SenderID[:min(16, len(msg.SenderID))])

	if h.contentOfferObserver != nil {
		h.contentOfferObserver(msg.SenderID, &payload)
	}
}

func (h *Handler) handleContentRequest(msg *GossipMessage) {
	var payload ContentRequestPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[gossip] Bad CONTENT_REQUEST payload: %v", err)
		return
	}

	hashShort := payload.ContentHash
	if len(hashShort) > 16 {
		hashShort = hashShort[:16]
	}
	log.Printf("[gossip] CONTENT_REQUEST: %s from %s (payment: %s)",
		hashShort, msg.SenderID[:min(16, len(msg.SenderID))], payload.PaymentTxid)

	// Feed to mining pipeline — serving content is real work
	if h.submitWork != nil && payload.PaymentTxid != "" {
		h.submitWork("content:"+payload.ContentHash, "content_served", map[string]interface{}{
			"token_id":     payload.TokenID,
			"content_hash": payload.ContentHash,
			"requester":    payload.RequesterAddress,
			"payment_txid": payload.PaymentTxid,
		})
	}

	if h.contentRequestObserver != nil {
		h.contentRequestObserver(msg.SenderID, &payload)
	}
}

func (h *Handler) handlePing(msg *GossipMessage) {
	// Ping handling — in Phase 1 we just log it
	log.Printf("[gossip] PING from %s", msg.SenderID)
}
