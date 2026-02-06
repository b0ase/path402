import { createHash } from 'crypto';

export interface MiningParams {
    tick: string;
    address: string;
    blockHeader: string; // The specific block header we are mining on
    difficulty: number;
}

export interface PoWSolution {
    nonce: string;
    hash: string;
    timestamp: number;
}

/**
 * Calculates the double SHA256 hash for the PoW20 protocol
 * Hash = SHA256(SHA256(TICK + ADDRESS + BLOCK_HEADER + NONCE))
 */
export function calculateHash(params: MiningParams, nonce: string): string {
    const data = params.tick + params.address + params.blockHeader + nonce;
    const firstHash = createHash('sha256').update(data).digest();
    return createHash('sha256').update(firstHash).digest('hex');
}

/**
 * Validates a solution against the difficulty target (leading zeros)
 */
export function isValidSolution(hash: string, difficulty: number): boolean {
    const prefix = '0'.repeat(difficulty);
    return hash.startsWith(prefix);
}

/**
 * Mines for a solution
 */
export function mine(params: MiningParams, maxAttempts = 10000000): PoWSolution | null {
    console.log(`[Miner] Starting mining for ${params.tick} at difficulty ${params.difficulty}...`);
    const start = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
        // Generate a random nonce
        const nonce = `${Date.now()}_${i}_${Math.random().toString(36).substring(7)}`;

        const hash = calculateHash(params, nonce);

        if (isValidSolution(hash, params.difficulty)) {
            const timeTaken = (Date.now() - start) / 1000;
            console.log(`[Miner] Found solution in ${timeTaken}s after ${i} attempts!`);
            console.log(`[Miner] Nonce: ${nonce}`);
            console.log(`[Miner] Hash:  ${hash}`);

            return {
                nonce,
                hash,
                timestamp: Date.now()
            };
        }

        if (i % 100000 === 0 && i > 0) {
            console.log(`[Miner] ${i} attempts...`);
        }
    }

    console.log('[Miner] Giving up after max attempts.');
    return null;
}
