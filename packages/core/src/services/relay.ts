/**
 * SPV Relay Mesh — RelayService
 *
 * When a ClawMiner broadcasts a mint tx, peers get it instantly via gossip.
 * If gossip misses a tx, peers request it over HTTP (mesh fallback).
 *
 * Memory cache (fast, bounded) + SQLite (persistent, survives restart).
 * HTTP handlers plug into the agent's existing Express/Fastify server.
 */

import { EventEmitter } from 'events';
import type { GossipNode } from '../gossip/node.js';
import {
  upsertRelayTx,
  getRelayTx,
  hasRelayTx,
  getRelayTxCount,
  pruneRelayTxs,
} from '../db/index.js';

// ── Constants ─────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PRUNE_INTERVAL_MS = 60 * 1000;  // 60 seconds
const MESH_TIMEOUT_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────

interface CachedTx {
  hex: string;
  ts: number;
  confirmed: boolean;
  blockHash?: string;
}

export interface RelayHealthInfo {
  peer_count: number;
  cache_size: number;
  db_size: number;
  uptime_ms: number;
}

// ── RelayService ──────────────────────────────────────────────────

export class RelayService extends EventEmitter {
  private txCache: Map<string, CachedTx> = new Map();
  private gossipNode: GossipNode | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private startTime: number = Date.now();
  private meshPeers: Set<string> = new Set();

  constructor() {
    super();
  }

  // ── Cache Operations ──────────────────────────────────────────

  storeTx(txid: string, hex: string, confirmed = false, blockHash?: string, sourcePeer?: string): void {
    // Memory cache
    if (this.txCache.size >= MAX_CACHE_SIZE) {
      // Evict oldest entry
      const oldest = this.txCache.entries().next().value;
      if (oldest) this.txCache.delete(oldest[0]);
    }

    this.txCache.set(txid, {
      hex,
      ts: Date.now(),
      confirmed,
      blockHash,
    });

    // Persistent store
    try {
      upsertRelayTx({ txid, raw_hex: hex, confirmed, block_hash: blockHash, source_peer: sourcePeer });
    } catch {
      // DB not initialized in some environments
    }

    this.emit('tx:stored', txid);
  }

  getTx(txid: string): { hex: string; confirmed: boolean; blockHash?: string } | null {
    // Check memory first
    const cached = this.txCache.get(txid);
    if (cached) {
      return { hex: cached.hex, confirmed: cached.confirmed, blockHash: cached.blockHash };
    }

    // Fall back to DB
    try {
      const row = getRelayTx(txid);
      if (row) {
        // Warm the memory cache
        this.txCache.set(txid, {
          hex: row.raw_hex,
          ts: row.created_at * 1000,
          confirmed: row.confirmed === 1,
          blockHash: row.block_hash ?? undefined,
        });
        return { hex: row.raw_hex, confirmed: row.confirmed === 1, blockHash: row.block_hash ?? undefined };
      }
    } catch {
      // DB not available
    }

    return null;
  }

  hasTx(txid: string): boolean {
    if (this.txCache.has(txid)) return true;
    try { return hasRelayTx(txid); } catch { return false; }
  }

  getCacheSize(): number {
    return this.txCache.size;
  }

  // ── Gossip Integration ────────────────────────────────────────

  attachToGossip(node: GossipNode): void {
    this.gossipNode = node;

    // When a peer relays a tx via gossip, store it locally
    node.on('tx:relayed', (txid: string, rawHex: string, peerId: string) => {
      if (!this.hasTx(txid)) {
        this.storeTx(txid, rawHex, false, undefined, peerId);
        console.log(`[Relay] Stored relayed TX ${txid.slice(0, 16)}... from peer ${peerId.slice(0, 8)}...`);
      }
    });

    // When a peer requests a tx, check our cache
    node.on('tx:requested', (txid: string, peerId: string) => {
      const tx = this.getTx(txid);
      if (tx) {
        console.log(`[Relay] Serving TX ${txid.slice(0, 16)}... to peer ${peerId.slice(0, 8)}...`);
        this.emit('tx:served', txid, peerId);
      }
    });
  }

  /**
   * Called after a successful mint broadcast.
   * Stores the tx locally and relays to all peers via gossip.
   */
  onMintBroadcast(txid: string, rawHex: string): void {
    this.storeTx(txid, rawHex, false);

    if (this.gossipNode) {
      this.gossipNode.relayTransaction(txid, rawHex);
    }

    console.log(`[Relay] Mint TX ${txid.slice(0, 16)}... stored and relayed`);
    this.emit('tx:minted', txid);
  }

  // ── Mesh Fallback (HTTP) ──────────────────────────────────────

  /**
   * Register a mesh peer URL for HTTP fallback lookups.
   */
  addMeshPeer(url: string): void {
    this.meshPeers.add(url);
  }

  removeMeshPeer(url: string): void {
    this.meshPeers.delete(url);
  }

  /**
   * Look up a tx from mesh peers via HTTP.
   * Tries each peer until one responds with the tx.
   */
  async meshLookup(txid: string, excludePeer?: string): Promise<string | null> {
    for (const peerUrl of this.meshPeers) {
      if (excludePeer && peerUrl === excludePeer) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MESH_TIMEOUT_MS);

        const res = await fetch(`${peerUrl}/relay/tx/${txid}?nomesh=1`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json() as { txid: string; raw_hex: string; confirmed: boolean; block_hash?: string };
          if (data.raw_hex) {
            this.storeTx(txid, data.raw_hex, data.confirmed, data.block_hash, peerUrl);
            console.log(`[Relay] Mesh fetched TX ${txid.slice(0, 16)}... from ${peerUrl}`);
            return data.raw_hex;
          }
        }
      } catch {
        // Peer unreachable — continue to next
      }
    }

    return null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  start(): void {
    this.startTime = Date.now();

    // Prune expired entries periodically
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let pruned = 0;
      for (const [txid, entry] of this.txCache) {
        if (now - entry.ts > CACHE_TTL_MS) {
          this.txCache.delete(txid);
          pruned++;
        }
      }
      // Also prune DB
      try { pruneRelayTxs(CACHE_TTL_MS / 1000); } catch { /* no db */ }
      if (pruned > 0) {
        console.log(`[Relay] Pruned ${pruned} expired entries from memory cache`);
      }
    }, PRUNE_INTERVAL_MS);

    console.log('[Relay] RelayService started');
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    console.log('[Relay] RelayService stopped');
  }

  health(): RelayHealthInfo {
    let dbSize = 0;
    try { dbSize = getRelayTxCount(); } catch { /* no db */ }

    return {
      peer_count: this.gossipNode?.getPeerCount() ?? 0,
      cache_size: this.txCache.size,
      db_size: dbSize,
      uptime_ms: Date.now() - this.startTime,
    };
  }

  // ── HTTP Route Handlers ───────────────────────────────────────
  // These return handler functions suitable for Express, Fastify, or raw http

  /**
   * GET /relay/tx/:txid — return raw tx hex from cache
   * Query: ?nomesh=1 disables mesh forwarding (loop prevention)
   */
  handleGetTx() {
    return async (txid: string, nomesh: boolean): Promise<{
      status: number;
      body: Record<string, unknown>;
    }> => {
      const tx = this.getTx(txid);
      if (tx) {
        return {
          status: 200,
          body: { txid, raw_hex: tx.hex, confirmed: tx.confirmed, block_hash: tx.blockHash ?? null },
        };
      }

      // Mesh fallback (unless nomesh)
      if (!nomesh) {
        const hex = await this.meshLookup(txid);
        if (hex) {
          const stored = this.getTx(txid);
          return {
            status: 200,
            body: { txid, raw_hex: hex, confirmed: stored?.confirmed ?? false, block_hash: stored?.blockHash ?? null },
          };
        }
      }

      return { status: 404, body: { error: 'tx not found' } };
    };
  }

  /**
   * GET /relay/tx/:txid/status — check if we have a tx
   */
  handleGetTxStatus() {
    return (txid: string): { status: number; body: Record<string, unknown> } => {
      const tx = this.getTx(txid);
      return {
        status: 200,
        body: {
          txid,
          found: !!tx,
          confirmed: tx?.confirmed ?? false,
          block_hash: tx?.blockHash ?? null,
        },
      };
    };
  }

  /**
   * GET /relay/health
   */
  handleHealth() {
    return (): { status: number; body: RelayHealthInfo } => {
      return { status: 200, body: this.health() };
    };
  }

  /**
   * POST /relay/tx — accept raw tx, store + relay
   * Body: { txid: string, raw_hex: string }
   * Query: ?nomesh=1 disables mesh forwarding
   */
  handlePostTx() {
    return (txid: string, rawHex: string, nomesh: boolean): { status: number; body: Record<string, unknown> } => {
      if (!txid || !rawHex) {
        return { status: 400, body: { error: 'txid and raw_hex required' } };
      }

      // Basic txid format validation
      if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
        return { status: 400, body: { error: 'invalid txid format' } };
      }

      this.storeTx(txid, rawHex);

      // Relay to gossip (unless nomesh)
      if (!nomesh && this.gossipNode) {
        this.gossipNode.relayTransaction(txid, rawHex);
      }

      return { status: 200, body: { stored: true, relayed: !nomesh } };
    };
  }
}
