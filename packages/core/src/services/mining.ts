
/**
 * Proof of Indexing Service
 *
 * Manages the "Work -> Mine -> Reward" lifecycle for the Path402 daemon.
 *
 * Flow:
 * 1. Daemon validates a transaction -> Adds to Mempool
 * 2. Service accumulates items
 * 3. Miner runs in background finding PoW solution
 * 4. Solution found -> Broadcast via MintBroadcaster -> Claim $402 Reward
 *
 * v2: Full network parity with Go ClawMiner:
 * - DifficultyAdjuster (Bitcoin-style, bigint target)
 * - Block storage (SQLite via db module)
 * - Chain state restore on startup
 * - Peer block feeding into difficulty adjuster
 */

import { EventEmitter } from 'events';
import { IndexerMempool, createBlockTemplate, WorkItem, IndexerBlock, calculateMerkleRoot } from '../mining/block.js';
import { mineBlock, mineBlockWithTarget, PoWSolution, BlockHeader } from '../mining/pow.js';
import { DifficultyAdjuster, difficultyFromTarget } from '../mining/difficulty.js';
import { GossipNode } from '../gossip/node.js';
import type { MintBroadcaster } from '../mining/broadcaster.js';
import type { RelayService } from './relay.js';
import {
    insertPoIBlock,
    updateBlockMintTxid,
    getLatestPoIBlock,
    getPoIBlockCount,
    getOwnBlockCount,
    getBlockTimestampsSince,
    getChainTip,
    type PoIBlock,
} from '../db/index.js';

// Configuration
const MIN_ITEMS_TO_MINE = 5;
const INITIAL_DIFFICULTY = 3;
const ADJUSTMENT_PERIOD = 144;       // ~1 day at 10min blocks (matches Go)
const TARGET_BLOCK_TIME_MS = 600000; // 10 minutes (matches Go)
const MINT_MAX_RETRIES = 3;
const MINT_RETRY_MIN_MS = 2000;
const MINT_RETRY_MAX_MS = 5000;

export interface ProofOfIndexingOptions {
    minerAddress: string;
    privateKey?: string;
    gossipNode?: GossipNode;
    broadcaster?: MintBroadcaster;
    relayService?: RelayService;
    /** Skip DB operations (for environments without SQLite) */
    noDb?: boolean;
}

export class ProofOfIndexingService extends EventEmitter {
    private mempool: IndexerMempool;
    private isMining: boolean = false;
    private isPaused: boolean = false;
    private gossipNode: GossipNode | null = null;
    private minerAddress: string;
    private broadcaster: MintBroadcaster | null = null;
    private relayService: RelayService | null = null;
    private lastBlockHash: string = '0000000000000000000000000000000000000000000000000000000000000000';
    private difficultyAdjuster: DifficultyAdjuster;
    private blocksMined: number = 0;
    private blockHeight: number = 0;
    private noDb: boolean;

    constructor(options: ProofOfIndexingOptions) {
        super();
        this.mempool = new IndexerMempool();
        this.minerAddress = options.minerAddress;
        this.gossipNode = options.gossipNode || null;
        this.broadcaster = options.broadcaster || null;
        this.relayService = options.relayService || null;
        this.noDb = options.noDb || false;

        // Initialize difficulty adjuster
        this.difficultyAdjuster = new DifficultyAdjuster(
            INITIAL_DIFFICULTY,
            ADJUSTMENT_PERIOD,
            TARGET_BLOCK_TIME_MS
        );

        // Restore chain state from DB
        if (!this.noDb) {
            this.restoreState();
        }

        // Start Heartbeat to keep chain alive during low activity
        this.startHeartbeat();
    }

    /**
     * Restore chain tip, difficulty target, and block timestamps from DB.
     * Called on startup to resume from where we left off.
     */
    private restoreState(): void {
        try {
            const tip = getChainTip();
            if (tip) {
                this.lastBlockHash = tip.hash;
                this.blockHeight = tip.height;
                console.log(`[PoI] Restored chain tip: height=${tip.height} hash=${tip.hash.slice(0, 16)}...`);
            }

            const ownCount = getOwnBlockCount();
            this.blocksMined = ownCount;

            // Restore difficulty from the latest block's target_hex
            const latest = getLatestPoIBlock();
            if (latest?.target_hex) {
                const target = BigInt('0x' + latest.target_hex);
                const totalCount = getPoIBlockCount();

                // Get recent timestamps for the current adjustment window
                // Look back adjustmentPeriod * targetBlockTime to capture current window
                const windowMs = ADJUSTMENT_PERIOD * TARGET_BLOCK_TIME_MS;
                const sinceMs = Date.now() - windowMs;
                const timestamps = getBlockTimestampsSince(sinceMs);

                this.difficultyAdjuster.restoreState(target, totalCount, timestamps);
                console.log(`[PoI] Restored difficulty: ${difficultyFromTarget(target)} (${totalCount} total blocks, ${timestamps.length} in window)`);
            }
        } catch (err) {
            console.warn('[PoI] Could not restore state from DB:', err);
        }
    }

    setGossipNode(node: GossipNode) {
        this.gossipNode = node;
    }

    setBroadcaster(broadcaster: MintBroadcaster) {
        this.broadcaster = broadcaster;
    }

    setRelayService(relay: RelayService) {
        this.relayService = relay;
    }

    /** Get the difficulty adjuster for external use (e.g., feeding peer blocks) */
    getDifficultyAdjuster(): DifficultyAdjuster {
        return this.difficultyAdjuster;
    }

    /** Pause mining — stops new mining loops from starting */
    pause(): void {
        this.isPaused = true;
        console.log('[PoI] Mining paused');
        this.emit('mining_paused');
    }

    /** Resume mining — allows mining loops to start again */
    resume(): void {
        this.isPaused = false;
        console.log('[PoI] Mining resumed');
        this.emit('mining_resumed');
        // Kick off mining if mempool has enough items
        if (!this.isMining && this.mempool.size >= MIN_ITEMS_TO_MINE) {
            this.startMining();
        }
    }

    /** Check if mining is paused */
    getPaused(): boolean {
        return this.isPaused;
    }

    /** Get the current block height */
    getBlockHeight(): number {
        return this.blockHeight;
    }

    /** Get number of own blocks mined */
    getBlocksMined(): number {
        return this.blocksMined;
    }

    /**
     * Feed a peer block into the difficulty adjuster and store it.
     * Called when a BLOCK_ANNOUNCE gossip message is received.
     */
    handlePeerBlock(block: {
        hash: string;
        height: number;
        prev_hash: string;
        merkle_root: string;
        miner_address: string;
        timestamp: number;
        bits: number;
        nonce: number;
        version: number;
        item_count: number;
        target_hex: string;
        source_peer: string;
    }): void {
        // Feed timestamp to difficulty adjuster
        this.difficultyAdjuster.recordBlock(block.timestamp);

        // Update chain tip if this block is higher
        if (block.height > this.blockHeight) {
            this.blockHeight = block.height;
            this.lastBlockHash = block.hash;
        }

        // Store in DB
        if (!this.noDb) {
            try {
                insertPoIBlock({
                    hash: block.hash,
                    height: block.height,
                    prev_hash: block.prev_hash,
                    merkle_root: block.merkle_root,
                    miner_address: block.miner_address,
                    timestamp: block.timestamp,
                    bits: block.bits,
                    nonce: block.nonce,
                    version: block.version,
                    item_count: block.item_count,
                    items_json: null,
                    is_own: 0,
                    mint_txid: null,
                    target_hex: block.target_hex,
                    source_peer: block.source_peer,
                });
            } catch (err) {
                // Duplicate block — ignore
            }
        }

        this.emit('peer_block', block);
    }

    /**
     * Generate dummy work to keep miner active
     */
    private startHeartbeat() {
        console.log('[PoI] Heartbeat started. Will generate work if idle.');
        setInterval(() => {
            if (this.mempool.size < MIN_ITEMS_TO_MINE) {
                this.submitWork(
                    `ping-${Date.now()}`,
                    'heartbeat',
                    { msg: 'Keeping the chain alive', ts: Date.now() }
                );
            }
        }, 15000); // Check every 15s (faster than 60s for demo)
    }

    /**
     * Submit completed work to be mined
     */
    submitWork(id: string, type: WorkItem['type'], data: any) {
        console.log(`[PoI] Work submitted: ${type} ${id}`);
        this.mempool.add({
            id,
            type,
            data,
            timestamp: Date.now()
        });

        // Auto-start mining if we have enough items
        if (!this.isMining && !this.isPaused && this.mempool.size >= MIN_ITEMS_TO_MINE) {
            this.startMining();
        }
    }

    /**
     * Start the mining loop (non-blocking)
     */
    private async startMining() {
        if (this.isMining || this.isPaused) return;
        this.isMining = true;

        const currentDifficulty = this.difficultyAdjuster.difficulty();
        console.log(`[PoI] Starting Miner... (difficulty: ${currentDifficulty}, target: ${this.difficultyAdjuster.targetHex().slice(0, 16)}...)`);

        setImmediate(async () => {
            try {
                while (this.mempool.size > 0) {
                    // 1. Select items
                    const items = this.mempool.getItems(10); // Batch size 10
                    if (items.length === 0) break;

                    // 2. Create Header (use difficulty adjuster's current difficulty for bits field)
                    const difficulty = this.difficultyAdjuster.difficulty();
                    const header = createBlockTemplate(
                        items,
                        this.lastBlockHash,
                        this.minerAddress,
                        difficulty
                    );

                    console.log(`[PoI] Mining block with ${items.length} items. Difficulty: ${difficulty}`);

                    // 3. Mine in chunks using target-based mining
                    const target = this.difficultyAdjuster.target;
                    let solution: PoWSolution | null = null;
                    for (let chunk = 0; chunk < 1000; chunk++) {
                        solution = await this.mineAsync(header, target);
                        if (solution) break;
                    }

                    if (solution) {
                        console.log(`[PoI] BLOCK FOUND! Hash: ${solution.hash}`);
                        await this.handleBlockFound(solution, items);
                    } else {
                        console.log('[PoI] Block not found after max chunks, retrying...');
                    }
                }
            } catch (err) {
                console.error('[PoI] Mining error:', err);
            } finally {
                this.isMining = false;
                console.log('[PoI] Miner stopped (waiting for more work).');
            }
        });
    }

    /**
     * Run the miner in small bursts so we don't freeze the event loop
     */
    private mineAsync(header: BlockHeader, target: bigint): Promise<PoWSolution | null> {
        return new Promise((resolve) => {
            // FORCE YIELD: Use setImmediate to ensure the Event Loop gets a turn
            // This prevents the UI from freezing while mining
            setImmediate(() => {
                const result = mineBlockWithTarget(header, target, 1000);
                resolve(result || null);
            });
        });
    }

    private async handleBlockFound(solution: PoWSolution, items: WorkItem[]) {
        // 1. Update state
        this.lastBlockHash = solution.hash;
        this.blockHeight++;
        this.blocksMined++;
        this.mempool.removeItems(items.map(i => i.id));

        // 2. Record block in difficulty adjuster
        this.difficultyAdjuster.recordBlock(solution.header.timestamp);

        // 3. Create Block Object
        const block: IndexerBlock = {
            header: solution.header,
            items,
            hash: solution.hash
        };

        this.emit('block_mined', block);

        // 4. Store in DB
        if (!this.noDb) {
            try {
                insertPoIBlock({
                    hash: solution.hash,
                    height: this.blockHeight,
                    prev_hash: solution.header.prevHash,
                    merkle_root: solution.header.merkleRoot,
                    miner_address: solution.header.minerAddress,
                    timestamp: solution.header.timestamp,
                    bits: solution.header.bits,
                    nonce: solution.header.nonce,
                    version: solution.header.version,
                    item_count: items.length,
                    items_json: JSON.stringify(items.map(i => i.id)),
                    is_own: 1,
                    mint_txid: null,
                    target_hex: this.difficultyAdjuster.targetHex(),
                    source_peer: null,
                });
            } catch (err) {
                console.warn('[PoI] Failed to store block:', err);
            }
        }

        // 5. The merkle root IS the BRC-114 work commitment
        const merkleRoot = solution.header.merkleRoot;

        // 6. Broadcast Mint via HTM contract (with retry for UTXO contention)
        if (this.broadcaster) {
            const txid = await this.claimMint(merkleRoot);
            // Link mint txid to block in DB
            if (txid && !this.noDb) {
                try {
                    updateBlockMintTxid(solution.hash, txid);
                } catch (_) { /* ignore */ }
            }
            // 6b. Relay mint tx to peers via SPV Relay Mesh
            if (txid && this.relayService) {
                this.relayService.onMintBroadcast(txid, merkleRoot);
            }
        } else {
            console.log('[PoI] No broadcaster configured - skipping mint claim.');
        }

        // 7. Gossip block announce
        if (this.gossipNode) {
            this.gossipNode.broadcastBlock({
                hash: solution.hash,
                height: this.blockHeight,
                miner_address: this.minerAddress,
                timestamp: solution.header.timestamp,
                bits: solution.header.bits,
                target: this.difficultyAdjuster.targetHex(),
                merkle_root: solution.header.merkleRoot,
                prev_hash: solution.header.prevHash,
                nonce: solution.header.nonce,
                version: solution.header.version,
                item_count: items.length,
            });
        }
    }

    /** Mining status for API responses */
    status(): Record<string, unknown> {
        return {
            blocks_mined: this.blocksMined,
            block_height: this.blockHeight,
            is_mining: this.isMining,
            is_paused: this.isPaused,
            mempool_size: this.mempool.size,
            last_block: this.lastBlockHash.slice(0, 16),
            miner_address: this.minerAddress,
            difficulty: this.difficultyAdjuster.difficulty(),
            network: this.difficultyAdjuster.stats(),
        };
    }

    private async claimMint(merkleRoot: string): Promise<string | null> {
        for (let attempt = 1; attempt <= MINT_MAX_RETRIES; attempt++) {
            const result = await this.broadcaster!.broadcastMint(merkleRoot);

            if (result.success) {
                console.log(`[PoI] MINT CLAIMED: ${result.txid} (${result.amount} tokens)`);
                this.emit('mint_claimed', {
                    txid: result.txid,
                    amount: result.amount,
                    merkleRoot,
                });
                return result.txid || null;
            }

            if (result.action === 'stop') {
                console.log(`[PoI] Mining exhausted: ${result.error}`);
                this.emit('mint_failed', { error: result.error, merkleRoot });
                return null;
            }

            if (result.action === 'retry' && attempt < MINT_MAX_RETRIES) {
                const delay = MINT_RETRY_MIN_MS + Math.random() * (MINT_RETRY_MAX_MS - MINT_RETRY_MIN_MS);
                console.log(`[PoI] UTXO contention, retrying in ${Math.round(delay)}ms (${attempt}/${MINT_MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Final failure
            console.error(`[PoI] Mint failed after ${attempt} attempts: ${result.error}`);
            this.emit('mint_failed', { error: result.error, merkleRoot });
            return null;
        }
        return null;
    }
}
