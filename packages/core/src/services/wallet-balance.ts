/**
 * Wallet Balance Polling Service
 *
 * Periodically checks BSV wallet balance via WhatsOnChain.
 * Emits low-balance warnings to match Go ClawMiner's internal/daemon/balanceLoop.
 */

import { EventEmitter } from 'events';

const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main';
const LOW_BALANCE_THRESHOLD = 5000; // satoshis

export interface WalletBalanceConfig {
  /** BSV address to monitor */
  address: string;
  /** Poll interval in ms (default: 60000) */
  pollIntervalMs?: number;
  /** Low balance threshold in satoshis (default: 5000) */
  lowBalanceThreshold?: number;
}

export interface WalletBalanceStatus {
  address: string;
  balance_satoshis: number;
  funded: boolean;
  low_balance: boolean;
  last_checked: number;
}

export class WalletBalanceService extends EventEmitter {
  private address: string;
  private pollIntervalMs: number;
  private lowThreshold: number;
  private balanceSatoshis = 0;
  private funded = false;
  private lastChecked = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(config: WalletBalanceConfig) {
    super();
    this.address = config.address;
    this.pollIntervalMs = config.pollIntervalMs ?? 60000;
    this.lowThreshold = config.lowBalanceThreshold ?? LOW_BALANCE_THRESHOLD;
  }

  async start(): Promise<void> {
    if (!this.address || this.address.includes('PLACEHOLDER')) {
      console.log('[wallet] No valid address configured — balance polling disabled');
      return;
    }

    console.log(`[wallet] Starting balance polling for ${this.address} (every ${this.pollIntervalMs / 1000}s)`);

    // Immediate first check
    await this.check();

    // Start polling
    this.pollTimer = setInterval(() => {
      if (!this.stopped) this.check();
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getStatus(): WalletBalanceStatus {
    return {
      address: this.address,
      balance_satoshis: this.balanceSatoshis,
      funded: this.funded,
      low_balance: this.balanceSatoshis < this.lowThreshold,
      last_checked: this.lastChecked,
    };
  }

  private async check(): Promise<void> {
    try {
      const res = await fetch(`${WOC_BASE}/address/${this.address}/unspent`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`[wallet] Balance check failed: HTTP ${res.status}`);
        return;
      }
      const utxos = (await res.json()) as Array<{ value: number }>;
      let total = 0;
      for (const u of utxos) {
        total += u.value;
      }

      this.balanceSatoshis = total;
      this.funded = total > 0;
      this.lastChecked = Math.floor(Date.now() / 1000);

      if (total < this.lowThreshold) {
        console.warn(`[wallet] LOW BALANCE: ${total} sat remaining — fund ${this.address} to continue minting`);
        this.emit('low_balance', { address: this.address, balance: total });
      }
    } catch (err) {
      console.warn('[wallet] Balance check error:', (err as Error).message);
    }
  }
}
