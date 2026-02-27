/**
 * @b0ase/path402-types — Canonical type definitions for the $402 token exchange protocol
 *
 * Merged from:
 *   - b0ase.com/lib/path402/types.ts (core token, holding, transaction, dividends, voting, withdrawals)
 *   - VexVoid additions (MediaType, media fields on Dollar402Token)
 *   - kwegwong additions (MemeRecord, AccumulatorState, WongPressResult, staking/dividend fields on holdings)
 */

// ─── Enums & Unions ──────────────────────────────────────────────────────────

export type PricingModel = 'sqrt_decay' | 'fixed' | 'linear' | 'alice_bond';
export type ContentType = 'blog' | 'api' | 'membership' | 'media' | 'custom';
export type TransactionType = 'acquire' | 'transfer' | 'refund' | 'grant' | 'press';
export type MediaType = 'music' | 'video';
export type KYCStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type DistributionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type VoteStatus = 'draft' | 'active' | 'closed' | 'cancelled';
export type VoteType = 'simple' | 'weighted' | 'quadratic';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ─── Core Token Types ────────────────────────────────────────────────────────

export interface Dollar402Token {
  id: string;
  token_id: string;
  name: string;
  description: string | null;
  issuer_handle: string;
  base_price_sats: number;
  pricing_model: PricingModel;
  decay_factor: number;
  total_supply: number;
  max_supply: number | null;
  issuer_share_bps: number;
  platform_share_bps: number;
  content_type: ContentType | null;
  access_url: string | null;
  icon_url: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  // VexVoid media extensions
  media_type?: MediaType;
  media_url?: string;
  thumbnail_url?: string;
}

export interface Dollar402Holding {
  id: string;
  token_id: string;
  holder_handle: string;
  holder_user_id: string | null;
  balance: number;
  total_acquired: number;
  total_spent_sats: number;
  first_acquired_at: string;
  last_acquired_at: string | null;
  // kwegwong dividend extensions
  pending_dividends_sats?: number;
  total_dividends_paid_sats?: number;
  // kwegwong staking extensions
  staked?: boolean;
  staked_at?: string | null;
  // kwegwong cross-dividend extensions
  pending_cross_dividends?: Record<string, number>;
  total_cross_dividends_paid?: Record<string, number>;
}

export interface Dollar402Transaction {
  id: string;
  token_id: string;
  buyer_handle: string;
  seller_handle: string | null;
  amount: number;
  price_sats: number;
  unit_price_sats: number;
  issuer_revenue_sats: number | null;
  platform_revenue_sats: number | null;
  tx_type: TransactionType;
  handcash_tx_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Dollar402Serve {
  id: string;
  token_id: string;
  holder_handle: string;
  resource_path: string;
  tokens_consumed: number;
  ip_address: string | null;
  user_agent: string | null;
  served_at: string;
}

// ─── Extended Token Types ────────────────────────────────────────────────────

/** Token with rights flags (dividends, voting, serving) */
export interface Dollar402TokenExtended extends Dollar402Token {
  dollar_address: string;
  parent_token_id: string | null;
  confers_dividends: boolean;
  confers_voting: boolean;
  confers_serving: boolean;
}

/** Holding with registration and withdrawal state */
export interface Dollar402HoldingExtended extends Dollar402Holding {
  position: number | null;
  registered: boolean;
  registered_at: string | null;
  withdrawn: boolean;
  withdrawn_at: string | null;
  serving_revenue_sats: number;
}

/** Token enriched with live pricing data */
export interface TokenWithPrice extends Dollar402Token {
  current_price_sats: number;
  next_price_sats: number;
  price_for_10: number;
  price_for_100: number;
  // Alice Bond fields
  current_reward: number;
  next_reward: number;
  distributed_supply: number;
  issuer_retained: number;
}

/** Holding enriched with token metadata and current value */
export interface HoldingWithToken extends Dollar402Holding {
  token: Dollar402Token;
  current_value_sats: number;
}

/** Price schedule entry for pricing curve projections */
export interface PriceSchedule {
  supply: number;
  unit_price_sats: number;
  cumulative_cost_sats: number;
}

// ─── User & KYC ──────────────────────────────────────────────────────────────

export interface UnifiedUser {
  id: string;
  primary_handle: string;
  display_name: string | null;
  kyc_status: KYCStatus;
  kyc_submitted_at: string | null;
  kyc_verified_at: string | null;
  full_legal_name: string | null;
  nationality: string | null;
  registered: boolean;
  registered_at: string | null;
  created_at: string;
}

// ─── Dividends ───────────────────────────────────────────────────────────────

export interface DividendDistribution {
  id: string;
  token_id: string;
  total_amount_sats: number;
  total_eligible_shares: number;
  distribution_date: string;
  snapshot_taken_at: string | null;
  status: DistributionStatus;
  initiated_by: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DividendPayment {
  id: string;
  distribution_id: string;
  holding_id: string;
  user_handle: string;
  shares_at_snapshot: number;
  amount_sats: number;
  payment_status: 'pending' | 'paid' | 'failed';
  payment_tx_id: string | null;
  paid_at: string | null;
  created_at: string;
}

// ─── Voting ──────────────────────────────────────────────────────────────────

export interface Vote {
  id: string;
  token_id: string;
  title: string;
  description: string | null;
  vote_type: VoteType;
  options: string[];
  status: VoteStatus;
  starts_at: string;
  ends_at: string;
  min_tokens_to_vote: number;
  snapshot_taken_at: string | null;
  created_by: string;
  created_at: string;
}

export interface VoteBallot {
  id: string;
  vote_id: string;
  user_handle: string;
  holding_id: string;
  selected_option: number;
  vote_weight: number;
  cast_at: string;
}

export interface VoteResults {
  vote: Vote;
  results: {
    option: string;
    votes: number;
    weight: number;
    percentage: number;
  }[];
  totalVotes: number;
  totalWeight: number;
  participation: number;
}

// ─── Withdrawals & Transfers ─────────────────────────────────────────────────

export interface Withdrawal {
  id: string;
  holding_id: string;
  user_handle: string;
  token_id: string;
  quantity: number;
  destination_address: string;
  chain: 'bsv' | 'eth' | 'sol';
  status: WithdrawalStatus;
  on_chain_tx_id: string | null;
  fee_sats: number;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
}

export interface TransferRecord {
  id: string;
  holding_id: string;
  from_handle: string;
  to_handle: string;
  token_id: string;
  quantity: number;
  status: 'pending' | 'completed' | 'rejected';
  requires_re_registration: boolean;
  on_chain_tx_id: string | null;
  requested_at: string;
  completed_at: string | null;
}

// ─── Registry ────────────────────────────────────────────────────────────────

export interface RegistryEntry {
  member: string;
  token: string;
  tokenName: string;
  position: number | null;
  quantity: number;
  acquiredAt: string;
  dividendsReceived: number;
  servingRevenue: number;
  rights: {
    dividends: boolean;
    voting: boolean;
  };
}

// ─── kwegwong: Meme/Press Types ──────────────────────────────────────────────

export interface MemeRecord {
  id: string;
  owner_handle: string;
  prompt: string;
  image_url: string | null;
  inscription_txid: string | null;
  ordinal_id: string | null;
  press_number: number;
  is_video: boolean;
  video_url: string | null;
  adventure_id: string | null;
  handcash_tx_id: string | null;
  wong_earned: number;
  created_at: string;
}

export interface AccumulatorState {
  id: string;
  press_count: number;
  threshold: number;
  last_video_at: string | null;
  current_prompt_seed: string | null;
}

export interface WongPressResult {
  transaction: Dollar402Transaction;
  wongEarned: number;
  memeUrl: string | null;
  memeId: string;
  videoProgress: { current: number; threshold: number };
  videoTriggered: boolean;
  handcashTxId: string;
}

// ─── API Request Types ───────────────────────────────────────────────────────

export interface CreateTokenRequest {
  token_id: string;
  name: string;
  description?: string;
  base_price_sats?: number;
  pricing_model?: PricingModel;
  decay_factor?: number;
  max_supply?: number;
  issuer_share_bps?: number;
  platform_share_bps?: number;
  content_type?: ContentType;
  access_url?: string;
  icon_url?: string;
}

export interface AcquireTokenRequest {
  amount: number;
  payment_tx_id?: string;
}

export interface ServeRequest {
  token_id: string;
  resource_path: string;
  tokens_consumed?: number;
}

export interface DistributeDividendRequest {
  total_amount_sats: number;
  notes?: string;
}

export interface CreateVoteRequest {
  title: string;
  description?: string;
  options: string[];
  vote_type?: VoteType;
  starts_at?: string;
  ends_at: string;
  min_tokens_to_vote?: number;
}

export interface CastVoteRequest {
  selected_option: number;
}

export interface WithdrawRequest {
  quantity: number;
  destination_address: string;
  chain: 'bsv' | 'eth' | 'sol';
}

export interface TransferRequest {
  to_handle: string;
  quantity: number;
}

export interface RegisterHoldingRequest {
  full_legal_name: string;
  nationality: string;
  document_type: string;
  document_ref?: string;
}

// ─── $401 Identity Strength ─────────────────────────────────────────────────

export { calculateStrength, STRAND_POINTS } from './strand-strength';
export type { StrengthLevel, StrengthScore } from './strand-strength';
