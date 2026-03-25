/**
 * HtmBroadcaster — Implementation moved to private repo for security.
 * Type stubs remain for compilation.
 */

const MOVED = 'HtmBroadcaster implementation moved to private repo (Claw-Miner-App)';

export interface MintBroadcasterResult {
    success: boolean;
    txid?: string;
    amount?: bigint;
    error?: string;
    action?: 'done' | 'retry' | 'stop';
}

export class HtmBroadcaster {
    constructor(_tokenId: string, _privateKeyWif: string) {
        throw new Error(MOVED);
    }
    getMinerAddress(): string { throw new Error(MOVED); }
    async broadcastMint(_merkleRoot: string): Promise<MintBroadcasterResult> { throw new Error(MOVED); }
}
