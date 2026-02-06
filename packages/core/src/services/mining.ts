
/**
 * Proof of Indexing Service
 * 
 * Manages the "Work -> Mine -> Reward" lifecycle for the Path402 daemon.
 * 
 * Flow:
 * 1. Daemon validates a transaction -> Adds to Mempool
 * 2. Service accumulates items
 * 3. Miner runs in background finding PoW solution
 * 4. Solution found -> Broadcast to network -> Claim $402 Reward
 */

import { EventEmitter } from 'events';
import { IndexerMempool, createBlockTemplate, WorkItem, IndexerBlock } from '../mining/block.js';
import { mineBlock, PoWSolution, BlockHeader } from '../mining/pow.js';
import { GossipNode } from '../gossip/node.js';

// Robust BSV Import that works in both ESM (Core) and Bundle (Desktop)
// @ts-ignore
import * as bsvRaw from 'bsv';
// @ts-ignore
const bsv = bsvRaw.default || bsvRaw;

// Configuration
const MIN_ITEMS_TO_MINE = 5;
const INITIAL_DIFFICULTY = 3; // Reduced for testing/responsiveness

// WOC API
const WOC = 'https://api.whatsonchain.com/v1/bsv/main';

export class ProofOfIndexingService extends EventEmitter {
    private mempool: IndexerMempool;
    private isMining: boolean = false;
    private gossipNode: GossipNode | null = null;
    private minerAddress: string;
    private privateKey: string | undefined;
    private lastBlockHash: string = '0000000000000000000000000000000000000000000000000000000000000000';

    constructor(minerAddress: string, privateKey?: string, gossipNode?: GossipNode) {
        super();
        this.mempool = new IndexerMempool();
        this.minerAddress = minerAddress;
        this.privateKey = privateKey;
        this.gossipNode = gossipNode || null;

        // Start Heartbeat to keep chain alive during low activity
        this.startHeartbeat();
    }

    setGossipNode(node: GossipNode) {
        this.gossipNode = node;
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

                    // 3. Mine (Chunked to look non-blocking)
                    const solution = await this.mineAsync(header);

                    if (solution) {
                        console.log(`[PoI] 💎 BLOCK FOUND! Hash: ${solution.hash}`);
                        await this.handleBlockFound(solution, items);
                    } else {
                        // giving up or paused
                        break;
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

        // 3. Broadcast Mint Transaction (Claim Reward)
        if (this.privateKey) {
            try {
                const txid = await this.broadcastMint(solution);
                console.log(`[PoI] 💰 MINT CLAIMED: ${txid}`);
                console.log(`[PoI] View: https://whatsonchain.com/tx/${txid}`);
            } catch (err) {
                console.error('[PoI] Failed to claim mint (Check console for details):', err);
            }
        } else {
            console.log('[PoI] No private key set - skipping mint claim.');
        }

        // 4. Gossip
        if (this.gossipNode) {
            // this.gossipNode.broadcastBlock(block);
        }
    }

    private async broadcastMint(sol: PoWSolution): Promise<string> {
        console.log('[PoI] Constructing mint transaction...');
        const priv = bsv.PrivKey.fromWif(this.privateKey!);
        const addr = bsv.Address.fromPrivKey(priv);

        // 1. Get UTXOs
        const utxoRes = await fetch(`${WOC}/address/${addr.toString()}/unspent`);
        const utxos = await utxoRes.json();
        if (!utxos.length) throw new Error('No funds to mint (need gas). Please send BSV to ' + addr.toString());

        const tx = new bsv.Tx();

        // Input (Just use first enough for fee)
        const utxo = utxos[0];
        tx.addTxIn(
            bsv.TxIn.fromProperties(
                Buffer.from(utxo.tx_hash, 'hex').reverse(),
                utxo.tx_pos,
                new bsv.Script(),
                0xffffffff
            )
        );

        // Output 1: Inscription (1Sat)
        // {"p":"pow-20","op":"mint","tick":"402","amt":"1000","nonce":"...","ts":...}
        const payload = {
            p: "pow-20",
            op: "mint",
            tick: "402",
            amt: "1000",
            nonce: sol.header.nonce.toString(),
            ts: sol.header.timestamp
        };
        const json = JSON.stringify(payload);

        // Build Script: OP_FALSE OP_IF "ord" ...
        const script = new bsv.Script();
        script.writeOpCode(0x00);
        script.writeOpCode(0x63);
        script.writeBuffer(Buffer.from('ord', 'utf8'));
        script.writeOpCode(0x01);
        script.writeBuffer(Buffer.from('application/json', 'utf8'));
        script.writeOpCode(0x00);
        script.writeBuffer(Buffer.from(json, 'utf8'));
        script.writeOpCode(0x68);

        const recipient = bsv.Address.fromString(this.minerAddress);
        const lockScript = recipient.toTxOutScript();

        // Append envelope to locking script (Ordinals style)
        for (const chunk of script.chunks) {
            if (chunk.buf) lockScript.writeBuffer(chunk.buf);
            else if (chunk.opcodenum) lockScript.writeOpCode(chunk.opcodenum);
        }

        tx.addTxOut(new bsv.TxOut(new bsv.Bn(1), lockScript));

        // Change
        const fee = 300;
        const change = utxo.value - 1 - fee;
        if (change > 546) {
            tx.addTxOut(new bsv.TxOut(new bsv.Bn(change), addr.toTxOutScript()));
        }

        // Sign
        // bsv v2 sign() typically handles P2PKH simply if we set privKey
        tx.sign({
            privateKey: priv,
            prevTxId: utxo.tx_hash,
            outputIndex: utxo.tx_pos,
            script: addr.toTxOutScript(),
            satoshis: new bsv.Bn(utxo.value)
        });

        // Broadcast
        const res = await fetch(`${WOC}/tx/raw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txhex: tx.toHex() })
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.text();
    }
}
