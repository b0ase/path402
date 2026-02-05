import {
  Dollar402Token,
  WalletState,
  Dollar402Response,
  BudgetDecision,
  ServeEvent
} from "../types.js";
import { calculatePrice, estimateROI } from "./pricing.js";
import {
  DEFAULT_MAX_PRICE_PER_ITEM,
  DEFAULT_SESSION_BUDGET
} from "../constants.js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bsv = require('bsv');

// Session state (in production: persistent store + wallet integration)
let walletState: WalletState = {
  tokens: [],
  balance: DEFAULT_SESSION_BUDGET,
  totalSpent: 0,
  totalEarned: 0
};

let privateKey: any = null;
let publicKey: any = null;
let bsvAddress: any = null;

/**
 * Initialize the node identity from a private key
 */
export function initIdentity(wif?: string): void {
  if (wif) {
    try {
      privateKey = bsv.PrivKey.fromWif(wif);
      publicKey = bsv.PubKey.fromPrivKey(privateKey);
      bsvAddress = bsv.Address.fromPubKey(publicKey);
      console.log(`[Wallet] Identity initialized: ${bsvAddress.toString()}`);
    } catch (err) {
      console.error(`[Wallet] Invalid WIF provided: ${err}`);
      generateNewIdentity();
    }
  } else {
    generateNewIdentity();
  }
}

function generateNewIdentity(): void {
  privateKey = bsv.PrivKey.fromRandom();
  publicKey = bsv.PubKey.fromPrivKey(privateKey);
  bsvAddress = bsv.Address.fromPubKey(publicKey);
  console.log(`[Wallet] Generated new ephemeral identity: ${bsvAddress.toString()}`);
}

/**
 * Get the node's public key
 */
export function getPublicKey(): string {
  return publicKey?.toString() || '';
}

/**
 * Get the node's BSV address
 */
export function getAddress(): string {
  return bsvAddress?.toString() || '';
}

/**
 * Sign a message/data as a "stamp"
 */
export function signStamp(data: string): string {
  if (!privateKey) throw new Error("Identity not initialized");

  const hash = bsv.Hash.sha256(Buffer.from(data));
  const sig = bsv.Ecdsa.sign(hash, privateKey);
  return sig.toString();
}

/**
 * Verify a stamp signature
 */
export function verifyStamp(data: string, signature: string, pubkeyStr: string): boolean {
  try {
    const hash = bsv.Hash.sha256(Buffer.from(data));
    const sig = bsv.Sig.fromString(signature);
    const pubkey = bsv.PubKey.fromString(pubkeyStr);
    return bsv.Ecdsa.verify(hash, sig, pubkey);
  } catch (err) {
    return false;
  }
}

/**
 * Get current wallet state
 */
export function getWallet(): WalletState {
  return { ...walletState };
}

/**
 * Set wallet balance (for initialisation or top-up)
 */
export function setBalance(satoshis: number): void {
  walletState.balance = satoshis;
}

/**
 * Check if agent already holds a token for a given $address
 */
export function hasToken(dollarAddress: string): boolean {
  return walletState.tokens.some(t => t.dollarAddress === dollarAddress);
}

/**
 * Get a specific token by $address
 */
export function getToken(dollarAddress: string): Dollar402Token | undefined {
  return walletState.tokens.find(t => t.dollarAddress === dollarAddress);
}

/**
 * Evaluate whether to acquire a token based on price and budget
 */
export function evaluateBudget(
  response: Dollar402Response,
  maxPricePerItem: number = DEFAULT_MAX_PRICE_PER_ITEM
): BudgetDecision {
  const { dollarAddress, currentPrice, currentSupply, pricing, revenue } = response;

  // Already own it
  if (hasToken(dollarAddress)) {
    return {
      dollarAddress,
      currentPrice,
      withinBudget: true,
      budgetRemaining: walletState.balance,
      recommendation: "skip",
      reasoning: "Already hold a token for this $address"
    };
  }

  // Can't afford it
  if (currentPrice > walletState.balance) {
    return {
      dollarAddress,
      currentPrice,
      withinBudget: false,
      budgetRemaining: walletState.balance,
      recommendation: "insufficient_funds",
      reasoning: `Price ${currentPrice} SAT exceeds balance ${walletState.balance} SAT`
    };
  }

  // Over per-item budget
  if (currentPrice > maxPricePerItem) {
    return {
      dollarAddress,
      currentPrice,
      withinBudget: false,
      budgetRemaining: walletState.balance,
      recommendation: "skip",
      reasoning: `Price ${currentPrice} SAT exceeds per-item limit ${maxPricePerItem} SAT`
    };
  }

  // Estimate ROI (assume 10x current supply as eventual total)
  const estimatedTotal = Math.max(currentSupply * 10, 100);
  const roi = estimateROI(
    pricing,
    revenue,
    currentSupply + 1,
    estimatedTotal
  );

  return {
    dollarAddress,
    currentPrice,
    withinBudget: true,
    budgetRemaining: walletState.balance - currentPrice,
    expectedROI: Math.round(roi * 100),
    recommendation: "acquire",
    reasoning: `Price ${currentPrice} SAT within budget. Estimated ROI: ${Math.round(roi * 100)}% at ${estimatedTotal} total supply.`
  };
}

/**
 * Record a token acquisition (debit balance, store token)
 */
export function recordAcquisition(
  dollarAddress: string,
  price: number,
  supply: number,
  issuer: string
): Dollar402Token {
  const token: Dollar402Token = {
    id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dollarAddress,
    acquiredAt: new Date().toISOString(),
    pricePaid: price,
    supply,
    servingRights: true,
    issuer
  };

  walletState.tokens.push(token);
  walletState.balance -= price;
  walletState.totalSpent += price;

  return token;
}

/**
 * Record serving revenue (credit balance)
 */
export function recordServingRevenue(amount: number): void {
  walletState.balance += amount;
  walletState.totalEarned += amount;
}

/**
 * Get all tokens the agent can serve
 */
export function getServableTokens(): Dollar402Token[] {
  return walletState.tokens.filter(t => t.servingRights);
}

/**
 * Get portfolio summary
 */
export function getPortfolioSummary(): {
  totalTokens: number;
  totalSpent: number;
  totalEarned: number;
  netPosition: number;
  balance: number;
  tokens: Array<{
    dollarAddress: string;
    pricePaid: number;
    acquiredAt: string;
  }>;
} {
  return {
    totalTokens: walletState.tokens.length,
    totalSpent: walletState.totalSpent,
    totalEarned: walletState.totalEarned,
    netPosition: walletState.totalEarned - walletState.totalSpent,
    balance: walletState.balance,
    tokens: walletState.tokens.map(t => ({
      dollarAddress: t.dollarAddress,
      pricePaid: t.pricePaid,
      acquiredAt: t.acquiredAt
    }))
  };
}

/**
 * Reset wallet (for testing)
 */
export function resetWallet(initialBalance: number = DEFAULT_SESSION_BUDGET): void {
  walletState = {
    tokens: [],
    balance: initialBalance,
    totalSpent: 0,
    totalEarned: 0
  };
  serveHistory = [];
}

// Serve event history
let serveHistory: ServeEvent[] = [];

/**
 * Record a serve event (agent served content, earned revenue)
 */
export function recordServe(
  dollarAddress: string,
  tokenId: string,
  revenue: number,
  requester?: string
): ServeEvent {
  const event: ServeEvent = {
    id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dollarAddress,
    tokenId,
    requester,
    revenueEarned: revenue,
    servedAt: new Date().toISOString()
  };

  serveHistory.push(event);
  walletState.balance += revenue;
  walletState.totalEarned += revenue;

  return event;
}

/**
 * Get serve history for a token
 */
export function getServeHistory(dollarAddress?: string): ServeEvent[] {
  if (dollarAddress) {
    return serveHistory.filter(s => s.dollarAddress === dollarAddress);
  }
  return [...serveHistory];
}

/**
 * Get total serves and revenue by token
 */
export function getServeStats(): Array<{
  dollarAddress: string;
  serveCount: number;
  totalRevenue: number;
}> {
  const stats = new Map<string, { count: number; revenue: number }>();

  for (const event of serveHistory) {
    const existing = stats.get(event.dollarAddress) || { count: 0, revenue: 0 };
    existing.count++;
    existing.revenue += event.revenueEarned;
    stats.set(event.dollarAddress, existing);
  }

  return Array.from(stats.entries()).map(([dollarAddress, data]) => ({
    dollarAddress,
    serveCount: data.count,
    totalRevenue: data.revenue
  }));
}
