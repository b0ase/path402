import { createHash } from 'crypto';

export interface BlockHeader {
    version: number;
    prevHash: string;
    merkleRoot: string;
    timestamp: number;
    bits: number; // Difficulty target
    nonce: number;
    minerAddress: string; // The address to reward
}

export interface PoWSolution {
    header: BlockHeader;
    hash: string;
}

/**
 * Serializes the block header for hashing
 * Format: {version}{prevHash}{merkleRoot}{timestamp}{bits}{nonce}{minerAddress}
 */
export function serializeHeader(header: BlockHeader): Buffer {
    // Simple serialization for demo purposes. 
    // In production, use rigorous binary packing (e.g. Buffer.alloc) to avoid undefined behavior.
    const str = [
        header.version,
        header.prevHash,
        header.merkleRoot,
        header.timestamp,
        header.bits,
        header.nonce,
        header.minerAddress
    ].join(':');

    return Buffer.from(str);
}

/**
 * Calculates double SHA256 of the header
 * SHA256(SHA256(header))
 */
export function calculateBlockHash(header: BlockHeader): string {
    const buf = serializeHeader(header);
    const h1 = createHash('sha256').update(buf).digest();
    const h2 = createHash('sha256').update(h1).digest('hex');
    return h2;
}

/**
 * Checks if the hash meets the difficulty target (leading zeros)
 * @param hash Hex string of the hash
 * @param bits Number of leading zeros required (simplified difficulty)
 */
export function checkDifficulty(hash: string, bits: number): boolean {
    const prefix = '0'.repeat(bits);
    return hash.startsWith(prefix);
}

/**
 * Check if a hash meets a 256-bit target (hash as bigint <= target)
 * Used by the DifficultyAdjuster for fine-grained difficulty control.
 */
export function checkTarget(hash: string, target: bigint): boolean {
    const h = BigInt('0x' + hash);
    return h <= target;
}

/**
 * Mining loop (CPU miner) — leading zeros difficulty
 * @param header Template header
 * @param maxIterations Number of hashes to try before returning
 */
export function mineBlock(header: BlockHeader, maxIterations = 1000000): PoWSolution | null {
    let nonce = header.nonce;

    for (let i = 0; i < maxIterations; i++) {
        header.nonce = nonce + i;
        // Update timestamp every few iterations to keep it fresh
        if (i % 10000 === 0) {
            header.timestamp = Date.now();
        }

        const hash = calculateBlockHash(header);

        if (checkDifficulty(hash, header.bits)) {
            return {
                header: { ...header }, // Return copy
                hash
            };
        }
    }

    return null;
}

/**
 * Mining loop (CPU miner) — target-based difficulty
 * Same as mineBlock but uses checkTarget instead of checkDifficulty.
 * This is the production mining mode when DifficultyAdjuster is active.
 */
export function mineBlockWithTarget(header: BlockHeader, target: bigint, maxIterations = 1000): PoWSolution | null {
    let nonce = header.nonce;

    for (let i = 0; i < maxIterations; i++) {
        header.nonce = nonce + i;
        if (i % 10000 === 0) {
            header.timestamp = Date.now();
        }

        const hash = calculateBlockHash(header);

        if (checkTarget(hash, target)) {
            return {
                header: { ...header },
                hash
            };
        }
    }

    return null;
}
