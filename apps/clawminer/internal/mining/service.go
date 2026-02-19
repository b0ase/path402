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
}

// MintClaimedHandler is called when a mint is claimed on-chain.
type MintClaimedHandler func(event MintClaimedEvent)

// ProofOfIndexingService manages the Work -> Mine -> Broadcast -> Claim lifecycle.
type ProofOfIndexingService struct {
	config        ServiceConfig
	mempool       *IndexerMempool
	isMining      bool
	mu            sync.Mutex
	lastBlockHash string
	blocksMined   int
	totalHashes   int64
	startTime     time.Time
	onBlock       BlockHandler
	onMintClaimed MintClaimedHandler
	broadcaster   MintBroadcaster
	claimConfig   ClaimConfig
	stopCh        chan struct{}
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

// SubmitWork adds a work item to the mempool and triggers mining if threshold met.
func (s *ProofOfIndexingService) SubmitWork(id, workType string, data interface{}) {
	log.Printf("[mining] Work submitted: %s %s", workType, id)
	s.mempool.Add(WorkItem{
		ID:        id,
		Type:      workType,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	})

	if !s.isMining && s.mempool.Size() >= s.config.MinItems {
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

	return map[string]interface{}{
		"blocks_mined":  s.blocksMined,
		"hash_rate":     hashRate,
		"mempool_size":  s.mempool.Size(),
		"is_mining":     s.isMining,
		"last_block":    s.lastBlockHash[:16],
		"miner_address": s.config.MinerAddress,
		"difficulty":    s.config.Difficulty,
	}
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

		header := CreateBlockTemplate(items, s.lastBlockHash, s.config.MinerAddress, s.config.Difficulty)
		log.Printf("[mining] Mining block with %d items. Difficulty: %d", len(items), s.config.Difficulty)

		// Mine in 1000-iteration bursts, up to 1000 chunks
		var solution *PoWSolution
		for chunk := 0; chunk < 1000; chunk++ {
			solution = MineBlock(header, 1000)
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

	if s.onBlock != nil {
		s.onBlock(BlockMinedEvent{Block: block, Timestamp: time.Now()})
	}

	// Claim mint on-chain (async)
	go s.claimMint(block.Header.MerkleRoot)
}

func (s *ProofOfIndexingService) claimMint(merkleRoot string) {
	result := ClaimMint(s.broadcaster, merkleRoot, s.claimConfig)
	if result.Success && result.Txid != "" {
		log.Printf("[mining] Mint claimed! txid=%s amount=%d merkle=%s",
			result.Txid, result.Amount, merkleRoot[:16])
		if s.onMintClaimed != nil {
			s.onMintClaimed(MintClaimedEvent{
				Txid:       result.Txid,
				Amount:     result.Amount,
				MerkleRoot: merkleRoot,
			})
		}
	} else if !result.Success && result.Error != "" {
		log.Printf("[mining] Mint claim failed: %s", result.Error)
	}
}
