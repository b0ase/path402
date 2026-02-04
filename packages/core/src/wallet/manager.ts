/**
 * Multi-Chain Wallet Manager
 *
 * Coordinates wallets across chains.
 * BSV is primary, others for user adoption.
 * Automatically finds cheapest chain for transactions.
 */

import {
  ChainId,
  ChainWallet,
  WalletManager,
  WalletBalance,
  FeeEstimate,
  PaymentRequest,
  PaymentResult
} from './types.js';
import { BSVWallet } from './bsv.js';

// ── Wallet Manager Implementation ──────────────────────────────────

export class MultiChainWalletManager implements WalletManager {
  private wallets: Map<ChainId, ChainWallet> = new Map();
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();

  constructor() {
    // BSV wallet is always initialized (primary chain)
    this.wallets.set('bsv', new BSVWallet());
  }

  // ── Wallet Management ──────────────────────────────────────────

  /**
   * Add a wallet for a specific chain
   */
  addWallet(chain: ChainId, wallet: ChainWallet): void {
    this.wallets.set(chain, wallet);
  }

  /**
   * Get wallet for specific chain
   */
  getWallet(chain: ChainId): ChainWallet | null {
    return this.wallets.get(chain) || null;
  }

  /**
   * Get all connected wallets
   */
  getConnectedWallets(): ChainWallet[] {
    return Array.from(this.wallets.values()).filter(w => w.isConnected());
  }

  /**
   * Connect all wallets
   */
  async connectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.wallets.values()).map(w => w.connect().catch(() => {}))
    );
  }

  /**
   * Get addresses for all connected wallets
   */
  async getAddresses(): Promise<Record<ChainId, string>> {
    const addresses: Record<string, string> = {};

    for (const [chain, wallet] of this.wallets) {
      if (wallet.isConnected()) {
        try {
          addresses[chain] = await wallet.getAddress();
        } catch {
          // Skip if can't get address
        }
      }
    }

    return addresses as Record<ChainId, string>;
  }

  // ── Balance Aggregation ────────────────────────────────────────

  /**
   * Get balance from all chains
   */
  async getAllBalances(): Promise<WalletBalance[]> {
    const balances: WalletBalance[] = [];

    for (const wallet of this.getConnectedWallets()) {
      try {
        const balance = await wallet.getBalance();
        balances.push(balance);
      } catch {
        // Skip failed balance fetches
      }
    }

    return balances;
  }

  /**
   * Get total balance in USD across all chains
   */
  async getTotalBalanceUsd(): Promise<number> {
    const balances = await this.getAllBalances();
    let totalUsd = 0;

    for (const balance of balances) {
      const price = await this.getPrice(balance.native.symbol);
      const amount = Number(balance.native.amount) / Math.pow(10, balance.native.decimals);
      totalUsd += amount * price;

      // Add USDC if present (1:1 with USD)
      if (balance.usdc) {
        totalUsd += Number(balance.usdc.amount) / Math.pow(10, balance.usdc.decimals);
      }
    }

    return totalUsd;
  }

  // ── Fee Comparison ─────────────────────────────────────────────

  /**
   * Find the cheapest chain for a transaction
   */
  async findCheapestChain(amount: bigint): Promise<{
    chain: ChainId;
    fee: FeeEstimate;
    savings: number;
  }> {
    const estimates: { chain: ChainId; fee: FeeEstimate }[] = [];

    for (const [chain, wallet] of this.wallets) {
      if (wallet.isConnected()) {
        try {
          const address = await wallet.getAddress();
          const fee = await wallet.estimateFee(address, amount);
          estimates.push({ chain, fee });
        } catch {
          // Skip failed estimates
        }
      }
    }

    if (estimates.length === 0) {
      throw new Error('No connected wallets');
    }

    // Sort by USD fee
    estimates.sort((a, b) => a.fee.feeUsd - b.fee.feeUsd);

    const cheapest = estimates[0];
    const mostExpensive = estimates[estimates.length - 1];

    const savings = mostExpensive.fee.feeUsd > 0
      ? ((mostExpensive.fee.feeUsd - cheapest.fee.feeUsd) / mostExpensive.fee.feeUsd) * 100
      : 0;

    return {
      chain: cheapest.chain,
      fee: cheapest.fee,
      savings: Math.round(savings)
    };
  }

  /**
   * Compare fees across all chains
   */
  async compareFees(amount: bigint): Promise<{
    chain: ChainId;
    fee: FeeEstimate;
    recommended: boolean;
  }[]> {
    const estimates: { chain: ChainId; fee: FeeEstimate; recommended: boolean }[] = [];

    for (const [chain, wallet] of this.wallets) {
      if (wallet.isConnected()) {
        try {
          const address = await wallet.getAddress();
          const fee = await wallet.estimateFee(address, amount);
          estimates.push({ chain, fee, recommended: false });
        } catch {
          // Skip
        }
      }
    }

    // Sort by USD fee
    estimates.sort((a, b) => a.fee.feeUsd - b.fee.feeUsd);

    // Mark cheapest as recommended
    if (estimates.length > 0) {
      estimates[0].recommended = true;
    }

    return estimates;
  }

  // ── Payment Processing ─────────────────────────────────────────

  /**
   * Pay for content token, automatically selecting best chain
   */
  async payForContent(request: PaymentRequest): Promise<PaymentResult> {
    // Determine which chain to use
    let chain = request.preferredChain;

    if (!chain) {
      // Find cheapest chain that has sufficient balance
      const balances = await this.getAllBalances();

      for (const balance of balances) {
        const nativeAmount = Number(balance.native.amount);
        if (nativeAmount >= request.priceSats) {
          // Check if this is cheapest
          const { chain: cheapest } = await this.findCheapestChain(BigInt(request.priceSats));
          chain = cheapest;
          break;
        }
      }
    }

    if (!chain) {
      return {
        success: false,
        chain: 'bsv',
        txid: '',
        feePaid: BigInt(0),
        feeUsd: 0,
        contentToken: request.contentToken,
        amount: request.amount,
        error: 'Insufficient balance on any chain'
      };
    }

    const wallet = this.wallets.get(chain);
    if (!wallet || !wallet.isConnected()) {
      return {
        success: false,
        chain,
        txid: '',
        feePaid: BigInt(0),
        feeUsd: 0,
        contentToken: request.contentToken,
        amount: request.amount,
        error: `Wallet not connected for chain ${chain}`
      };
    }

    try {
      // Estimate fee
      const feeEstimate = await wallet.estimateFee(request.recipient, BigInt(request.priceSats));

      // Check max fee
      if (request.maxFeeSats && Number(feeEstimate.fee) > request.maxFeeSats) {
        return {
          success: false,
          chain,
          txid: '',
          feePaid: feeEstimate.fee,
          feeUsd: feeEstimate.feeUsd,
          contentToken: request.contentToken,
          amount: request.amount,
          error: `Fee ${feeEstimate.fee} exceeds max ${request.maxFeeSats}`
        };
      }

      // Send payment
      const tx = await wallet.sendNative(request.recipient, BigInt(request.priceSats));

      return {
        success: true,
        chain,
        txid: tx.txid,
        feePaid: tx.fee,
        feeUsd: feeEstimate.feeUsd,
        contentToken: request.contentToken,
        amount: request.amount
      };
    } catch (error) {
      return {
        success: false,
        chain,
        txid: '',
        feePaid: BigInt(0),
        feeUsd: 0,
        contentToken: request.contentToken,
        amount: request.amount,
        error: (error as Error).message
      };
    }
  }

  // ── Price Fetching ─────────────────────────────────────────────

  private async getPrice(symbol: string): Promise<number> {
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.price;
    }

    // Fetch from CoinGecko or similar
    const price = await this.fetchPrice(symbol);
    this.priceCache.set(symbol, { price, timestamp: Date.now() });
    return price;
  }

  private async fetchPrice(symbol: string): Promise<number> {
    // Map symbols to CoinGecko IDs
    const coinGeckoIds: Record<string, string> = {
      'BSV': 'bitcoin-cash-sv',
      'ETH': 'ethereum',
      'SOL': 'solana',
      'BTC': 'bitcoin'
    };

    const id = coinGeckoIds[symbol];
    if (!id) return 0;

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
      );
      const data = await response.json();
      return data[id]?.usd || 0;
    } catch {
      // Fallback prices
      const fallback: Record<string, number> = {
        'BSV': 50,
        'ETH': 3000,
        'SOL': 100,
        'BTC': 60000
      };
      return fallback[symbol] || 0;
    }
  }

  // ── Convenience Methods ────────────────────────────────────────

  /**
   * Get BSV wallet directly (most common)
   */
  getBSV(): BSVWallet {
    return this.wallets.get('bsv') as BSVWallet;
  }

  /**
   * Check if any wallet has sufficient balance
   */
  async hasSufficientBalance(amountSats: number): Promise<{ has: boolean; chain?: ChainId }> {
    const balances = await this.getAllBalances();

    for (const balance of balances) {
      // For BSV, compare directly in sats
      if (balance.chain === 'bsv') {
        if (Number(balance.native.amount) >= amountSats) {
          return { has: true, chain: 'bsv' };
        }
      }
      // For other chains, convert to equivalent value
      // (simplified - would need proper conversion)
    }

    return { has: false };
  }

  /**
   * Get summary for display
   */
  async getSummary(): Promise<{
    chains: ChainId[];
    totalUsd: number;
    balances: { chain: ChainId; amount: string; usd: number }[];
  }> {
    const balances = await this.getAllBalances();
    const summary: { chain: ChainId; amount: string; usd: number }[] = [];
    let totalUsd = 0;

    for (const balance of balances) {
      const price = await this.getPrice(balance.native.symbol);
      const amount = Number(balance.native.amount) / Math.pow(10, balance.native.decimals);
      const usd = amount * price;

      summary.push({
        chain: balance.chain,
        amount: balance.native.formatted,
        usd: Math.round(usd * 100) / 100
      });

      totalUsd += usd;
    }

    return {
      chains: Array.from(this.wallets.keys()),
      totalUsd: Math.round(totalUsd * 100) / 100,
      balances: summary
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────

let walletManager: MultiChainWalletManager | null = null;

export function getWalletManager(): MultiChainWalletManager {
  if (!walletManager) {
    walletManager = new MultiChainWalletManager();
  }
  return walletManager;
}
