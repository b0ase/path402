/**
 * $402 Protocol Types
 * 
 * Core type definitions for the $402 tokenised content protocol.
 * $402 extends HTTP 402 (Payment Required) with token economics,
 * serving rights, and dynamic pricing.
 */

// ── Pricing Models ──────────────────────────────────────────────

export enum PricingModel {
  FIXED = "fixed",
  SQRT_DECAY = "sqrt_decay",
  LOG_DECAY = "log_decay",
  LINEAR_FLOOR = "linear_floor"
}

export interface PricingRules {
  model: PricingModel;
  basePrice: number;       // in satoshis
  floor?: number;          // minimum price (satoshis)
  decayRate?: number;      // for linear decay
  currency: string;        // e.g. "BSV", "SAT"
}

// ── Revenue Distribution ────────────────────────────────────────

export enum RevenueModel {
  FIXED_ISSUER = "fixed_issuer",
  EQUAL_SPLIT = "equal_split",
  DECAYING_ISSUER = "decaying_issuer"
}

export interface RevenueRules {
  model: RevenueModel;
  issuerShare: number;     // 0.0 to 1.0
  issuerFloor?: number;    // minimum issuer share for decaying model
  decayRate?: number;      // for decaying issuer model
}

// ── Token ───────────────────────────────────────────────────────

export interface Dollar402Token {
  id: string;                    // unique token ID
  dollarAddress: string;         // the $address this token grants access to
  acquiredAt: string;            // ISO timestamp
  pricePaid: number;             // satoshis paid
  supply: number;                // supply at time of purchase (position in queue)
  servingRights: boolean;        // whether holder can serve this content
  issuer: string;                // creator's payment address
}

// ── $402 Response (what a server returns on 402) ────────────────

export interface Dollar402Response {
  protocol: "$402";
  version: "0.1.0";
  dollarAddress: string;         // e.g. "$b0ase.com/$blog/$my-post"
  pricing: PricingRules;
  revenue: RevenueRules;
  currentSupply: number;         // tokens already issued
  currentPrice: number;          // price for the next buyer (satoshis)
  paymentAddress: string;        // where to send payment (e.g. HandCash handle)
  contentType?: string;          // MIME type of gated content
  contentPreview?: string;       // optional teaser
  children?: string[];           // nested $addresses below this one
}

// ── Wallet State ────────────────────────────────────────────────

export interface WalletState {
  tokens: Dollar402Token[];
  balance: number;               // available satoshis
  totalSpent: number;
  totalEarned: number;
}

// ── Discovery Result ────────────────────────────────────────────

export interface DiscoveryResult {
  [key: string]: unknown;
  dollarAddress: string;
  protocol: string;
  currentPrice: number;
  currentSupply: number;
  pricing: PricingRules;
  revenue: RevenueRules;
  children: string[];
  alreadyOwned: boolean;
  contentPreview?: string;
}

// ── Acquisition Result ──────────────────────────────────────────

export interface AcquisitionResult {
  [key: string]: unknown;
  success: boolean;
  token?: Dollar402Token;
  content?: string;
  error?: string;
  totalCost: number;
  newBalance: number;
}

// ── Serving Result ──────────────────────────────────────────────

export interface ServingResult {
  dollarAddress: string;
  served: boolean;
  revenueEarned: number;
  error?: string;
}

// ── Budget Decision ─────────────────────────────────────────────

export interface BudgetDecision {
  [key: string]: unknown;
  dollarAddress: string;
  currentPrice: number;
  withinBudget: boolean;
  budgetRemaining: number;
  expectedROI?: number;
  recommendation: "acquire" | "skip" | "insufficient_funds";
  reasoning: string;
}

// ── Serve Event ────────────────────────────────────────────────

export interface ServeEvent {
  id: string;
  dollarAddress: string;
  tokenId: string;
  requester?: string;
  revenueEarned: number;
  servedAt: string;
}

// ── Economics Analysis ─────────────────────────────────────────

export interface EconomicsAnalysis {
  dollarAddress: string;
  currentSupply: number;
  currentPrice: number;
  projectedSupply: number;
  buyerPosition: number;
  pricePaid: number;
  breakeven: {
    buyersNeeded: number;
    supplyAtBreakeven: number;
    probability: string;
  };
  roi: {
    atProjectedSupply: number;
    at2xSupply: number;
    at10xSupply: number;
  };
  revenueProjection: {
    grossRevenue: number;
    issuerRevenue: number;
    networkRevenue: number;
    yourShare: number;
  };
  mathExplanation: string;
}

// ── Batch Discovery Result ─────────────────────────────────────

export interface BatchDiscoveryResult {
  successful: Array<{
    url: string;
    dollarAddress: string;
    currentPrice: number;
    currentSupply: number;
    alreadyOwned: boolean;
  }>;
  failed: Array<{
    url: string;
    error: string;
  }>;
}
