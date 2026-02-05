/**
 * Database Service
 *
 * Connects to Supabase (self-hosted on Hetzner) to read real $402 token data.
 * Used by both pathd daemon and MCP server.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database types
export interface Treasury {
  id: string;
  address: string;
  balance: number;
  total_sold: number;
  total_revenue_sats: number;
  updated_at: string;
}

export interface Holder {
  id: string;
  address: string | null;
  ordinals_address: string | null;
  handle: string | null;
  provider: 'handcash' | 'yours';
  balance: number;
  staked_balance: number;
  total_purchased: number;
  total_withdrawn: number;
  total_dividends: number;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  holder_id: string | null;
  to_address: string;
  amount: number;
  tx_id: string;
  status: string;
  created_at: string;
}

export interface Purchase {
  id: string;
  holder_id: string;
  amount: number;
  price_sats: number;
  unit_price_sats: number;
  supply_at_purchase: number;
  payment_id: string | null;
  status: string;
  created_at: string;
}

export interface TokenStats {
  treasuryAddress: string;
  treasuryBalance: number;
  totalSold: number;
  totalRevenueSats: number;
  circulatingSupply: number;
  totalSupply: number;
  holderCount: number;
  currentPriceSats: number;
}

// Singleton client
let supabase: SupabaseClient | null = null;

/**
 * Initialize database connection
 */
export function initDatabase(url?: string, key?: string): SupabaseClient {
  if (supabase) return supabase;

  const supabaseUrl = url || process.env.SUPABASE_URL || 'http://localhost:8000';
  const supabaseKey = key || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseKey) {
    console.warn('[Database] No Supabase key provided - using anonymous access');
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

/**
 * Get database client (initializes if needed)
 */
export function getDatabase(): SupabaseClient {
  if (!supabase) {
    return initDatabase();
  }
  return supabase;
}

/**
 * Get treasury stats
 */
export async function getTreasury(): Promise<Treasury | null> {
  const db = getDatabase();
  const { data, error } = await db
    .from('path402_treasury')
    .select('*')
    .single();

  if (error) {
    console.error('[Database] Failed to fetch treasury:', error.message);
    return null;
  }

  return data;
}

/**
 * Get all holders with balance > 0
 */
export async function getHolders(): Promise<Holder[]> {
  const db = getDatabase();
  const { data, error } = await db
    .from('path402_holders')
    .select('*')
    .gt('balance', 0)
    .order('balance', { ascending: false });

  if (error) {
    console.error('[Database] Failed to fetch holders:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get holder by address or handle
 */
export async function getHolder(addressOrHandle: string): Promise<Holder | null> {
  const db = getDatabase();

  // Try by address first
  let { data, error } = await db
    .from('path402_holders')
    .select('*')
    .or(`address.eq.${addressOrHandle},ordinals_address.eq.${addressOrHandle},handle.ilike.${addressOrHandle}`)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get holder's token balance
 */
export async function getHolderBalance(addressOrHandle: string): Promise<number> {
  const holder = await getHolder(addressOrHandle);
  return holder?.balance || 0;
}

/**
 * Check if address holds tokens
 */
export async function hasTokens(addressOrHandle: string, minBalance: number = 1): Promise<boolean> {
  const balance = await getHolderBalance(addressOrHandle);
  return balance >= minBalance;
}

/**
 * Get recent transfers
 */
export async function getRecentTransfers(limit: number = 20): Promise<Transfer[]> {
  const db = getDatabase();
  const { data, error } = await db
    .from('path402_transfers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Database] Failed to fetch transfers:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get full token stats
 */
export async function getTokenStats(): Promise<TokenStats | null> {
  const treasury = await getTreasury();
  if (!treasury) return null;

  const holders = await getHolders();
  const totalSupply = 1_000_000_000; // 1 billion total supply
  const circulatingSupply = treasury.total_sold;

  // Calculate current price using sqrt_decay
  // price = basePrice / sqrt(supply + 1)
  const basePrice = 500; // 500 sats base price
  const currentPriceSats = Math.ceil(basePrice / Math.sqrt(circulatingSupply + 1));

  return {
    treasuryAddress: treasury.address,
    treasuryBalance: treasury.balance,
    totalSold: treasury.total_sold,
    totalRevenueSats: treasury.total_revenue_sats,
    circulatingSupply,
    totalSupply,
    holderCount: holders.length,
    currentPriceSats,
  };
}

/**
 * Verify token ownership for a given address
 * Returns the holder record if they have tokens, null otherwise
 */
export async function verifyTokenOwnership(address: string): Promise<Holder | null> {
  const holder = await getHolder(address);
  if (holder && holder.balance > 0) {
    return holder;
  }
  return null;
}

/**
 * Get purchases for a holder
 */
export async function getHolderPurchases(holderId: string): Promise<Purchase[]> {
  const db = getDatabase();
  const { data, error } = await db
    .from('path402_purchases')
    .select('*')
    .eq('holder_id', holderId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Database] Failed to fetch purchases:', error.message);
    return [];
  }

  return data || [];
}

// ── Divvy Integration ───────────────────────────────────────────

/**
 * Record an incoming payment for dividend distribution
 * Called when a payment is received for any tokenized asset
 */
export async function recordDivvyPayment(
  assetIdentifier: string,
  txId: string,
  amountSats: number,
  payerInfo?: { handle?: string; address?: string }
): Promise<boolean> {
  const db = getDatabase();

  try {
    // First, get the asset ID from divvy_assets
    const { data: asset, error: assetError } = await db
      .from('divvy_assets')
      .select('id')
      .eq('identifier', assetIdentifier)
      .single();

    if (assetError || !asset) {
      console.warn(`[Divvy] Asset not found for identifier: ${assetIdentifier}`);
      return false;
    }

    // Insert payment record
    const { error: insertError } = await db
      .from('divvy_payments')
      .insert({
        asset_id: asset.id,
        tx_id: txId,
        amount_sats: amountSats,
        payer_handle: payerInfo?.handle,
        payer_address: payerInfo?.address,
        status: 'pending',
        payment_type: 'revenue',
        received_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[Divvy] Failed to record payment:', insertError.message);
      return false;
    }

    console.log(`[Divvy] Recorded payment: ${amountSats} sats for ${assetIdentifier}`);
    return true;
  } catch (e) {
    console.error('[Divvy] Error recording payment:', e);
    return false;
  }
}

/**
 * Get or create a divvy asset from a domain/path
 * Ensures the asset exists in divvy_assets for dividend distribution
 */
export async function ensureDivvyAsset(
  identifier: string,
  assetType: 'domain' | 'path' | 'handle',
  ownerAddress?: string
): Promise<string | null> {
  const db = getDatabase();

  try {
    // Check if already exists
    const { data: existing } = await db
      .from('divvy_assets')
      .select('id')
      .eq('identifier', identifier)
      .single();

    if (existing) {
      return existing.id;
    }

    // Create new asset
    const symbol = identifier.startsWith('$') ? identifier : `$${identifier}`;
    const { data: newAsset, error } = await db
      .from('divvy_assets')
      .insert({
        asset_type: assetType,
        identifier,
        symbol,
        issuer_address: ownerAddress,
        receive_address: ownerAddress,
        verification_status: 'pending',
        verification_method: assetType === 'domain' ? 'dns' : assetType === 'path' ? 'path402' : 'handcash',
      })
      .select()
      .single();

    if (error) {
      console.error('[Divvy] Failed to create asset:', error.message);
      return null;
    }

    console.log(`[Divvy] Created asset: ${identifier} (${assetType})`);
    return newAsset.id;
  } catch (e) {
    console.error('[Divvy] Error ensuring asset:', e);
    return null;
  }
}

