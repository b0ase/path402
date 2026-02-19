package daemon

import (
	"fmt"
	"log"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/db"
	"github.com/b0ase/path402/apps/clawminer/internal/gossip"
	"github.com/b0ase/path402/apps/clawminer/internal/mining"
	"github.com/b0ase/path402/apps/clawminer/internal/server"
	"github.com/b0ase/path402/apps/clawminer/internal/wallet"
)

// Daemon orchestrates all ClawMiner subsystems.
type Daemon struct {
	cfg        *config.Config
	nodeID     string
	startTime  time.Time
	wallet     *wallet.Wallet
	gossipNode *gossip.Node
	miner      *mining.ProofOfIndexingService
	httpSrv    *server.Server
	stopCh     chan struct{}
}

// New creates a new daemon instance.
func New(cfg *config.Config) (*Daemon, error) {
	return &Daemon{cfg: cfg, stopCh: make(chan struct{})}, nil
}

// Start initializes and starts all subsystems in order.
func (d *Daemon) Start() error {
	d.startTime = time.Now()

	// 1. Open database
	if err := db.Open(d.cfg.DBPath()); err != nil {
		return fmt.Errorf("db open: %w", err)
	}

	// 2. Get/set node ID
	nodeID, err := db.GetNodeID()
	if err != nil {
		return fmt.Errorf("get node id: %w", err)
	}
	d.nodeID = nodeID
	log.Printf("[daemon] Node ID: %s", nodeID[:16])

	// 3. Load wallet (optional)
	if d.cfg.Wallet.Key != "" {
		w, err := wallet.Load(d.cfg.Wallet.Key)
		if err != nil {
			log.Printf("[daemon] Wallet load failed: %v (continuing without wallet)", err)
		} else {
			d.wallet = w
		}
	} else {
		log.Println("[daemon] No wallet key — mining rewards will use placeholder address")
	}

	minerAddr := "1minerAddressPLACEHOLDER"
	if d.wallet != nil {
		minerAddr = d.wallet.Address
	}

	// 4. Start gossip node
	d.gossipNode = gossip.NewNode(d.nodeID, d.cfg.Gossip.Port, d.cfg.Gossip.MaxPeers)

	handler := gossip.NewHandler(d.nodeID)
	d.gossipNode.SetHandler(handler.HandleMessage)

	if err := d.gossipNode.Start(); err != nil {
		return fmt.Errorf("gossip start: %w", err)
	}

	// Connect to bootstrap peers
	for _, peer := range d.cfg.Gossip.BootstrapPeers {
		go func(addr string) {
			if err := d.gossipNode.ConnectToPeer(addr, d.cfg.Gossip.Port); err != nil {
				log.Printf("[daemon] Bootstrap peer %s failed: %v", addr, err)
			}
		}(peer)
	}

	// 5. Start mining service
	if d.cfg.Mining.Enabled {
		d.miner = mining.NewProofOfIndexingService(mining.ServiceConfig{
			MinerAddress:      minerAddr,
			Difficulty:        d.cfg.Mining.Difficulty,
			HeartbeatInterval: d.cfg.Mining.HeartbeatInterval,
			MinItems:          d.cfg.Mining.MinItems,
			BatchSize:         d.cfg.Mining.BatchSize,
		})

		// Configure mint broadcaster
		switch d.cfg.Mining.BroadcastMode {
		case "native":
			if d.wallet != nil && d.cfg.Mining.TokenID != "" {
				bsvBroadcaster, err := mining.NewBSVBroadcaster(mining.BSVBroadcasterConfig{
					PrivateKey: d.wallet.PrivateKey,
					ArcURL:     d.cfg.Mining.ArcURL,
					ArcAPIKey:  d.cfg.Mining.ArcAPIKey,
					TokenID:    d.cfg.Mining.TokenID,
					UTXOs:      mining.NewWocUTXOProvider(),
				})
				if err != nil {
					log.Printf("[daemon] Native broadcaster failed to init: %v (falling back to noop)", err)
				} else {
					d.miner.SetBroadcaster(bsvBroadcaster)
					log.Printf("[daemon] Native BSV broadcaster configured (ARC: %s)", d.cfg.Mining.ArcURL)
				}
			} else {
				log.Println("[daemon] Native broadcast requires wallet + token_id")
			}
		case "http":
			if d.cfg.Mining.MintEndpoint != "" && d.cfg.Mining.TokenID != "" {
				httpBroadcaster := mining.NewHTTPBroadcaster(
					d.cfg.Mining.MintEndpoint,
					minerAddr,
					d.cfg.Mining.TokenID,
				)
				d.miner.SetBroadcaster(httpBroadcaster)
				log.Printf("[daemon] HTTP mint broadcaster configured: %s", d.cfg.Mining.MintEndpoint)
			} else {
				log.Println("[daemon] HTTP broadcast requires mint_endpoint + token_id")
			}
		default:
			log.Println("[daemon] No broadcaster configured — blocks mined locally only")
		}

		d.miner.OnBlock(func(event mining.BlockMinedEvent) {
			log.Printf("[daemon] Block mined: %s (%d items)",
				event.Block.Hash[:16], len(event.Block.Items))
		})

		d.miner.OnMintClaimed(func(event mining.MintClaimedEvent) {
			log.Printf("[daemon] Mint claimed! txid=%s amount=%d",
				event.Txid, event.Amount)
		})

		// Wire gossip → mining: validated gossip events become mining work
		handler.SetWorkSubmitter(d.miner.SubmitWork)

		d.miner.Start()
		log.Printf("[daemon] Mining service started (address: %s, difficulty: %d)",
			minerAddr, d.cfg.Mining.Difficulty)
	}

	// 6. Start periodic status logging
	go d.statusLoop()

	// 6. Start HTTP API
	d.httpSrv = server.New(d.cfg.API.Bind, d.cfg.API.Port, d)
	go func() {
		if err := d.httpSrv.Start(); err != nil {
			log.Printf("[daemon] HTTP server error: %v", err)
		}
	}()

	log.Println("[daemon] All systems online")
	return nil
}

func (d *Daemon) statusLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-d.stopCh:
			return
		case <-ticker.C:
			tokens, _ := db.GetAllTokens()
			peers, _ := db.GetActivePeers()
			summary, _ := db.GetPortfolioSummary()
			tokenCount := 0
			if tokens != nil {
				tokenCount = len(tokens)
			}
			peerCount := 0
			if peers != nil {
				peerCount = len(peers)
			}
			pnl := 0
			if summary != nil {
				pnl = summary.TotalPnL
			}
			mining := d.MiningStatus()
			log.Printf("[daemon] Peers: %d | Tokens: %d | PnL: %d SAT | Blocks: %v | Mempool: %v",
				peerCount, tokenCount, pnl, mining["blocks_mined"], mining["mempool_size"])
		}
	}
}

// Stop shuts down all subsystems.
func (d *Daemon) Stop() {
	log.Println("[daemon] Shutting down...")
	close(d.stopCh)

	if d.httpSrv != nil {
		d.httpSrv.Stop()
	}
	if d.miner != nil {
		d.miner.Stop()
	}
	if d.gossipNode != nil {
		d.gossipNode.Stop()
	}
	db.Close()

	log.Println("[daemon] Shutdown complete")
}

// --- Status accessors (used by HTTP API) ---

func (d *Daemon) NodeID() string       { return d.nodeID }
func (d *Daemon) Uptime() time.Duration { return time.Since(d.startTime) }

func (d *Daemon) PeerCount() int {
	if d.gossipNode != nil {
		return d.gossipNode.PeerCount()
	}
	return 0
}

func (d *Daemon) MiningStatus() map[string]interface{} {
	if d.miner != nil {
		return d.miner.Status()
	}
	return map[string]interface{}{"enabled": false}
}
