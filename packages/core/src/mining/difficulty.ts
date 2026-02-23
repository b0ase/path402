/**
 * $402 Difficulty Adjuster — TypeScript Port
 *
 * Bitcoin-style difficulty adjustment for the $402 Proof-of-Indexing network.
 * Must produce identical results to the Go implementation in ClawMiner.
 *
 * Algorithm:
 * - Track all block timestamps (local + gossip) in the current period
 * - After `adjustmentPeriod` blocks, recalculate target:
 *     ratio = actual_time / expected_time
 *     new_target = old_target * ratio (clamped to 4x max change)
 * - Target is a 256-bit integer: hash must be <= target to be valid
 */

// ── Constants (must match Go) ───────────────────────────────────────

/** Easiest possible target (~2 leading hex zeros) */
const MAX_TARGET_HEX = '00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/** Hardest possible target (16 leading hex zeros) */
const MIN_TARGET_HEX = '0000000000000000ffffffffffffffffffffffffffffffffffffffffffffffff';

/** Max change per adjustment period (Bitcoin uses 4x) */
const MAX_ADJUST_FACTOR = 4.0;

// ── Utility Functions ───────────────────────────────────────────────

/**
 * Convert leading-hex-zeros difficulty to a 256-bit target.
 * E.g., difficulty=3 → 0x000FFFFF...FFF (3 leading zeros, rest F).
 * Must match Go's TargetFromDifficulty exactly.
 */
export function targetFromDifficulty(difficulty: number): bigint {
    if (difficulty < 1) difficulty = 1;
    if (difficulty > 62) difficulty = 62;
    const hex = '0'.repeat(difficulty) + 'f'.repeat(64 - difficulty);
    return BigInt('0x' + hex);
}

/**
 * Return the approximate leading-hex-zeros from a target.
 * Must match Go's DifficultyFromTarget exactly.
 */
export function difficultyFromTarget(target: bigint): number {
    if (target <= 0n) return 64;
    const hex = target.toString(16).padStart(64, '0');
    let count = 0;
    for (const c of hex) {
        if (c === '0') count++;
        else break;
    }
    return count;
}

// ── DifficultyAdjuster Class ────────────────────────────────────────

export class DifficultyAdjuster {
    private _target: bigint;
    private adjustmentPeriod: number;
    private targetBlockTimeMs: number;
    private blockTimestamps: number[]; // Timestamps (ms) in current period
    private _totalBlocks: number;
    private maxTarget: bigint;
    private minTarget: bigint;

    /**
     * @param initialDifficulty Starting difficulty as leading hex zeros (e.g., 3)
     * @param adjustmentPeriod Blocks between adjustments (e.g., 144 = ~1 day at 10min blocks)
     * @param targetBlockTimeMs Desired time between blocks in ms (e.g., 600000 = 10min)
     */
    constructor(initialDifficulty: number, adjustmentPeriod: number, targetBlockTimeMs: number) {
        this._target = targetFromDifficulty(initialDifficulty);
        this.adjustmentPeriod = adjustmentPeriod;
        this.targetBlockTimeMs = targetBlockTimeMs;
        this.blockTimestamps = [];
        this._totalBlocks = 0;
        this.maxTarget = BigInt('0x' + MAX_TARGET_HEX);
        this.minTarget = BigInt('0x' + MIN_TARGET_HEX);
    }

    /**
     * Record a block observation from any source (local mining or gossip).
     * This is the core input to the difficulty adjustment algorithm.
     */
    recordBlock(timestampMs: number): void {
        this.blockTimestamps.push(timestampMs);
        this._totalBlocks++;

        if (this.blockTimestamps.length >= this.adjustmentPeriod) {
            this.adjust();
        }
    }

    /**
     * Recalculate the mining target based on observed block rate.
     * Bitcoin formula: new_target = old_target * (actual_time / expected_time)
     * Clamped to max 4x change per period.
     * Must match Go adjust() exactly.
     */
    private adjust(): void {
        const n = this.blockTimestamps.length;
        if (n < 2) {
            this.blockTimestamps = [];
            return;
        }

        let actualTimeMs = this.blockTimestamps[n - 1] - this.blockTimestamps[0];
        const expectedTimeMs = (n - 1) * this.targetBlockTimeMs;

        if (actualTimeMs <= 0) {
            actualTimeMs = 1000; // prevent division by zero
        }

        // ratio = actual / expected
        // < 1.0 → blocks came too fast → decrease target (harder)
        // > 1.0 → blocks came too slow → increase target (easier)
        let ratio = actualTimeMs / expectedTimeMs;

        if (ratio > MAX_ADJUST_FACTOR) {
            ratio = MAX_ADJUST_FACTOR;
        }
        if (ratio < 1.0 / MAX_ADJUST_FACTOR) {
            ratio = 1.0 / MAX_ADJUST_FACTOR;
        }

        // new_target = old_target * ratio
        // Using fixed-point: multiply by (ratio * 10000), divide by 10000
        // Must match Go's int64(ratio * 10000) truncation behavior
        let scaledRatio = BigInt(Math.trunc(ratio * 10000));
        if (scaledRatio < 1n) {
            scaledRatio = 1n;
        }

        let newTarget = this._target * scaledRatio / 10000n;

        // Clamp to bounds
        if (newTarget > this.maxTarget) {
            newTarget = this.maxTarget;
        }
        if (newTarget < this.minTarget) {
            newTarget = this.minTarget;
        }

        const oldDiff = difficultyFromTarget(this._target);
        const newDiff = difficultyFromTarget(newTarget);

        console.log(
            `[difficulty] ADJUSTMENT: ${n} blocks in ${Math.round(actualTimeMs / 1000)}s ` +
            `(expected ${Math.round(expectedTimeMs / 1000)}s). ` +
            `Ratio: ${ratio.toFixed(2)}x. Difficulty: ${oldDiff} → ${newDiff}`
        );

        this._target = newTarget;
        this.blockTimestamps = [];
    }

    /** Current mining target (copy) */
    get target(): bigint {
        return this._target;
    }

    /** Current target as a zero-padded 64-char hex string */
    targetHex(): string {
        return this._target.toString(16).padStart(64, '0');
    }

    /** Current approximate difficulty (leading hex zeros) */
    difficulty(): number {
        return difficultyFromTarget(this._target);
    }

    /** Check if hash (hex string) meets the current target */
    checkHash(hash: string): boolean {
        const h = BigInt('0x' + hash);
        return h <= this._target;
    }

    /** Total blocks observed since node start */
    get totalBlocks(): number {
        return this._totalBlocks;
    }

    /** API-friendly stats object */
    stats(): Record<string, unknown> {
        return {
            difficulty: difficultyFromTarget(this._target),
            target: this.targetHex(),
            adjustment_period: this.adjustmentPeriod,
            target_block_time_s: this.targetBlockTimeMs / 1000,
            blocks_until_adjust: this.adjustmentPeriod - this.blockTimestamps.length,
            blocks_in_period: this.blockTimestamps.length,
            total_network_blocks: this._totalBlocks,
        };
    }

    /** Restore a previously persisted target (e.g., from DB on restart) */
    setTarget(target: bigint): void {
        this._target = target;
    }

    /**
     * Rebuild the adjustment window from historical block timestamps.
     * Called on startup with the most recent block times from the database.
     */
    restoreState(target: bigint, totalBlocks: number, recentTimestampsMs: number[]): void {
        this._target = target;
        this._totalBlocks = totalBlocks;
        if (recentTimestampsMs.length > this.adjustmentPeriod) {
            recentTimestampsMs = recentTimestampsMs.slice(
                recentTimestampsMs.length - this.adjustmentPeriod
            );
        }
        this.blockTimestamps = recentTimestampsMs;
    }
}
