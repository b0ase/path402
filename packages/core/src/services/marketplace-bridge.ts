/**
 * Marketplace Bridge
 *
 * Fetches live token and market data from path402.com public APIs,
 * caches results in the local SQLite database via upsertToken(),
 * and emits events for the agent to relay to the GUI.
 */

import { EventEmitter } from 'events';
import { upsertToken, getAllTokens } from '../db/index.js';

export interface MarketplaceData {
  tokens: MarketplaceToken[];
  stats: MarketplaceStats | null;
  bsvPrice: number | null;
  lastSyncedAt: number;
}

export interface MarketplaceToken {
  address: string;
  name: string;
  issuer_handle: string | null;
  current_supply: number;
  current_price_sats: number;
  base_price_sats: number;
  pricing_model: string;
  content_type: string | null;
  access_url: string | null;
}

export interface MarketplaceStats {
  /** Label identifying which token these stats describe */
  tokenLabel: string;
  /** x402 facilitator total inscriptions */
  totalInscriptions: number;
  /** x402 facilitator total fees collected */
  totalFees: number;
  /** path402.com platform token current price (NOT $402 HTM) */
  currentPrice: number;
  /** path402.com platform tokens sold */
  supplySold: number;
  /** path402.com platform tokens remaining in treasury (out of 500M) */
  treasuryRemaining: number;
}

export class MarketplaceBridge extends EventEmitter {
  private apiUrl: string;
  private interval: ReturnType<typeof setInterval> | null = null;
  private syncIntervalMs: number;
  private data: MarketplaceData = {
    tokens: [],
    stats: null,
    bsvPrice: null,
    lastSyncedAt: 0,
  };

  constructor(apiUrl = 'https://path402.com', syncIntervalMs = 30_000) {
    super();
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.syncIntervalMs = syncIntervalMs;
  }

  async start(): Promise<void> {
    console.log(`[MarketplaceBridge] Starting — fetching from ${this.apiUrl} every ${this.syncIntervalMs / 1000}s`);

    // Initial sync
    await this.sync();

    // Periodic sync
    this.interval = setInterval(() => this.sync(), this.syncIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('[MarketplaceBridge] Stopped');
  }

  getData(): MarketplaceData {
    return this.data;
  }

  async getBsvPrice(): Promise<number> {
    if (this.data.bsvPrice !== null) return this.data.bsvPrice;
    await this.syncBsvPrice();
    return this.data.bsvPrice ?? 45; // fallback
  }

  // ── Sync All ────────────────────────────────────────────────────

  private async sync(): Promise<void> {
    const results = await Promise.allSettled([
      this.syncTokens(),
      this.syncStats(),
      this.syncBsvPrice(),
    ]);

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[MarketplaceBridge] ${failures.length}/${results.length} sync tasks failed`);
    }

    this.data.lastSyncedAt = Date.now();
    this.emit('synced', this.data);
  }

  // ── Token Sync ──────────────────────────────────────────────────

  private async syncTokens(): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}/api/tokens?limit=100`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json() as { tokens: any[]; count: number };
      const tokens: MarketplaceToken[] = [];

      for (const t of body.tokens) {
        const token: MarketplaceToken = {
          address: t.address || t.token_id || t.id,
          name: t.name || t.address,
          issuer_handle: t.issuer_handle || t.issuer || null,
          current_supply: t.current_supply ?? t.supply ?? 0,
          current_price_sats: t.current_price_sats ?? t.price ?? 500,
          base_price_sats: t.base_price_sats ?? 500,
          pricing_model: t.pricing_model || 'alice_bond',
          content_type: t.content_type || null,
          access_url: t.access_url || null,
        };
        tokens.push(token);

        // Cache into local SQLite
        upsertToken({
          token_id: token.address,
          name: token.name,
          issuer_handle: token.issuer_handle,
          current_supply: token.current_supply,
          base_price_sats: token.base_price_sats,
          pricing_model: token.pricing_model,
          content_type: token.content_type,
          access_url: token.access_url,
          discovered_via: 'marketplace',
          verification_status: 'verified',
        });
      }

      this.data.tokens = tokens;
      console.log(`[MarketplaceBridge] Synced ${tokens.length} tokens from marketplace`);
      this.emit('tokens:synced', tokens);
    } catch (err) {
      console.warn('[MarketplaceBridge] Token sync failed:', (err as Error).message);
    }
  }

  // ── Stats Sync ──────────────────────────────────────────────────

  private async syncStats(): Promise<void> {
    try {
      // Fetch both token stats and x402 stats in parallel
      const [tokenStatsRes, x402StatsRes] = await Promise.allSettled([
        fetch(`${this.apiUrl}/api/token/stats`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${this.apiUrl}/api/x402/stats`, { signal: AbortSignal.timeout(10_000) }),
      ]);

      let currentPrice = 0;
      let supplySold = 0;
      let treasuryRemaining = 0;
      let totalInscriptions = 0;
      let totalFees = 0;

      if (tokenStatsRes.status === 'fulfilled' && tokenStatsRes.value.ok) {
        const tokenStats = await tokenStatsRes.value.json();
        currentPrice = tokenStats.currentPrice ?? 0;
        supplySold = tokenStats.supplySold ?? 0;
        treasuryRemaining = tokenStats.treasuryRemaining ?? tokenStats.treasuryBalance ?? 0;
      }

      if (x402StatsRes.status === 'fulfilled' && x402StatsRes.value.ok) {
        const x402Stats = await x402StatsRes.value.json();
        totalInscriptions = x402Stats.stats?.totalInscriptions ?? 0;
        totalFees = x402Stats.stats?.totalFeesCollected ?? 0;
      }

      this.data.stats = {
        tokenLabel: 'path402.com Platform Token (500M supply)',
        totalInscriptions,
        totalFees,
        currentPrice,
        supplySold,
        treasuryRemaining,
      };

      this.emit('stats:synced', this.data.stats);
    } catch (err) {
      console.warn('[MarketplaceBridge] Stats sync failed:', (err as Error).message);
    }
  }

  // ── BSV Price Sync ──────────────────────────────────────────────

  private async syncBsvPrice(): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}/api/price/bsv`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json() as { bsv_usd: number };
      this.data.bsvPrice = body.bsv_usd;
    } catch (err) {
      console.warn('[MarketplaceBridge] BSV price sync failed:', (err as Error).message);
    }
  }
}
