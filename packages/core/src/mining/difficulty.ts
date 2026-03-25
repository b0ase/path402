/**
 * $402 Difficulty Adjuster — Implementation moved to private repo for security.
 * Type stubs remain for compilation.
 */

const MOVED = 'DifficultyAdjuster implementation moved to private repo (Claw-Miner-App)';

export function targetFromDifficulty(_difficulty: number): bigint { throw new Error(MOVED); }
export function difficultyFromTarget(_target: bigint): number { throw new Error(MOVED); }

export class DifficultyAdjuster {
    constructor(_initialDifficulty: number, _adjustmentPeriod: number, _targetBlockTimeMs: number) {
        throw new Error(MOVED);
    }
    recordBlock(_timestampMs: number): void { throw new Error(MOVED); }
    get target(): bigint { throw new Error(MOVED); }
    targetHex(): string { throw new Error(MOVED); }
    difficulty(): number { throw new Error(MOVED); }
    checkHash(_hash: string): boolean { throw new Error(MOVED); }
    get totalBlocks(): number { throw new Error(MOVED); }
    stats(): Record<string, unknown> { throw new Error(MOVED); }
    setTarget(_target: bigint): void { throw new Error(MOVED); }
    restoreState(_target: bigint, _totalBlocks: number, _recentTimestampsMs: number[]): void { throw new Error(MOVED); }
}
