package gossip

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p"
	dht "github.com/libp2p/go-libp2p-kad-dht"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	libp2pcrypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	drouting "github.com/libp2p/go-libp2p/p2p/discovery/routing"
	"github.com/multiformats/go-multiaddr"
)

// Node wraps a libp2p host with GossipSub pub/sub.
type Node struct {
	nodeID      string
	port        int
	maxPeers    int
	enableDHT   bool
	identityKey libp2pcrypto.PrivKey
	host        host.Host
	dht         *dht.IpfsDHT
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
// enableDHT activates Kademlia DHT for peer discovery beyond the local network.
func NewNode(nodeID string, port, maxPeers int, identityKey libp2pcrypto.PrivKey, enableDHT bool) *Node {
	ctx, cancel := context.WithCancel(context.Background())
	return &Node{
		nodeID:      nodeID,
		port:        port,
		maxPeers:    maxPeers,
		enableDHT:   enableDHT,
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

	// On Android, net.InterfaceAddrs() fails (netlinkrib: permission denied)
	// so libp2p only advertises 127.0.0.1. Use AddrsFactory to include
	// the real LAN IP discovered via a UDP dial (which uses socket API, not netlink).
	if localIP := resolveLocalIP(); localIP != "" {
		lanAddr, err2 := multiaddr.NewMultiaddr(fmt.Sprintf("/ip4/%s/tcp/%d", localIP, n.port))
		if err2 == nil {
			opts = append(opts, libp2p.AddrsFactory(func(addrs []multiaddr.Multiaddr) []multiaddr.Multiaddr {
				// Check if the LAN address is already present
				for _, a := range addrs {
					if a.Equal(lanAddr) {
						return addrs
					}
				}
				return append(addrs, lanAddr)
			}))
			log.Printf("[gossip] AddrsFactory: injecting LAN address %s", lanAddr)
		}
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

	// Initialize Kademlia DHT for peer routing/discovery
	var gossipOpts []pubsub.Option
	if n.enableDHT {
		kadDHT, err := dht.New(n.ctx, h, dht.Mode(dht.ModeAutoServer))
		if err != nil {
			return fmt.Errorf("dht new: %w", err)
		}
		if err := kadDHT.Bootstrap(n.ctx); err != nil {
			return fmt.Errorf("dht bootstrap: %w", err)
		}
		n.dht = kadDHT

		routingDisc := drouting.NewRoutingDiscovery(kadDHT)
		gossipOpts = append(gossipOpts, pubsub.WithDiscovery(routingDisc))
		log.Println("[gossip] Kademlia DHT enabled (mode: auto-server)")
	}

	// Create GossipSub (with DHT discovery if enabled)
	ps, err := pubsub.NewGossipSub(n.ctx, h, gossipOpts...)
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

	// Start explicit DHT rendezvous discovery (works even when mDNS fails, e.g. Android)
	if n.enableDHT && n.dht != nil {
		routingDisc := drouting.NewRoutingDiscovery(n.dht)
		go n.dhtDiscoveryLoop(routingDisc)
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
	if n.dht != nil {
		n.dht.Close()
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

// BootstrapDHT connects to the given multiaddr peers and adds them to the
// DHT routing table. It also starts a background loop that reconnects every
// 30 seconds if no peers are connected (critical for Android where mDNS is
// unavailable and DHT bootstrap is the only discovery path).
func (n *Node) BootstrapDHT(peers []string) {
	if n.dht == nil || n.host == nil {
		return
	}

	peerInfos := n.parseBootstrapPeers(peers)
	n.connectToBootstrapPeers(peerInfos)

	// Periodic reconnection loop
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-n.ctx.Done():
				return
			case <-ticker.C:
				if len(n.host.Network().Peers()) == 0 {
					log.Println("[gossip] No peers connected, reconnecting to bootstrap...")
					n.connectToBootstrapPeers(peerInfos)
				}
			}
		}
	}()
}

func (n *Node) parseBootstrapPeers(peers []string) []peer.AddrInfo {
	var infos []peer.AddrInfo
	for _, addr := range peers {
		ma, err := multiaddr.NewMultiaddr(addr)
		if err != nil {
			log.Printf("[gossip] Bad bootstrap multiaddr %q: %v", addr, err)
			continue
		}
		pi, err := peer.AddrInfoFromP2pAddr(ma)
		if err != nil {
			log.Printf("[gossip] Bootstrap addr %q missing peer ID: %v", addr, err)
			continue
		}
		infos = append(infos, *pi)
	}
	return infos
}

func (n *Node) connectToBootstrapPeers(peers []peer.AddrInfo) {
	for _, pi := range peers {
		go func(pi peer.AddrInfo) {
			ctx, cancel := context.WithTimeout(n.ctx, 15*time.Second)
			defer cancel()
			if err := n.host.Connect(ctx, pi); err != nil {
				log.Printf("[gossip] Bootstrap peer %s connect failed: %v", pi.ID.String()[:16], err)
				return
			}
			log.Printf("[gossip] Connected to bootstrap peer %s", pi.ID.String()[:16])
		}(pi)
	}
}

const dhtRendezvous = "$402-gossip-v1"

// dhtDiscoveryLoop advertises this node on the DHT rendezvous namespace,
// searches for peers via rendezvous, and also crawls the DHT routing table
// directly. This is the primary discovery mechanism on Android where mDNS
// doesn't work. The routing table crawl finds peers even if they haven't
// explicitly advertised on the rendezvous namespace.
func (n *Node) dhtDiscoveryLoop(routingDisc *drouting.RoutingDiscovery) {
	// Wait for bootstrap connection before starting discovery
	time.Sleep(5 * time.Second)

	// Advertise ourselves on rendezvous
	_, err := routingDisc.Advertise(n.ctx, dhtRendezvous)
	if err != nil {
		log.Printf("[gossip] DHT advertise failed: %v", err)
	} else {
		log.Printf("[gossip] DHT: advertising on rendezvous %q", dhtRendezvous)
	}

	// Immediately try to discover peers via DHT routing table
	n.crawlDHTRoutingTable()

	// Periodic discovery loop
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-n.ctx.Done():
			return
		case <-ticker.C:
			// Try rendezvous-based discovery
			n.findRendezvousPeers(routingDisc)
			// Also crawl the DHT routing table for any known peers
			n.crawlDHTRoutingTable()
			// Re-advertise (TTL expires)
			routingDisc.Advertise(n.ctx, dhtRendezvous)
		}
	}
}

// findRendezvousPeers searches for peers that have advertised on the
// $402-gossip-v1 rendezvous namespace.
func (n *Node) findRendezvousPeers(routingDisc *drouting.RoutingDiscovery) {
	ctx, cancel := context.WithTimeout(n.ctx, 10*time.Second)
	defer cancel()

	peerCh, err := routingDisc.FindPeers(ctx, dhtRendezvous)
	if err != nil {
		return
	}

	for pi := range peerCh {
		if pi.ID == n.host.ID() || pi.ID == "" {
			continue
		}
		if n.host.Network().Connectedness(pi.ID) == 1 {
			continue
		}
		connCtx, connCancel := context.WithTimeout(n.ctx, 10*time.Second)
		if err := n.host.Connect(connCtx, pi); err != nil {
			log.Printf("[gossip] DHT rendezvous peer %s connect failed: %v", pi.ID.String()[:16], err)
		} else {
			log.Printf("[gossip] DHT: connected to rendezvous peer %s", pi.ID.String()[:16])
		}
		connCancel()
	}
}

// crawlDHTRoutingTable queries the DHT for peers close to our own ID,
// which populates the routing table. Then it tries to connect to any
// new peers found. This works even if peers haven't advertised on a
// specific rendezvous namespace — any peer the bootstrap knows about
// can be discovered this way.
func (n *Node) crawlDHTRoutingTable() {
	if n.dht == nil {
		return
	}

	ctx, cancel := context.WithTimeout(n.ctx, 15*time.Second)
	defer cancel()

	// Phase 1: GetClosestPeers queries the DHT network and populates the
	// local routing table with peers near our ID in XOR keyspace.
	n.dht.GetClosestPeers(ctx, string(n.host.ID()))

	// Phase 2: Try connecting to ALL peers in the routing table. This
	// includes peers discovered through GossipSub, mDNS on other nodes,
	// and transitive DHT queries — not just the closest ones.
	rtPeers := n.dht.RoutingTable().ListPeers()

	connected := 0
	for _, pid := range rtPeers {
		if pid == n.host.ID() {
			continue
		}
		if n.host.Network().Connectedness(pid) == 1 {
			continue
		}

		addrs := n.host.Peerstore().Addrs(pid)
		if len(addrs) == 0 {
			continue
		}

		pi := peer.AddrInfo{ID: pid, Addrs: addrs}
		connCtx, connCancel := context.WithTimeout(n.ctx, 10*time.Second)
		if err := n.host.Connect(connCtx, pi); err != nil {
			log.Printf("[gossip] DHT peer %s connect failed: %v", pid.String()[:16], err)
		} else {
			log.Printf("[gossip] DHT: connected to peer %s (%d addrs)", pid.String()[:16], len(addrs))
			connected++
		}
		connCancel()
	}

	totalPeers := len(n.host.Network().Peers())
	if connected > 0 {
		log.Printf("[gossip] DHT crawl: %d in routing table, connected %d new, total %d peers",
			len(rtPeers), connected, totalPeers)
	} else {
		log.Printf("[gossip] DHT crawl: %d in routing table, %d connected", len(rtPeers), totalPeers)
	}
}

// ── mDNS Discovery ────────────────────────────────────────────────

type mdnsNotifee struct {
	node *Node
}

// resolveLocalIP returns the LAN IP address by opening a UDP socket.
// This works even on Android where net.InterfaceAddrs() fails, because
// the socket API is allowed (only netlink is restricted).
func resolveLocalIP() string {
	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	addr := conn.LocalAddr().(*net.UDPAddr)
	if addr.IP.IsLoopback() || addr.IP.IsUnspecified() {
		return ""
	}
	return addr.IP.String()
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
