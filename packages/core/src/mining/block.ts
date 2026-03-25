/**
 * Block template / mempool — Implementation moved to private repo for security.
 * Type definitions remain for compilation.
 */

import { BlockHeader } from './pow.js';

const MOVED = 'Block implementation moved to private repo (Claw-Miner-App)';

export interface WorkItem {
    id: string;
    type: 'validation' | 'serve' | 'relay' | 'heartbeat';
    data: any;
    timestamp: number;
}

export interface IndexerBlock {
    header: BlockHeader;
    items: WorkItem[];
    hash: string;
}

export function calculateMerkleRoot(_items: WorkItem[]): string { throw new Error(MOVED); }

export class IndexerMempool {
    add(_item: WorkItem): void { throw new Error(MOVED); }
    getItems(_count: number): WorkItem[] { throw new Error(MOVED); }
    removeItems(_ids: string[]): void { throw new Error(MOVED); }
    get size(): number { throw new Error(MOVED); }
}

export function createBlockTemplate(
    _items: WorkItem[], _prevHash: string, _minerAddress: string, _difficulty: number
): BlockHeader { throw new Error(MOVED); }
