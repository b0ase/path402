package mining

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// ServiceConfig holds mining service parameters.
type ServiceConfig struct {
	MinerAddress      string
	Difficulty        int
	HeartbeatInterval time.Duration
	MinItems          int
	BatchSize         int
}

// BlockMinedEvent is emitted when a block is mined.
type BlockMinedEvent struct {
	Block     *IndexerBlock
	Timestamp time.Time
}

// BlockHandler is called when a block is mined.
type BlockHandler func(event BlockMinedEvent)

// MintClaimedEvent is emitted when a mint is successfully broadcast.
type MintClaimedEvent struct {
	Txid       string
	Amount     int64
	MerkleRoot string
	BlockHash  string
}

// MintClaimedHandler is called when a mint is claimed on-chain.
type MintClaimedHandler func(event MintClaimedEvent)

// BlockAnnouncer is called when a block is mined and should be broadcast to the network.
type BlockAnnouncer func(block *IndexerBlock, height int)

// BlockStorageCallback is called when a block should be persisted to the database.
type BlockStorageCallback func(block *IndexerBlock, height int, isOwn bool)

// ProofOfIndexingService manages the Work -> Mine -> Broadcast -> Claim lifecycle.
type ProofOfIndexingService struct {
	config             ServiceConfig
	mempool            *IndexerMempool
	isMining           bool
	mu                 sync.Mutex
	lastBlockHash      string
	blocksMined        int
	totalHashes        int64
	startTime          time.Time
	onBlock            BlockHandler
	onMintClaimed      MintClaimedHandler
	broadcaster        MintBroadcaster
	claimConfig        ClaimConfig
	stopCh             chan struct{}
	difficultyAdjuster *DifficultyAdjuster
	blockAnnouncer     BlockAnnouncer
	blockStorage       BlockStorageCallback
	paused             bool
}

// NewProofOfIndexingService creates a new mining service.
func NewProofOfIndexingService(cfg ServiceConfig) *ProofOfIndexingService {
	return &ProofOfIndexingService{
		config:        cfg,
		mempool:       NewMempool(),
		lastBlockHash: "0000000000000000000000000000000000000000000000000000000000000000",
		broadcaster:   &NoopBroadcaster{},
		claimConfig:   DefaultClaimConfig(),
		stopCh:        make(chan struct{}),
		startTime:     time.Now(),
	}
}

// SetBroadcaster configures the mint broadcaster.
func (s *ProofOfIndexingService) SetBroadcaster(b MintBroadcaster) {
	s.broadcaster = b
}

// SetDifficultyAdjuster enables dynamic difficulty adjustment.
// When set, the miner uses the adjuster's target instead of the static config difficulty.
func (s *ProofOfIndexingService) SetDifficultyAdjuster(da *DifficultyAdjuster) {
	s.difficultyAdjuster = da
}

// SetBlockAnnouncer registers a callback to announce mined blocks to the network.
func (s *ProofOfIndexingService) SetBlockAnnouncer(fn BlockAnnouncer) {
	s.blockAnnouncer = fn
}

// SetBlockStorage registers a callback to persist blocks to the database.
func (s *ProofOfIndexingService) SetBlockStorage(fn BlockStorageCallback) {
	s.blockStorage = fn
}

// SetLastBlockHash restores the chain tip hash on startup.
func (s *ProofOfIndexingService) SetLastBlockHash(hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastBlockHash = hash
}

// SetBlocksMined restores the block counter on startup.
func (s *ProofOfIndexingService) SetBlocksMined(count int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.blocksMined = count
}

// OnMintClaimed registers a callback for successful on-chain mint events.
func (s *ProofOfIndexingService) OnMintClaimed(handler MintClaimedHandler) {
	s.onMintClaimed = handler
}

// OnBlock registers a callback for block mined events.
func (s *ProofOfIndexingService) OnBlock(handler BlockHandler) {
	s.onBlock = handler
}

// Start begins the heartbeat and mining loops.
func (s *ProofOfIndexingService) Start() {
	log.Println("[mining] Proof-of-Indexing service started")
	go s.heartbeatLoop()
}

// Stop terminates the mining service.
func (s *ProofOfIndexingService) Stop() {
	close(s.stopCh)
	log.Println("[mining] Stopped")
}

// Pause stops mining without shutting down. Heartbeats continue but won't trigger mining.
func (s *ProofOfIndexingService) Pause() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.paused = true
	log.Println("[mining] Paused")
}

// Resume re-enables mining after a pause.
func (s *ProofOfIndexingService) Resume() {
	s.mu.Lock()
	s.paused = false
	s.mu.Unlock()
	log.Println("[mining] Resumed")
	// Kick off mining if mempool has work
	if s.mempool.Size() >= s.config.MinItems {
		go s.mineLoop()
	}
}

// IsPaused returns whether mining is paused.
func (s *ProofOfIndexingService) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.paused
}

// SubmitWork adds a work item to the mempool and triggers mining if threshold met.
func (s *ProofOfIndexingService) SubmitWork(id, workType string, data interface{}) {
	log.Printf("[mining] Work submitted: %s %s", workType, id)
	s.mempool.Add(WorkItem{
		ID:        id,
		Type:      workType,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	})

	s.mu.Lock()
	paused := s.paused
	s.mu.Unlock()

	if !paused && !s.isMining && s.mempool.Size() >= s.config.MinItems {
		go s.mineLoop()
	}
}

// Status returns current mining statistics.
func (s *ProofOfIndexingService) Status() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	elapsed := time.Since(s.startTime).Seconds()
	hashRate := float64(0)
	if elapsed > 0 {
		hashRate = float64(s.totalHashes) / elapsed
	}

	difficulty := s.config.Difficulty
	if s.difficultyAdjuster != nil {
		difficulty = s.difficultyAdjuster.Difficulty()
	}

	result := map[string]interface{}{
		"blocks_mined":  s.blocksMined,
		"hash_rate":     hashRate,
		"mempool_size":  s.mempool.Size(),
		"is_mining":     s.isMining,
		"last_block":    s.lastBlockHash[:16],
		"miner_address": s.config.MinerAddress,
		"difficulty":    difficulty,
	}

	// Include network-level difficulty stats when adjuster is active
	if s.difficultyAdjuster != nil {
		daStats := s.difficultyAdjuster.Stats()
		result["network"] = daStats
	}

	return result
}

func (s *ProofOfIndexingService) heartbeatLoop() {
	ticker := time.NewTicker(s.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			if s.mempool.Size() < s.config.MinItems {
				s.SubmitWork(
					fmt.Sprintf("ping-%d", time.Now().UnixMilli()),
					"heartbeat",
					map[string]interface{}{
						"msg": "Keeping the chain alive",
						"ts":  time.Now().UnixMilli(),
					},
				)
			}
		}
	}
}

func (s *ProofOfIndexingService) mineLoop() {
	s.mu.Lock()
	if s.isMining {
		s.mu.Unlock()
		return
	}
	s.isMining = true
	s.mu.Unlock()

	log.Println("[mining] Starting miner...")

	defer func() {
		s.mu.Lock()
		s.isMining = false
		s.mu.Unlock()
		log.Println("[mining] Miner stopped (waiting for more work)")
	}()

	for s.mempool.Size() > 0 {
		select {
		case <-s.stopCh:
			return
		default:
		}

		items := s.mempool.GetItems(s.config.BatchSize)
		if len(items) == 0 {
			break
		}

		// Use dynamic difficulty from adjuster, or fall back to static config
		difficulty := s.config.Difficulty
		if s.difficultyAdjuster != nil {
			difficulty = s.difficultyAdjuster.Difficulty()
		}

		header := CreateBlockTemplate(items, s.lastBlockHash, s.config.MinerAddress, difficulty)
		log.Printf("[mining] Mining block with %d items. Difficulty: %d", len(items), difficulty)

		// Mine in 1000-iteration bursts, up to 1000 chunks
		var solution *PoWSolution
		for chunk := 0; chunk < 1000; chunk++ {
			// Use target-based mining when adjuster is active (fine-grained difficulty)
			if s.difficultyAdjuster != nil {
				target := s.difficultyAdjuster.Target()
				solution = MineBlockWithTarget(header, target, 1000)
			} else {
				solution = MineBlock(header, 1000)
			}
			s.mu.Lock()
			s.totalHashes += 1000
			s.mu.Unlock()

			if solution != nil {
				break
			}

			// Yield to other goroutines between chunks
			time.Sleep(time.Millisecond)
		}

		if solution != nil {
			log.Printf("[mining] BLOCK FOUND! Hash: %s", solution.Hash)
			s.handleBlockFound(solution, items)
		} else {
			log.Println("[mining] Block not found after max chunks, retrying...")
		}
	}
}

func (s *ProofOfIndexingService) handleBlockFound(solution *PoWSolution, items []WorkItem) {
	s.mu.Lock()
	s.lastBlockHash = solution.Hash
	s.blocksMined++
	height := s.blocksMined
	s.mu.Unlock()

	// Remove mined items from mempool
	ids := make([]string, len(items))
	for i, item := range items {
		ids[i] = item.ID
	}
	s.mempool.RemoveItems(ids)

	block := &IndexerBlock{
		Header: solution.Header,
		Items:  items,
		Hash:   solution.Hash,
	}

	// Record block in difficulty adjuster (own blocks count toward global rate)
	if s.difficultyAdjuster != nil {
		s.difficultyAdjuster.RecordBlock(time.Now())
	}

	// Persist block to database
	if s.blockStorage != nil {
		s.blockStorage(block, height, true)
	}

	// Announce block to the network via gossip
	if s.blockAnnouncer != nil {
		s.blockAnnouncer(block, height)
	}

	if s.onBlock != nil {
		s.onBlock(BlockMinedEvent{Block: block, Timestamp: time.Now()})
	}

	// Claim mint on-chain (async)
	go s.claimMint(block.Hash, block.Header.MerkleRoot)
}

func (s *ProofOfIndexingService) claimMint(blockHash, merkleRoot string) {
	result := ClaimMint(s.broadcaster, merkleRoot, s.claimConfig)
	if result.Success && result.Txid != "" {
		log.Printf("[mining] Mint claimed! txid=%s amount=%d merkle=%s",
			result.Txid, result.Amount, merkleRoot[:16])
		if s.onMintClaimed != nil {
			s.onMintClaimed(MintClaimedEvent{
				Txid:       result.Txid,
				Amount:     result.Amount,
				MerkleRoot: merkleRoot,
				BlockHash:  blockHash,
			})
		}
	} else if !result.Success && result.Error != "" {
		log.Printf("[mining] Mint claim failed: %s", result.Error)
	}
}
