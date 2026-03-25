/**
 * Proof of Work — Implementation moved to private repo for security.
 * Type definitions remain for compilation.
 */

const MOVED = 'PoW implementation moved to private repo (Claw-Miner-App)';

export interface BlockHeader {
    version: number;
    prevHash: string;
    merkleRoot: string;
    timestamp: number;
    bits: number;
    nonce: number;
    minerAddress: string;
}

export interface PoWSolution {
    header: BlockHeader;
    hash: string;
}

export function serializeHeader(_header: BlockHeader): Buffer { throw new Error(MOVED); }
export function calculateBlockHash(_header: BlockHeader): string { throw new Error(MOVED); }
export function checkDifficulty(_hash: string, _bits: number): boolean { throw new Error(MOVED); }
export function checkTarget(_hash: string, _target: bigint): boolean { throw new Error(MOVED); }
export function mineBlock(_header: BlockHeader, _maxIterations?: number): PoWSolution | null { throw new Error(MOVED); }
export function mineBlockWithTarget(_header: BlockHeader, _target: bigint, _maxIterations?: number): PoWSolution | null { throw new Error(MOVED); }
