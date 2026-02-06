/**
 * ContentStore Interface
 *
 * Abstraction for storing and retrieving content blobs.
 * Implementations can use filesystem, S3, IPFS, etc.
 */

import { Readable } from 'stream';

export interface ContentMeta {
  hash: string;           // SHA-256 hex
  tokenId: string;
  contentType: string;
  size: number;           // bytes
  path?: string;          // local path (fs-store)
  acquiredAt: number;     // unix epoch
  pricePaidSats: number;
}

export interface ContentStoreStats {
  totalItems: number;
  totalBytes: number;
  availableBytes: number; // placeholder until disk check
}

export interface ContentStore {
  /** Store content blob, returns SHA-256 hash */
  put(tokenId: string, data: Buffer, contentType: string, pricePaidSats?: number): Promise<string>;

  /** Retrieve content by hash */
  get(hash: string): Promise<Buffer | null>;

  /** Check if content exists */
  has(hash: string): Promise<boolean>;

  /** List all stored content */
  list(): Promise<ContentMeta[]>;

  /** Delete content by hash */
  delete(hash: string): Promise<boolean>;

  /** Total storage used in bytes */
  getStorageUsed(): Promise<number>;

  /** Get a readable stream for content */
  getStream(hash: string): Promise<Readable | null>;

  /** Get storage stats */
  getStats(): Promise<ContentStoreStats>;
}
