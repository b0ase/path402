
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
 */

import { EventEmitter } from 'events';
import { IndexerMempool, createBlockTemplate, WorkItem, IndexerBlock, calculateMerkleRoot } from '../mining/block.js';
import { mineBlock, PoWSolution, BlockHeader } from '../mining/pow.js';
import { GossipNode } from '../gossip/node.js';
import type { MintBroadcaster } from '../mining/broadcaster.js';

// Configuration
const MIN_ITEMS_TO_MINE = 5;
const INITIAL_DIFFICULTY = 3; // Reduced for testing/responsiveness
const MINT_MAX_RETRIES = 3;
const MINT_RETRY_MIN_MS = 2000;
const MINT_RETRY_MAX_MS = 5000;

export interface ProofOfIndexingOptions {
    minerAddress: string;
    privateKey?: string;
    gossipNode?: GossipNode;
    broadcaster?: MintBroadcaster;
}

export class ProofOfIndexingService extends EventEmitter {
    private mempool: IndexerMempool;
    private isMining: boolean = false;
    private gossipNode: GossipNode | null = null;
    private minerAddress: string;
    private broadcaster: MintBroadcaster | null = null;
    private lastBlockHash: string = '0000000000000000000000000000000000000000000000000000000000000000';

    constructor(options: ProofOfIndexingOptions) {
        super();
        this.mempool = new IndexerMempool();
        this.minerAddress = options.minerAddress;
        this.gossipNode = options.gossipNode || null;
        this.broadcaster = options.broadcaster || null;

        // Start Heartbeat to keep chain alive during low activity
        this.startHeartbeat();
    }

    setGossipNode(node: GossipNode) {
        this.gossipNode = node;
    }

    setBroadcaster(broadcaster: MintBroadcaster) {
        this.broadcaster = broadcaster;
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
        if (!this.isMining && this.mempool.size >= MIN_ITEMS_TO_MINE) {
            this.startMining();
        }
    }

    /**
     * Start the mining loop (non-blocking)
     */
    private async startMining() {
        if (this.isMining) return;
        this.isMining = true;

        console.log('[PoI] Starting Miner...');

        setImmediate(async () => {
            try {
                while (this.mempool.size > 0) {
                    // 1. Select items
                    const items = this.mempool.getItems(10); // Batch size 10
                    if (items.length === 0) break;

                    // 2. Create Header
                    const header = createBlockTemplate(
                        items,
                        this.lastBlockHash,
                        this.minerAddress,
                        INITIAL_DIFFICULTY
                    );

                    console.log(`[PoI] Mining block with ${items.length} items. Difficulty: ${INITIAL_DIFFICULTY}`);

                    // 3. Mine in chunks (yields to event loop between batches)
                    let solution: PoWSolution | null = null;
                    for (let chunk = 0; chunk < 1000; chunk++) {
                        solution = await this.mineAsync(header);
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
    private mineAsync(header: BlockHeader): Promise<PoWSolution | null> {
        return new Promise((resolve) => {
            // FORCE YIELD: Use setImmediate to ensure the Event Loop gets a turn
            // This prevents the UI from freezing while mining
            setImmediate(() => {
                const result = mineBlock(header, 1000);
                resolve(result || null);
            });
        });
    }

    private async handleBlockFound(solution: PoWSolution, items: WorkItem[]) {
        // 1. Update state
        this.lastBlockHash = solution.hash;
        this.mempool.removeItems(items.map(i => i.id));

        // 2. Create Block Object
        const block: IndexerBlock = {
            header: solution.header,
            items,
            hash: solution.hash
        };

        this.emit('block_mined', block);

        // 3. The merkle root IS the BRC-114 work commitment
        const merkleRoot = solution.header.merkleRoot;

        // 4. Broadcast Mint via HTM contract (with retry for UTXO contention)
        if (this.broadcaster) {
            await this.claimMint(merkleRoot);
        } else {
            console.log('[PoI] No broadcaster configured - skipping mint claim.');
        }

        // 5. Gossip
        if (this.gossipNode) {
            // this.gossipNode.broadcastBlock(block);
        }
    }

    private async claimMint(merkleRoot: string): Promise<void> {
        for (let attempt = 1; attempt <= MINT_MAX_RETRIES; attempt++) {
            const result = await this.broadcaster!.broadcastMint(merkleRoot);

            if (result.success) {
                console.log(`[PoI] MINT CLAIMED: ${result.txid} (${result.amount} tokens)`);
                this.emit('mint_claimed', {
                    txid: result.txid,
                    amount: result.amount,
                    merkleRoot,
                });
                return;
            }

            if (result.action === 'stop') {
                console.log(`[PoI] Mining exhausted: ${result.error}`);
                this.emit('mint_failed', { error: result.error, merkleRoot });
                return;
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
            return;
        }
    }
}
