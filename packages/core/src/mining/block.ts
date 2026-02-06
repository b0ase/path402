import { createHash } from 'crypto';
import { BlockHeader, calculateBlockHash } from './pow.js';

/**
 * Represents a unit of useful work performed by the indexer.
 * Examples: Validating a payment, Serving content, Relaying a message.
 */
export interface WorkItem {
    id: string;        // Unique ID (e.g. txid)
    type: 'validation' | 'serve' | 'relay' | 'heartbeat';
    data: any;         // The actual data (e.g. proof of payment)
    timestamp: number;
}

/**
 * A Block of Indexing Work
 */
export interface IndexerBlock {
    header: BlockHeader;
    items: WorkItem[];
    hash: string;
}

/**
 * Calculates Merkle Root of work items
 * (Simplified implementation for MVP - hashing concat of IDs)
 */
export function calculateMerkleRoot(items: WorkItem[]): string {
    if (items.length === 0) return createHash('sha256').update('empty').digest('hex');

    // Sort by ID for determinism
    const sortedIds = items.map(i => i.id).sort();
    const data = sortedIds.join('|');

    return createHash('sha256').update(data).digest('hex');
}

/**
 * In-memory pool of unmined work
 */
export class IndexerMempool {
    private items: WorkItem[] = [];

    add(item: WorkItem) {
        // Deduplicate
        if (this.items.some(i => i.id === item.id)) return;
        this.items.push(item);
    }

    getItems(count: number): WorkItem[] {
        return this.items.slice(0, count);
    }

    removeItems(ids: string[]) {
        this.items = this.items.filter(i => !ids.includes(i.id));
    }

    get size() {
        return this.items.length;
    }
}

/**
 * Creates a new block template from mempool items
 */
export function createBlockTemplate(
    items: WorkItem[],
    prevHash: string,
    minerAddress: string,
    difficulty: number
): BlockHeader {
    return {
        version: 1,
        prevHash,
        merkleRoot: calculateMerkleRoot(items),
        timestamp: Date.now(),
        bits: difficulty,
        nonce: 0,
        minerAddress
    };
}
