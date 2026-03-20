package gossip

// GossipSub topic names — must match TypeScript implementation exactly.
const (
	TopicTokens    = "$402/tokens/v1"
	TopicTransfers = "$402/transfers/v1"
	TopicStamps    = "$402/stamps/v1"
	TopicChat      = "$402/chat/v1"
	TopicContent   = "$402/content/v1"
	TopicBlocks    = "$402/blocks/v1"
	TopicRelay     = "$402/relay/v1"
	TopicUhrp      = "$402/uhrp/v1"
)

// AllTopics returns the list of topics a ClawMiner subscribes to.
func AllTopics() []string {
	return []string{
		TopicTokens,
		TopicTransfers,
		TopicStamps,
		TopicChat,
		TopicContent,
		TopicBlocks,
		TopicRelay,
		TopicUhrp,
	}
}

// TopicForType maps a MessageType to its GossipSub topic.
func TopicForType(mt MessageType) string {
	switch mt {
	case MsgAnnounceToken, MsgRequestToken, MsgTokenData:
		return TopicTokens
	case MsgTransferEvent, MsgHolderUpdate:
		return TopicTransfers
	case MsgTicketStamp:
		return TopicStamps
	case MsgChatMessage:
		return TopicChat
	case MsgContentRequest, MsgContentOffer:
		return TopicContent
	case MsgBlockAnnounce:
		return TopicBlocks
	case MsgTxRelay, MsgTxRequest, MsgTxResponse:
		return TopicRelay
	case MsgUhrpAdvertise, MsgUhrpResolve, MsgUhrpResponse:
		return TopicUhrp
	default:
		return TopicTokens // HELLO, PING, PONG go on the default topic
	}
}
