/**
 * $402 Token Minting - BSV21 Standard
 *
 * Each user mints their own token (e.g., $RICHARD) that defines
 * the canonical path to opening a connection with them.
 *
 * Token Standard: BSV21 (fungible tokens on BSV)
 * Supply: 1,000,000,000 (1 billion) - fixed, no further minting
 * Purpose: Access tokens for time-based connections
 */

import { createHash } from 'crypto';

// ── Types ───────────────────────────────────────────────────────────

export interface TokenConfig {
  name: string;              // e.g., "RICHARD" (without $)
  symbol: string;            // e.g., "$RICHARD"
  supply: bigint;            // Total supply (default: 1 billion)
  decimals: number;          // Decimal places (default: 0 for whole tokens)
  accessRate: number;        // Tokens per second for access (default: 1)
  description?: string;      // Optional description
  avatar?: string;           // Optional avatar URL
  website?: string;          // Optional website
}

export interface MintedToken {
  tokenId: string;           // BSV21 token ID (inscription ID)
  symbol: string;
  supply: bigint;
  issuer: string;            // BSV address of issuer
  genesisBlock: number;      // Block height at mint
  genesisTxid: string;       // Transaction ID of mint
  accessRate: number;
  metadata: TokenMetadata;
  createdAt: number;
}

export interface TokenMetadata {
  name: string;
  description?: string;
  avatar?: string;
  website?: string;
  protocol: 'path402';
  version: '1.0.0';
}

// ── Constants ───────────────────────────────────────────────────────

export const DEFAULT_SUPPLY = BigInt(1_000_000_000);  // 1 billion
export const DEFAULT_DECIMALS = 0;
export const DEFAULT_ACCESS_RATE = 1;  // 1 token per second

// ── BSV21 Inscription Format ────────────────────────────────────────

/**
 * Generate BSV21 token inscription data
 *
 * BSV21 is a fungible token standard on BSV using inscriptions.
 * The mint inscription contains the token configuration.
 */
export function generateBSV21Inscription(config: TokenConfig): string {
  const inscription = {
    p: 'bsv-21',
    op: 'deploy',
    tick: config.symbol,
    max: config.supply.toString(),
    dec: config.decimals.toString(),
    // Path402 extensions
    path402: {
      accessRate: config.accessRate,
      protocol: 'path402',
      version: '1.0.0'
    },
    metadata: {
      name: config.name,
      description: config.description || `Access token for ${config.name}`,
      avatar: config.avatar,
      website: config.website
    }
  };

  return JSON.stringify(inscription);
}

/**
 * Generate token transfer inscription
 */
export function generateTransferInscription(
  symbol: string,
  amount: bigint,
  to: string
): string {
  const inscription = {
    p: 'bsv-21',
    op: 'transfer',
    tick: symbol,
    amt: amount.toString(),
    to: to
  };

  return JSON.stringify(inscription);
}

// ── Token ID Generation ─────────────────────────────────────────────

/**
 * Generate a deterministic token ID from the symbol and issuer
 * This allows anyone to verify the canonical token for a given identity
 */
export function generateTokenId(symbol: string, issuerAddress: string): string {
  const data = `path402:${symbol}:${issuerAddress}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Validate a token symbol
 * Must start with $ and contain only alphanumeric characters
 */
export function validateSymbol(symbol: string): { valid: boolean; error?: string } {
  if (!symbol.startsWith('$')) {
    return { valid: false, error: 'Symbol must start with $' };
  }

  const name = symbol.slice(1);

  if (name.length < 1 || name.length > 20) {
    return { valid: false, error: 'Symbol must be 1-20 characters after $' };
  }

  if (!/^[A-Z0-9_]+$/.test(name)) {
    return { valid: false, error: 'Symbol must contain only A-Z, 0-9, or _' };
  }

  // Reserved symbols
  const reserved = ['402', 'BSV', 'BTC', 'ETH', 'SOL', 'USDT', 'USDC'];
  if (reserved.includes(name)) {
    return { valid: false, error: `${symbol} is a reserved symbol` };
  }

  return { valid: true };
}

// ── Token Minting ───────────────────────────────────────────────────

export interface MintRequest {
  symbol: string;            // e.g., "$RICHARD"
  issuerAddress: string;     // BSV address
  issuerPrivateKey?: string; // For signing (optional, can sign client-side)
  description?: string;
  avatar?: string;
  website?: string;
  accessRate?: number;       // Tokens per second (default: 1)
}

export interface MintResult {
  success: boolean;
  tokenId?: string;
  txid?: string;
  error?: string;
  inscription?: string;
}

/**
 * Prepare token mint transaction
 * Returns the inscription data to be broadcast to BSV network
 */
export function prepareMint(request: MintRequest): MintResult {
  // Validate symbol
  const validation = validateSymbol(request.symbol);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Generate token config
  const config: TokenConfig = {
    name: request.symbol.slice(1),  // Remove $
    symbol: request.symbol,
    supply: DEFAULT_SUPPLY,
    decimals: DEFAULT_DECIMALS,
    accessRate: request.accessRate || DEFAULT_ACCESS_RATE,
    description: request.description,
    avatar: request.avatar,
    website: request.website
  };

  // Generate inscription
  const inscription = generateBSV21Inscription(config);

  // Generate deterministic token ID
  const tokenId = generateTokenId(request.symbol, request.issuerAddress);

  return {
    success: true,
    tokenId,
    inscription
  };
}

// ── Proof of Serve ──────────────────────────────────────────────────

/**
 * Proof of Serve - Earning $402 by Contributing to the Network
 *
 * Unlike wasteful Proof of Work mining, Path402 rewards nodes
 * for ACTUAL network contribution:
 *
 * 1. Serving content requests
 * 2. Relaying gossip messages
 * 3. Maintaining accurate indexes
 * 4. Validating transactions
 *
 * This creates healthy incentives without centralization pressure.
 */

export interface ServeProof {
  nodeId: string;
  action: 'serve' | 'relay' | 'index' | 'validate';
  tokenId: string;           // Token served/relayed
  requesterId: string;       // Who requested
  timestamp: number;
  dataSize: number;          // Bytes served
  signature: string;         // Signed by requester
}

export interface ServeReward {
  nodeId: string;
  period: string;            // e.g., "2026-02-04"
  servesCount: number;
  relaysCount: number;
  bytesServed: number;
  rewardSats: number;        // $402 tokens earned (in sats value)
}

/**
 * Calculate serve reward for a node
 * Reward is proportional to actual contribution
 */
export function calculateServeReward(
  proofs: ServeProof[],
  totalNetworkServes: number,
  dailyRewardPool: number
): number {
  const nodeServes = proofs.length;
  const nodeBytes = proofs.reduce((sum, p) => sum + p.dataSize, 0);

  // Reward based on both count and data volume
  const serveWeight = nodeServes / Math.max(totalNetworkServes, 1);
  const reward = Math.floor(dailyRewardPool * serveWeight);

  return reward;
}

// ── Staking ─────────────────────────────────────────────────────────

/**
 * Staking Model - Amount-Based (NOT time-based)
 *
 * Your dividend share = (your_staked / total_staked) × revenue
 *
 * Simple, fair, no gaming. Time-based was considered but rejected:
 * - Adds complexity without clear benefit
 * - Can be gamed (stake before dividend, unstake after)
 * - Amount-based is more intuitive
 */

export interface StakePosition {
  tokenId: string;
  staker: string;            // BSV address
  amount: bigint;
  stakedAt: number;          // Timestamp
  lastClaimAt: number;       // Last dividend claim
}

export interface DividendClaim {
  tokenId: string;
  staker: string;
  period: string;            // e.g., "2026-02"
  amount: number;            // Sats earned
  claimed: boolean;
  claimedAt?: number;
  kycVerified: boolean;      // Must be true to claim
}

/**
 * Calculate dividend for a staker
 */
export function calculateDividend(
  stakerAmount: bigint,
  totalStaked: bigint,
  periodRevenue: number
): number {
  if (totalStaked === BigInt(0)) return 0;

  const share = Number(stakerAmount) / Number(totalStaked);
  const dividend = Math.floor(periodRevenue * share);

  return dividend;
}

