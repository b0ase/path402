/**
 * MiningBridge connects agent actions to the ClawMiner daemon's mining mempool.
 * Every action the agent performs (content store, evaluation, acquisition, etc.)
 * produces a SHA-256 hash that gets submitted as a work item. The miner rolls
 * these into a merkle tree and performs proof-of-work, proving the device
 * actually did useful work.
 *
 * Architecture:
 *   Agent action -> SHA-256 hash -> POST /api/work/submit -> Go mining mempool -> PoW -> $402 mint
 *
 * MCP Tool Integration (to be wired in follow-up):
 *   - path402_acquire  -> type: "acquisition", hash of the acquisition receipt
 *   - path402_serve    -> type: "serve", hash of the served content
 *   - path402_evaluate -> type: "evaluation", hash of the evaluation result
 *   - Content creation (via fs-store) -> type: "content", hash of the content (auto-wired)
 */

import { createHash } from 'crypto';

export type WorkType =
  | 'content'
  | 'evaluation'
  | 'acquisition'
  | 'transcription'
  | 'generation'
  | 'serve';

export interface WorkItem {
  type: WorkType;
  hash: string;
  metadata?: Record<string, unknown>;
}

export interface SubmitResponse {
  submitted: number;
  mempool: string;
}

export interface MempoolStatus {
  pending: number;
  hashrate?: number;
  lastBlock?: string;
}

export class MiningBridge {
  private daemonUrl: string;
  private buffer: WorkItem[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs = 5_000;
  private readonly maxBufferSize = 10;

  constructor(daemonUrl = 'http://127.0.0.1:8402') {
    this.daemonUrl = daemonUrl.replace(/\/+$/, '');
    this.startAutoFlush();
  }

  /**
   * Submit a single work item. Buffers internally and auto-flushes.
   */
  async submitWork(
    type: WorkType,
    hash: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.buffer.push({ type, hash, metadata });

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Submit a batch of work items. Buffers internally.
   */
  async submitBatch(items: WorkItem[]): Promise<void> {
    this.buffer.push(...items);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Convenience: SHA-256 hash the data, then submit as a work item.
   */
  async hashAndSubmit(
    type: WorkType,
    data: Buffer | string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const hash = createHash('sha256')
      .update(typeof data === 'string' ? Buffer.from(data) : data)
      .digest('hex');

    await this.submitWork(type, hash, metadata);
    return hash;
  }

  /**
   * Query the daemon's mempool status.
   */
  async status(): Promise<MempoolStatus | null> {
    try {
      const res = await fetch(`${this.daemonUrl}/api/work/status`);
      if (!res.ok) return null;
      return (await res.json()) as MempoolStatus;
    } catch (err) {
      console.warn('[MiningBridge] status check failed:', (err as Error).message);
      return null;
    }
  }

  /**
   * Flush the internal buffer to the daemon. Called automatically every
   * 5 seconds or when the buffer reaches 10 items.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const items = this.buffer.splice(0);

    try {
      const body =
        items.length === 1
          ? JSON.stringify(items[0])
          : JSON.stringify({ items });

      const res = await fetch(`${this.daemonUrl}/api/work/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        console.warn(
          `[MiningBridge] submit failed (${res.status}):`,
          await res.text().catch(() => 'no body')
        );
      }
    } catch (err) {
      // Mining is best-effort. Log but don't throw.
      console.warn('[MiningBridge] flush failed:', (err as Error).message);
    }
  }

  /**
   * Stop the auto-flush timer. Call on shutdown.
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Final flush
    await this.flush();
  }

  /** Number of buffered items not yet sent */
  get pending(): number {
    return this.buffer.length;
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {
        // swallow — logged inside flush()
      });
    }, this.flushIntervalMs);

    // Don't let the timer keep the process alive
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }
}
