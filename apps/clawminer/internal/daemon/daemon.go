package daemon

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/b0ase/path402/apps/clawminer/internal/config"
	"github.com/b0ase/path402/apps/clawminer/internal/db"
	"github.com/b0ase/path402/apps/clawminer/internal/gossip"
	"github.com/b0ase/path402/apps/clawminer/internal/headers"
	"github.com/b0ase/path402/apps/clawminer/internal/mining"
	"github.com/b0ase/path402/apps/clawminer/internal/server"
	"github.com/b0ase/path402/apps/clawminer/internal/wallet"
	libp2pcrypto "github.com/libp2p/go-libp2p/core/crypto"
)

// Daemon orchestrates all ClawMiner subsystems.
type Daemon struct {
	cfg        *config.Config
	nodeID     string
	startTime  time.Time
	wallet     *wallet.Wallet
	gossipNode *gossip.Node
	miner      *mining.ProofOfIndexingService
	headerSync *headers.SyncService
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

	// 3. Load wallet
	//    WIF (config/env) → signing key for native broadcasting
	//    Address (config/env) → reward attribution (overrides key's derived address)
	//    DB-saved WIF → signing key from previous auto-gen
	//    Auto-generate → new keypair, saved to DB
	minerAddr := ""
	if d.cfg.Wallet.Key != "" {
		w, err := wallet.Load(d.cfg.Wallet.Key)
		if err != nil {
			log.Printf("[wallet] WIF load failed: %v (continuing without signing key)", err)
		} else {
			d.wallet = w
			minerAddr = w.Address
			log.Printf("[wallet] Loaded signing key (funding address: %s)", w.Address)
		}
	}
	// Configured address overrides key's derived address for reward attribution
	if d.cfg.Wallet.Address != "" {
		if minerAddr != "" && minerAddr != d.cfg.Wallet.Address {
			log.Printf("[wallet] Mining rewards → %s (funding via %s)", d.cfg.Wallet.Address, minerAddr)
		} else {
			log.Printf("[wallet] Mining rewards → %s", d.cfg.Wallet.Address)
		}
		minerAddr = d.cfg.Wallet.Address
	}
	if minerAddr == "" {
		// Try loading a previously saved WIF from DB
		if savedWIF, err := db.GetConfig("wallet_wif"); err == nil && savedWIF != "" {
			w, err := wallet.Load(savedWIF)
			if err != nil {
				log.Printf("[wallet] DB WIF load failed: %v (will regenerate)", err)
			} else {
				d.wallet = w
				minerAddr = w.Address
				log.Printf("[wallet] Loaded persisted wallet: %s", minerAddr)
			}
		}
	}
	if minerAddr == "" {
		// Generate a fresh wallet and persist to DB
		w, err := wallet.Generate()
		if err != nil {
			return fmt.Errorf("generate wallet: %w", err)
		}
		if err := db.SetConfig("wallet_wif", w.WIF); err != nil {
			log.Printf("[wallet] WARNING: Failed to persist wallet WIF: %v", err)
		}
		d.wallet = w
		minerAddr = w.Address
		log.Printf("[wallet] Generated and saved new wallet: %s", minerAddr)
	}

	// 3.5 Start header sync service
	headerStore := headers.NewHeaderStore()
	if err := headerStore.EnsureSchema(); err != nil {
		log.Printf("[headers] WARNING: Schema init failed: %v", err)
	} else {
		d.headerSync = headers.NewSyncService(headers.SyncConfig{
			BHSURL:       d.cfg.Headers.BHSURL,
			BHSAPIKey:    d.cfg.Headers.BHSAPIKey,
			SyncOnBoot:   d.cfg.Headers.SyncOnBoot,
			PollInterval: d.cfg.Headers.PollInterval,
			BatchSize:    d.cfg.Headers.BatchSize,
		}, headerStore)
		d.headerSync.Start()
	}

	// 4. Start gossip node (with persistent identity)
	identityKey, err := loadOrCreateLibp2pIdentity()
	if err != nil {
		log.Printf("[gossip] WARNING: Failed to load/create identity: %v (using ephemeral)", err)
	}
	d.gossipNode = gossip.NewNode(d.nodeID, d.cfg.Gossip.Port, d.cfg.Gossip.MaxPeers, identityKey, d.cfg.Gossip.EnableDHT)

	handler := gossip.NewHandler(d.nodeID)
	d.gossipNode.SetHandler(handler.HandleMessage)

	if err := d.gossipNode.Start(); err != nil {
		return fmt.Errorf("gossip start: %w", err)
	}

	// Connect to bootstrap peers via DHT routing table
	if len(d.cfg.Gossip.BootstrapPeers) > 0 {
		d.gossipNode.BootstrapDHT(d.cfg.Gossip.BootstrapPeers)
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

		// Initialize difficulty adjuster (Bitcoin-style)
		adjustmentPeriod := d.cfg.Mining.AdjustmentPeriod
		if adjustmentPeriod < 1 {
			adjustmentPeriod = 144
		}
		targetBlockTime := d.cfg.Mining.TargetBlockTime
		if targetBlockTime <= 0 {
			targetBlockTime = 10 * time.Minute
		}
		da := mining.NewDifficultyAdjuster(d.cfg.Mining.Difficulty, adjustmentPeriod, targetBlockTime)
		d.miner.SetDifficultyAdjuster(da)
		log.Printf("[daemon] Difficulty adjuster: target %v blocks, adjust every %d blocks",
			targetBlockTime, adjustmentPeriod)

		// Restore chain state from database
		if tipHash, tipHeight, err := db.GetChainTip(); err == nil {
			d.miner.SetLastBlockHash(tipHash)
			ownCount, _ := db.GetOwnBlockCount()
			d.miner.SetBlocksMined(ownCount)

			// Restore difficulty target
			if savedTarget, err := db.GetConfig("difficulty_target"); err == nil && savedTarget != "" {
				target := new(big.Int)
				if _, ok := target.SetString(savedTarget, 16); ok {
					// Restore full adjuster state with recent timestamps
					totalCount, _ := db.GetPoIBlockCount()
					timestamps, _ := db.GetBlockTimestampsSince(time.Now().Add(-time.Duration(adjustmentPeriod) * targetBlockTime))
					da.RestoreState(target, int64(totalCount), timestamps)
				}
			}

			log.Printf("[daemon] Restored chain: height=%d, tip=%s, own_blocks=%d, difficulty=%d",
				tipHeight, tipHash[:min(16, len(tipHash))], ownCount, da.Difficulty())
		}

		// Wire block storage: mined blocks → database
		d.miner.SetBlockStorage(func(block *mining.IndexerBlock, height int, isOwn bool) {
			targetHex := da.TargetHex()
			poiBlock := &db.PoIBlock{
				Hash:         block.Hash,
				Height:       height,
				PrevHash:     block.Header.PrevHash,
				MerkleRoot:   block.Header.MerkleRoot,
				MinerAddress: block.Header.MinerAddress,
				Timestamp:    block.Header.Timestamp,
				Bits:         block.Header.Bits,
				Nonce:        int64(block.Header.Nonce),
				Version:      block.Header.Version,
				ItemCount:    len(block.Items),
				IsOwn:        isOwn,
				TargetHex:    &targetHex,
			}
			if isOwn && len(block.Items) > 0 {
				itemsJSON, _ := json.Marshal(block.Items)
				itemsStr := string(itemsJSON)
				poiBlock.ItemsJSON = &itemsStr
			}
			if err := db.InsertPoIBlock(poiBlock); err != nil {
				log.Printf("[daemon] Failed to store block %s: %v", block.Hash[:16], err)
			}
		})

		// Wire block announcements: mined blocks → gossip network
		d.miner.SetBlockAnnouncer(func(block *mining.IndexerBlock, height int) {
			if d.gossipNode == nil {
				return
			}
			payload := &gossip.BlockAnnouncePayload{
				Hash:         block.Hash,
				Height:       height,
				MinerAddress: block.Header.MinerAddress,
				Timestamp:    block.Header.Timestamp,
				Bits:         block.Header.Bits,
				TargetHex:    da.TargetHex(),
				MerkleRoot:   block.Header.MerkleRoot,
				PrevHash:     block.Header.PrevHash,
				Nonce:        block.Header.Nonce,
				Version:      block.Header.Version,
				ItemCount:    len(block.Items),
			}
			msg, err := gossip.NewBlockAnnounce(d.nodeID, payload)
			if err != nil {
				log.Printf("[daemon] Failed to create block announce: %v", err)
				return
			}
			if err := d.gossipNode.Publish(msg); err != nil {
				log.Printf("[daemon] Failed to publish block announce: %v", err)
			} else {
				log.Printf("[daemon] Block announced to network: %s (height %d)", block.Hash[:16], height)
			}
		})

		// Wire gossip block announcements → difficulty adjuster
		handler.SetBlockObserver(func(senderID string, payload *gossip.BlockAnnouncePayload) {
			// Verify the PoW: reconstruct header, hash it, check difficulty
			header := &mining.BlockHeader{
				Version:      payload.Version,
				PrevHash:     payload.PrevHash,
				MerkleRoot:   payload.MerkleRoot,
				Timestamp:    payload.Timestamp,
				Bits:         payload.Bits,
				Nonce:        payload.Nonce,
				MinerAddress: payload.MinerAddress,
			}
			hash := mining.CalculateBlockHash(header)
			if hash != payload.Hash {
				log.Printf("[daemon] REJECTED block from %s: hash mismatch (got %s, claimed %s)",
					senderID[:min(16, len(senderID))], hash[:16], payload.Hash[:16])
				return
			}
			if !mining.CheckDifficulty(hash, payload.Bits) {
				log.Printf("[daemon] REJECTED block from %s: difficulty not met (bits=%d)",
					senderID[:min(16, len(senderID))], payload.Bits)
				return
			}

			// Valid block from peer — feed to difficulty adjuster
			ts := time.UnixMilli(payload.Timestamp)
			da.RecordBlock(ts)
			log.Printf("[daemon] Accepted peer block: %s from %s (difficulty %d)",
				payload.Hash[:16], senderID[:min(16, len(senderID))], payload.Bits)

			// Store peer block in database
			peerID := senderID
			targetHex := payload.TargetHex
			if err := db.InsertPoIBlock(&db.PoIBlock{
				Hash:         payload.Hash,
				Height:       payload.Height,
				PrevHash:     payload.PrevHash,
				MerkleRoot:   payload.MerkleRoot,
				MinerAddress: payload.MinerAddress,
				Timestamp:    payload.Timestamp,
				Bits:         payload.Bits,
				Nonce:        int64(payload.Nonce),
				Version:      payload.Version,
				ItemCount:    payload.ItemCount,
				IsOwn:        false,
				SourcePeer:   &peerID,
				TargetHex:    &targetHex,
			}); err != nil {
				log.Printf("[daemon] Failed to store peer block %s: %v", payload.Hash[:16], err)
			}
		})

		// Configure mint broadcaster
		switch d.cfg.Mining.BroadcastMode {
		case "native":
			if d.wallet != nil && d.cfg.Mining.TokenID != "" {
				bsvBroadcaster, err := mining.NewBSVBroadcaster(mining.BSVBroadcasterConfig{
					PrivateKey:   d.wallet.PrivateKey,
					MinerAddress: minerAddr,
					ArcURL:       d.cfg.Mining.ArcURL,
					ArcAPIKey:    d.cfg.Mining.ArcAPIKey,
					TokenID:      d.cfg.Mining.TokenID,
					UTXOs:        mining.NewWocUTXOProvider(),
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
			// Persist difficulty target after each block (captures any adjustment)
			if err := db.SetConfig("difficulty_target", da.TargetHex()); err != nil {
				log.Printf("[daemon] Failed to persist difficulty target: %v", err)
			}
		})

		d.miner.OnMintClaimed(func(event mining.MintClaimedEvent) {
			log.Printf("[daemon] Mint claimed! txid=%s amount=%d",
				event.Txid, event.Amount)
			// Link mint txid to the block that was claimed
			if event.BlockHash != "" {
				if err := db.UpdateBlockMintTxid(event.BlockHash, event.Txid); err != nil {
					log.Printf("[daemon] Failed to link mint txid to block: %v", err)
				}
			}
		})

		// Wire gossip → mining: validated gossip events become mining work
		handler.SetWorkSubmitter(d.miner.SubmitWork)

		d.miner.Start()
		log.Printf("[daemon] Mining service started (address: %s, difficulty: %d, target block time: %v)",
			minerAddr, d.cfg.Mining.Difficulty, targetBlockTime)
	}

	// 6. Start periodic status logging
	go d.statusLoop()

	// 7. Start HTTP API
	d.httpSrv = server.New(d.cfg.API.Bind, d.cfg.API.Port, d)
	if port, err := d.httpSrv.Start(); err != nil {
		log.Printf("[daemon] WARNING: HTTP API failed to start: %v (mining continues)", err)
	} else {
		log.Printf("[daemon] HTTP API on port %d", port)
	}

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
	if d.headerSync != nil {
		d.headerSync.Stop()
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

func (d *Daemon) GossipPeerID() string {
	if d.gossipNode != nil {
		return d.gossipNode.PeerID()
	}
	return ""
}

func (d *Daemon) MiningStatus() map[string]interface{} {
	if d.miner != nil {
		return d.miner.Status()
	}
	return map[string]interface{}{"enabled": false}
}

func (d *Daemon) HeaderSyncStatus() map[string]interface{} {
	if d.headerSync == nil {
		return map[string]interface{}{"enabled": false}
	}
	p := d.headerSync.Progress()
	return map[string]interface{}{
		"enabled":        true,
		"is_syncing":     p.IsSyncing,
		"total_headers":  p.TotalHeaders,
		"highest_height": p.HighestHeight,
		"chain_tip":      p.ChainTipHeight,
		"last_synced_at": p.LastSyncedAt,
	}
}

func (d *Daemon) WalletStatus() map[string]interface{} {
	result := map[string]interface{}{}
	if d.wallet != nil {
		result["address"] = d.wallet.Address
		result["public_key"] = hex.EncodeToString(d.wallet.PublicKey)
	}
	return result
}

// ImportWallet replaces the current wallet with one loaded from the given WIF.
// The new wallet is hot-swapped without requiring a daemon restart.
func (d *Daemon) ImportWallet(wif string) error {
	w, err := wallet.Load(wif)
	if err != nil {
		return fmt.Errorf("invalid WIF: %w", err)
	}
	if err := db.SetConfig("wallet_wif", wif); err != nil {
		return fmt.Errorf("persist wallet: %w", err)
	}
	d.wallet = w
	log.Printf("[wallet] Imported wallet: %s", w.Address)
	return nil
}

// ExportWIF returns the current wallet's WIF string.
func (d *Daemon) ExportWIF() (string, error) {
	if d.wallet == nil {
		return "", fmt.Errorf("no wallet loaded")
	}
	return d.wallet.WIF, nil
}

// GenerateNewWallet creates a fresh keypair, persists it, and hot-swaps.
func (d *Daemon) GenerateNewWallet() error {
	w, err := wallet.Generate()
	if err != nil {
		return fmt.Errorf("generate wallet: %w", err)
	}
	if err := db.SetConfig("wallet_wif", w.WIF); err != nil {
		return fmt.Errorf("persist wallet: %w", err)
	}
	d.wallet = w
	log.Printf("[wallet] Generated new wallet: %s", w.Address)
	return nil
}

func (d *Daemon) ValidateMerkleRoot(root string, height int) (bool, error) {
	if d.headerSync == nil {
		return false, fmt.Errorf("header sync not enabled")
	}
	return d.headerSync.ValidateMerkleRoot(root, height)
}

// GetRecentBlocks returns the latest N blocks from the database.
func (d *Daemon) GetRecentBlocks(limit, offset int) ([]db.PoIBlock, error) {
	return db.GetRecentPoIBlocks(limit, offset)
}

// GetBlockCounts returns total and own block counts.
func (d *Daemon) GetBlockCounts() (total, own int, err error) {
	total, err = db.GetPoIBlockCount()
	if err != nil {
		return 0, 0, err
	}
	own, err = db.GetOwnBlockCount()
	if err != nil {
		return total, 0, err
	}
	return total, own, nil
}

// GetBlockByHash returns a single block by its hash.
func (d *Daemon) GetBlockByHash(hash string) (*db.PoIBlock, error) {
	return db.GetPoIBlockByHash(hash)
}

// loadOrCreateLibp2pIdentity loads a persisted Ed25519 key from the DB,
// or generates a new one and saves it. This gives the node a stable peer ID
// across restarts, preventing mDNS "dial to self" errors from stale peer IDs.
func loadOrCreateLibp2pIdentity() (libp2pcrypto.PrivKey, error) {
	const dbKey = "libp2p_identity_key"

	if saved, err := db.GetConfig(dbKey); err == nil && saved != "" {
		raw, err := hex.DecodeString(saved)
		if err != nil {
			return nil, fmt.Errorf("hex decode identity: %w", err)
		}
		key, err := libp2pcrypto.UnmarshalPrivateKey(raw)
		if err != nil {
			return nil, fmt.Errorf("unmarshal identity: %w", err)
		}
		log.Println("[gossip] Loaded persisted libp2p identity")
		return key, nil
	}

	// Generate new Ed25519 key
	key, _, err := libp2pcrypto.GenerateKeyPair(libp2pcrypto.Ed25519, 0)
	if err != nil {
		return nil, fmt.Errorf("generate identity: %w", err)
	}
	raw, err := libp2pcrypto.MarshalPrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("marshal identity: %w", err)
	}
	if err := db.SetConfig(dbKey, hex.EncodeToString(raw)); err != nil {
		return nil, fmt.Errorf("persist identity: %w", err)
	}
	log.Println("[gossip] Generated and saved new libp2p identity")
	return key, nil
}
