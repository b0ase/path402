/**
 * MintBroadcaster interface — defines how mined blocks get claimed on-chain.
 *
 * Core defines only the interface; the actual implementation lives in
 * @b0ase/path402-htm to isolate scrypt-ts CJS dependencies from core's ESM.
 */

export interface MintBroadcasterResult {
    success: boolean;
    txid?: string;
    amount?: bigint;
    error?: string;
    /** 'done' = no further action, 'retry' = UTXO contention, 'stop' = mining exhausted */
    action?: 'done' | 'retry' | 'stop';
}

export interface MintBroadcaster {
    broadcastMint(merkleRoot: string): Promise<MintBroadcasterResult>;
}
