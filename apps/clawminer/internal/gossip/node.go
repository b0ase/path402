package gossip

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/libp2p/go-libp2p"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	libp2pcrypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	"github.com/multiformats/go-multiaddr"
)

// Node wraps a libp2p host with GossipSub pub/sub.
type Node struct {
	nodeID      string
	port        int
	maxPeers    int
	identityKey libp2pcrypto.PrivKey
	host        host.Host
	ps          *pubsub.PubSub
	topics      map[string]*pubsub.Topic
	subs        map[string]*pubsub.Subscription
	handler     MessageHandler
	seenMsgs    map[string]bool
	seenMu      sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	mu          sync.RWMutex
}

// MessageHandler is called when a validated message arrives.
type MessageHandler func(msg *GossipMessage)

// NewNode creates a gossip node backed by libp2p + GossipSub.
// identityKey is optional — if non-nil, it provides a stable libp2p peer ID across restarts.
func NewNode(nodeID string, port, maxPeers int, identityKey libp2pcrypto.PrivKey) *Node {
	ctx, cancel := context.WithCancel(context.Background())
	return &Node{
		nodeID:      nodeID,
		port:        port,
		maxPeers:    maxPeers,
		identityKey: identityKey,
		topics:      make(map[string]*pubsub.Topic),
		subs:        make(map[string]*pubsub.Subscription),
		seenMsgs:    make(map[string]bool),
		ctx:         ctx,
		cancel:      cancel,
	}
}

// SetHandler registers the message handler.
func (n *Node) SetHandler(h MessageHandler) {
	n.handler = h
}

// Start creates the libp2p host, initializes GossipSub, and subscribes to all topics.
func (n *Node) Start() error {
	listenAddr, err := multiaddr.NewMultiaddr(fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", n.port))
	if err != nil {
		return fmt.Errorf("multiaddr: %w", err)
	}

	opts := []libp2p.Option{
		libp2p.ListenAddrs(listenAddr),
		libp2p.ConnectionManager(nil),
	}
	if n.identityKey != nil {
		opts = append(opts, libp2p.Identity(n.identityKey))
	}

	h, err := libp2p.New(opts...)
	if err != nil {
		return fmt.Errorf("libp2p new: %w", err)
	}
	n.host = h

	log.Printf("[gossip] libp2p peer ID: %s", h.ID().String())
	for _, addr := range h.Addrs() {
		log.Printf("[gossip] Listening on %s/p2p/%s", addr, h.ID())
	}

	// Create GossipSub
	ps, err := pubsub.NewGossipSub(n.ctx, h)
	if err != nil {
		return fmt.Errorf("gossipsub: %w", err)
	}
	n.ps = ps

	// Subscribe to all $402 topics
	for _, topicName := range AllTopics() {
		topic, err := ps.Join(topicName)
		if err != nil {
			return fmt.Errorf("join topic %s: %w", topicName, err)
		}
		n.topics[topicName] = topic

		sub, err := topic.Subscribe()
		if err != nil {
			return fmt.Errorf("subscribe %s: %w", topicName, err)
		}
		n.subs[topicName] = sub

		go n.readLoop(topicName, sub)
		log.Printf("[gossip] Subscribed to %s", topicName)
	}

	// Start mDNS discovery for local peers
	mdnsService := mdns.NewMdnsService(h, "$402-gossip", &mdnsNotifee{node: n})
	if err := mdnsService.Start(); err != nil {
		log.Printf("[gossip] mDNS start failed (non-fatal): %v", err)
	}

	log.Printf("[gossip] GossipSub ready on port %d", n.port)
	return nil
}

// Stop shuts down the gossip node.
func (n *Node) Stop() {
	n.cancel()
	for _, sub := range n.subs {
		sub.Cancel()
	}
	for _, topic := range n.topics {
		topic.Close()
	}
	if n.host != nil {
		n.host.Close()
	}
	log.Println("[gossip] Stopped")
}

// PeerCount returns the number of connected libp2p peers.
func (n *Node) PeerCount() int {
	if n.host == nil {
		return 0
	}
	return len(n.host.Network().Peers())
}

// PeerID returns this node's libp2p peer ID.
func (n *Node) PeerID() string {
	if n.host == nil {
		return ""
	}
	return n.host.ID().String()
}

// ConnectedPeers returns the list of connected peer IDs.
func (n *Node) ConnectedPeers() []string {
	if n.host == nil {
		return nil
	}
	peers := n.host.Network().Peers()
	ids := make([]string, len(peers))
	for i, p := range peers {
		ids[i] = p.String()
	}
	return ids
}

// Publish sends a GossipMessage to the appropriate topic.
func (n *Node) Publish(msg *GossipMessage) error {
	data, err := Serialize(msg)
	if err != nil {
		return err
	}

	// Mark as seen
	hash := HashMessage(msg)
	n.seenMu.Lock()
	n.seenMsgs[hash] = true
	n.seenMu.Unlock()

	topicName := TopicForType(msg.Type)
	n.mu.RLock()
	topic, ok := n.topics[topicName]
	n.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown topic for message type %s", msg.Type)
	}

	return topic.Publish(n.ctx, data)
}

// ConnectToPeer dials a remote peer by multiaddr or host:port.
func (n *Node) ConnectToPeer(addr string, port int) error {
	if n.host == nil {
		return fmt.Errorf("host not started")
	}

	var ma multiaddr.Multiaddr
	var err error

	if addr[0] == '/' {
		// Already a multiaddr
		ma, err = multiaddr.NewMultiaddr(addr)
	} else {
		// host:port format
		ma, err = multiaddr.NewMultiaddr(fmt.Sprintf("/ip4/%s/tcp/%d", addr, port))
	}
	if err != nil {
		return fmt.Errorf("parse multiaddr: %w", err)
	}

	peerInfo, err := peer.AddrInfoFromP2pAddr(ma)
	if err != nil {
		// If no peer ID in address, just try to connect
		peerInfo = &peer.AddrInfo{Addrs: []multiaddr.Multiaddr{ma}}
	}

	if err := n.host.Connect(n.ctx, *peerInfo); err != nil {
		return fmt.Errorf("connect: %w", err)
	}

	log.Printf("[gossip] Connected to %s", ma)
	return nil
}

func (n *Node) readLoop(topicName string, sub *pubsub.Subscription) {
	for {
		pmsg, err := sub.Next(n.ctx)
		if err != nil {
			return // context cancelled
		}

		// Skip messages from self
		if pmsg.ReceivedFrom == n.host.ID() {
			continue
		}

		var msg GossipMessage
		if err := json.Unmarshal(pmsg.Data, &msg); err != nil {
			log.Printf("[gossip] Bad message on %s: %v", topicName, err)
			continue
		}

		// Dedup
		hash := HashMessage(&msg)
		n.seenMu.Lock()
		if n.seenMsgs[hash] {
			n.seenMu.Unlock()
			continue
		}
		n.seenMsgs[hash] = true
		n.seenMu.Unlock()

		// Validate
		result := ValidateMessage(&msg)
		if !result.Valid {
			log.Printf("[gossip] Invalid message on %s from %s: %s", topicName, pmsg.ReceivedFrom, result.Error)
			continue
		}

		if n.handler != nil {
			n.handler(&msg)
		}
	}
}

// ── mDNS Discovery ────────────────────────────────────────────────

type mdnsNotifee struct {
	node *Node
}

func (m *mdnsNotifee) HandlePeerFound(pi peer.AddrInfo) {
	if m.node.host.ID() == pi.ID {
		return // skip self
	}
	log.Printf("[gossip] mDNS discovered peer: %s", pi.ID)
	if err := m.node.host.Connect(m.node.ctx, pi); err != nil {
		// Stale mDNS records from previous ephemeral identities on this machine
		// cause "dial to self attempted" — suppress since it's expected noise.
		if strings.Contains(err.Error(), "dial to self attempted") {
			log.Printf("[gossip] mDNS peer %s is stale self (ignoring)", pi.ID.String()[:16])
			return
		}
		log.Printf("[gossip] mDNS connect to %s failed: %v", pi.ID, err)
	}
}
