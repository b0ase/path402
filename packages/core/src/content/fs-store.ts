/**
 * Filesystem-backed ContentStore
 *
 * Stores content at ~/path402/content/{hash-prefix}/{hash}
 * Metadata persisted to SQLite content_cache table.
 */

import { createHash } from 'crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, statSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { Readable } from 'stream';
import type { ContentStore, ContentMeta, ContentStoreStats } from './store.js';
import {
  upsertContentCache,
  getContentByHash,
  getAllCachedContent,
  deleteContentCache,
  getContentCacheStats
} from '../db/index.js';

export class FsContentStore implements ContentStore {
  private baseDir: string;

  constructor(dataDir?: string) {
    this.baseDir = join(dataDir || join(homedir(), '.pathd'), 'content');
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  private hashPath(hash: string): string {
    const prefix = hash.slice(0, 2);
    const dir = join(this.baseDir, prefix);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return join(dir, hash);
  }

  async put(tokenId: string, data: Buffer, contentType: string, pricePaidSats = 0): Promise<string> {
    const hash = createHash('sha256').update(data).digest('hex');
    const filePath = this.hashPath(hash);

    await writeFile(filePath, data);

    upsertContentCache({
      token_id: tokenId,
      content_hash: hash,
      content_type: contentType,
      content_size: data.length,
      content_path: filePath,
      price_paid_sats: pricePaidSats
    });

    return hash;
  }

  async get(hash: string): Promise<Buffer | null> {
    const meta = getContentByHash(hash);
    if (!meta) return null;

    const filePath = meta.content_path || this.hashPath(hash);
    if (!existsSync(filePath)) return null;

    return readFileSync(filePath);
  }

  async has(hash: string): Promise<boolean> {
    const meta = getContentByHash(hash);
    if (!meta) return false;

    const filePath = meta.content_path || this.hashPath(hash);
    return existsSync(filePath);
  }

  async list(): Promise<ContentMeta[]> {
    const rows = getAllCachedContent();
    return rows.map(row => ({
      hash: row.content_hash,
      tokenId: row.token_id,
      contentType: row.content_type || 'application/octet-stream',
      size: row.content_size || 0,
      path: row.content_path || undefined,
      acquiredAt: row.acquired_at,
      pricePaidSats: row.price_paid_sats || 0
    }));
  }

  async delete(hash: string): Promise<boolean> {
    const meta = getContentByHash(hash);
    if (!meta) return false;

    const filePath = meta.content_path || this.hashPath(hash);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    deleteContentCache(hash);
    return true;
  }

  async getStorageUsed(): Promise<number> {
    const stats = getContentCacheStats();
    return stats.totalBytes;
  }

  async getStream(hash: string): Promise<Readable | null> {
    const meta = getContentByHash(hash);
    if (!meta) return null;

    const filePath = meta.content_path || this.hashPath(hash);
    if (!existsSync(filePath)) return null;

    return createReadStream(filePath);
  }

  async getStats(): Promise<ContentStoreStats> {
    const stats = getContentCacheStats();
    return {
      totalItems: stats.totalItems,
      totalBytes: stats.totalBytes,
      availableBytes: 1_000_000_000_000 // 1 TB placeholder
    };
  }
}
