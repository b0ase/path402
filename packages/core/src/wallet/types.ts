/**
 * $402 Multi-Chain Wallet Types
 *
 * Abstract wallet interface that works across chains.
 * BSV is primary (micropayments work), others for user adoption.
 */

// ── Core Types ─────────────────────────────────────────────────────

export type ChainId = 'bsv' | 'eth' | 'base' | 'arbitrum' | 'solana' | 'bitcoin';

export interface WalletBalance {
  chain: ChainId;
  address: string;

  // Native currency
  native: {
    symbol: string;        // 'BSV', 'ETH', 'SOL'
    amount: bigint;        // In smallest unit (satoshis, wei, lamports)
    decimals: number;
    formatted: string;     // Human readable
  };

  // Stablecoins (if applicable)
  usdc?: {
    amount: bigint;
    decimals: number;
    formatted: string;
  };

  // $402 token balance (on chains that support it)
  path402?: {
    amount: bigint;
    decimals: number;
    formatted: string;
  };
}

export interface Transaction {
  chain: ChainId;
  txid: string;
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  timestamp: number;

  // Token transfer details (if applicable)
  token?: {
    symbol: string;
    amount: bigint;
    decimals: number;
  };
}

export interface FeeEstimate {
  chain: ChainId;
  fee: bigint;
  feeUsd: number;          // For comparison across chains
  speed: 'slow' | 'normal' | 'fast';
  estimatedSeconds: number;
}

// ── Wallet Interface ───────────────────────────────────────────────

export interface ChainWallet {
  chain: ChainId;

  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Address
  getAddress(): Promise<string>;

  // Balance
  getBalance(): Promise<WalletBalance>;

  // Transactions
  sendNative(to: string, amount: bigint): Promise<Transaction>;
  sendToken(to: string, tokenAddress: string, amount: bigint): Promise<Transaction>;

  // Fee estimation
  estimateFee(to: string, amount: bigint): Promise<FeeEstimate>;

  // Transaction status
  getTransaction(txid: string): Promise<Transaction | null>;
  waitForConfirmation(txid: string, confirmations?: number): Promise<Transaction>;

  // Signing (for auth)
  signMessage(message: string): Promise<string>;
  verifyMessage(message: string, signature: string, address: string): Promise<boolean>;
}

// ── Multi-Chain Wallet Manager ─────────────────────────────────────

export interface WalletManager {
  // Get wallet for specific chain
  getWallet(chain: ChainId): ChainWallet | null;

  // Get all connected wallets
  getConnectedWallets(): ChainWallet[];

  // Get aggregated balance across all chains (in USD)
  getTotalBalanceUsd(): Promise<number>;

  // Find cheapest chain for a transaction
  findCheapestChain(amount: bigint): Promise<{
    chain: ChainId;
    fee: FeeEstimate;
    savings: number;  // % saved vs most expensive
  }>;

  // Cross-chain (future)
  // bridge(from: ChainId, to: ChainId, amount: bigint): Promise<Transaction>;
}

// ── BSV-Specific Types ─────────────────────────────────────────────

export interface BSVUtxo {
  txid: string;
  vout: number;
  satoshis: number;
  script: string;
}

export interface BSVInscription {
  txid: string;
  contentType: string;
  content: Buffer;
  origin: string;  // Original inscription point
}

export interface BSV20Token {
  tick: string;           // Token ticker (e.g., "$402")
  id: string;             // Inscription ID
  amount: bigint;
  decimals: number;
}

// ── Payment Request ────────────────────────────────────────────────

export interface PaymentRequest {
  // What we're paying for
  contentToken: string;   // e.g., "$b0ase.com/$blog/$post"
  amount: number;         // Amount of content tokens

  // Payment details
  priceSats: number;      // Price in satoshis
  priceUsd?: number;      // USD equivalent

  // Recipient
  recipient: string;      // Address or handle
  recipientChain: ChainId;

  // Options
  preferredChain?: ChainId;
  maxFeeSats?: number;
}

export interface PaymentResult {
  success: boolean;
  chain: ChainId;
  txid: string;
  feePaid: bigint;
  feeUsd: number;

  // What was acquired
  contentToken: string;
  amount: number;

  // Error if failed
  error?: string;
}
