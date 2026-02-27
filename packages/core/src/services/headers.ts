/**
 * Bitcoin Header Sync Service
 *
 * Syncs BSV block headers from a Block Headers Service (BHS) into local SQLite.
 * Enables SPV merkle proof validation without a full node.
 *
 * Matches Go ClawMiner's internal/headers/ package for cross-client compatibility.
 */

import { EventEmitter } from 'events';
import {
  insertBlockHeaders,
  getHighestHeaderHeight,
  getBlockHeaderCount,
  hasMerkleRoot,
  type BlockHeaderRow,
} from '../db/index.js';

export interface HeaderSyncConfig {
  /** BHS server URL (e.g., http://135.181.103.181:8090) */
  bhsUrl: string;
  /** BHS API key */
  bhsApiKey?: string;
  /** Sync on startup (default: true) */
  syncOnBoot?: boolean;
  /** Poll interval in ms (default: 30000) */
  pollIntervalMs?: number;
  /** Headers per batch (default: 2000) */
  batchSize?: number;
  /** Max retries per height (default: 5) */
  maxRetries?: number;
}

export interface SyncProgress {
  totalHeaders: number;
  highestHeight: number;
  chainTipHeight: number;
  isSyncing: boolean;
  lastSyncedAt: number;
}

export class HeaderSyncService extends EventEmitter {
  private config: Required<HeaderSyncConfig>;
  private progress: SyncProgress = {
    totalHeaders: 0,
    highestHeight: -1,
    chainTipHeight: 0,
    isSyncing: false,
    lastSyncedAt: 0,
  };
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(config: HeaderSyncConfig) {
    super();
    this.config = {
      bhsUrl: config.bhsUrl,
      bhsApiKey: config.bhsApiKey || '',
      syncOnBoot: config.syncOnBoot ?? true,
      pollIntervalMs: config.pollIntervalMs ?? 30000,
      batchSize: config.batchSize ?? 2000,
      maxRetries: config.maxRetries ?? 5,
    };
  }

  /** Start the sync service */
  async start(): Promise<void> {
    if (!this.config.bhsUrl) {
      console.log('[headers] No BHS URL configured — header sync disabled');
      return;
    }

    console.log(`[headers] Starting sync service (BHS: ${this.config.bhsUrl})`);

    if (this.config.syncOnBoot) {
      await this.initialSync();
    }

    this.pollTimer = setInterval(() => {
      if (!this.stopped) this.incrementalSync();
    }, this.config.pollIntervalMs);
  }

  /** Stop the sync service */
  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[headers] Sync service stopped');
  }

  /** Get current sync progress */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /** Validate a merkle root at a given height. Checks local DB first, falls back to BHS API. */
  async validateMerkleRoot(root: string, height: number): Promise<boolean> {
    // Check local first
    if (hasMerkleRoot(root, height)) {
      return true;
    }

    // Fall back to remote BHS
    if (!this.config.bhsUrl) return false;

    try {
      const res = await fetch(
        `${this.config.bhsUrl}/api/v1/chain/header/byHeight?height=${height}`,
        {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!res.ok) return false;
      const header = await res.json() as { merkleRoot?: string; merkle_root?: string };
      const remoteMerkle = header.merkleRoot || header.merkle_root || '';
      return remoteMerkle === root;
    } catch {
      return false;
    }
  }

  private async initialSync(): Promise<void> {
    console.log('[headers] Starting initial sync...');
    this.progress.isSyncing = true;

    try {
      const tipHeight = await this.fetchChainTip();
      if (tipHeight < 0) return;

      this.progress.chainTipHeight = tipHeight;
      const localHeight = getHighestHeaderHeight();

      if (localHeight >= tipHeight) {
        this.progress.totalHeaders = getBlockHeaderCount();
        this.progress.highestHeight = localHeight;
        console.log(`[headers] Already synced to tip ${tipHeight} (${this.progress.totalHeaders} headers stored)`);
        return;
      }

      console.log(`[headers] Syncing from height ${localHeight + 1} to ${tipHeight} (${tipHeight - localHeight} headers to fetch)`);
      await this.fetchRange(localHeight + 1, tipHeight);

      this.progress.totalHeaders = getBlockHeaderCount();
      this.progress.highestHeight = getHighestHeaderHeight();
      console.log(`[headers] Initial sync complete: ${this.progress.totalHeaders} headers stored, highest=${this.progress.highestHeight}`);
    } finally {
      this.progress.isSyncing = false;
      this.progress.lastSyncedAt = Math.floor(Date.now() / 1000);
    }
  }

  private async incrementalSync(): Promise<void> {
    try {
      const tipHeight = await this.fetchChainTip();
      if (tipHeight < 0) return;

      this.progress.chainTipHeight = tipHeight;
      const localHeight = getHighestHeaderHeight();

      if (localHeight >= tipHeight) return;

      this.progress.isSyncing = true;
      await this.fetchRange(localHeight + 1, tipHeight);

      this.progress.totalHeaders = getBlockHeaderCount();
      this.progress.highestHeight = getHighestHeaderHeight();
    } finally {
      this.progress.isSyncing = false;
      this.progress.lastSyncedAt = Math.floor(Date.now() / 1000);
    }
  }

  private async fetchChainTip(): Promise<number> {
    try {
      const res = await fetch(`${this.config.bhsUrl}/api/v1/chain/tip`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`[headers] BHS tip request failed: ${res.status}`);
        return -1;
      }
      const data = await res.json() as { height?: number; blockHeight?: number };
      return data.height ?? data.blockHeight ?? -1;
    } catch (err) {
      console.warn(`[headers] Failed to get chain tip:`, err);
      return -1;
    }
  }

  private async fetchRange(from: number, to: number): Promise<void> {
    const batch: BlockHeaderRow[] = [];
    let retries = 0;

    for (let height = from; height <= to && !this.stopped; height++) {
      try {
        const header = await this.fetchHeader(height);
        if (!header) {
          retries++;
          if (retries > this.config.maxRetries) {
            console.warn(`[headers] Too many errors at height ${height}, pausing sync`);
            break;
          }
          height--; // retry same height
          await new Promise(r => setTimeout(r, retries * 1000));
          continue;
        }
        retries = 0;
        batch.push(header);

        if (batch.length >= this.config.batchSize) {
          const inserted = insertBlockHeaders(batch);
          this.progress.highestHeight = height;
          this.progress.totalHeaders += inserted;
          batch.length = 0;
        }

        // Log progress every 10K headers
        if ((height - from) > 0 && (height - from) % 10000 === 0) {
          const pct = ((height - from) / (to - from) * 100).toFixed(1);
          console.log(`[headers] Progress: ${height - from}/${to - from} headers (${pct}%)`);
        }
      } catch (err) {
        retries++;
        if (retries > this.config.maxRetries) {
          console.warn(`[headers] Too many errors at height ${height}:`, err);
          break;
        }
        height--; // retry
        await new Promise(r => setTimeout(r, retries * 1000));
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      insertBlockHeaders(batch);
    }
  }

  private async fetchHeader(height: number): Promise<BlockHeaderRow | null> {
    const res = await fetch(
      `${this.config.bhsUrl}/api/v1/chain/header/byHeight?height=${height}`,
      {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;

    return {
      height: (data.height as number) ?? height,
      hash: (data.hash as string) || '',
      version: (data.version as number) || 0,
      merkle_root: (data.merkleRoot as string) || (data.merkle_root as string) || '',
      timestamp: (data.timestamp as number) || (data.time as number) || 0,
      bits: (data.bits as number) || 0,
      nonce: (data.nonce as number) || 0,
      prev_hash: (data.previousBlock as string) || (data.prev_hash as string) || (data.prevHash as string) || '',
    };
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (this.config.bhsApiKey) {
      headers['Authorization'] = `Bearer ${this.config.bhsApiKey}`;
    }
    return headers;
  }
}
