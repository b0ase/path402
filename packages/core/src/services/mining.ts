/**
 * Proof of Indexing Service — Implementation moved to private repo for security.
 * Type stubs remain for compilation.
 */

import { EventEmitter } from 'events';
import type { MintBroadcaster } from '../mining/broadcaster.js';

const MOVED = 'ProofOfIndexingService implementation moved to private repo (Claw-Miner-App)';

export interface ProofOfIndexingOptions {
    minerAddress: string;
    privateKey?: string;
    gossipNode?: unknown;
    broadcaster?: MintBroadcaster;
    relayService?: unknown;
    noDb?: boolean;
}

export class ProofOfIndexingService extends EventEmitter {
    constructor(_opts: ProofOfIndexingOptions) {
        super();
        throw new Error(MOVED);
    }
}
