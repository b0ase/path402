/**
 * Multi-Chain Wallet Manager — Implementation moved to private repo for security.
 * Only the type stub remains here for compilation.
 */

import { WalletManager, ChainWallet, ChainId, FeeEstimate } from './types.js';

const MOVED = 'MultiChainWalletManager implementation moved to private repo (Claw-Miner-App)';

export class MultiChainWalletManager implements WalletManager {
  getWallet(_chain: ChainId): ChainWallet | null { throw new Error(MOVED); }
  getConnectedWallets(): ChainWallet[] { throw new Error(MOVED); }
  getTotalBalanceUsd(): Promise<number> { throw new Error(MOVED); }
  findCheapestChain(_amount: bigint): Promise<{ chain: ChainId; fee: FeeEstimate; savings: number }> { throw new Error(MOVED); }
}

export function getWalletManager(): MultiChainWalletManager {
  throw new Error(MOVED);
}

export function useMetanetWallet(): void {
  throw new Error(MOVED);
}
