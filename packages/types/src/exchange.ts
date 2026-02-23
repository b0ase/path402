/**
 * @b0ase/path402-types/exchange — Order book exchange system types
 *
 * Merged from b0ase.com/lib/exchange/types.ts
 */

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'partial' | 'filled' | 'cancelled';
export type SettlementType = 'offchain' | 'onchain' | 'pending';

export interface ExchangeOrder {
  id: string;
  user_id: string;
  user_handle?: string | null;
  token_id: string;
  token_symbol: string;
  side: OrderSide;
  amount: number;
  price_sats: number;
  filled_amount: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
}

export interface ExchangeTrade {
  id: string;
  buy_order_id: string | null;
  sell_order_id: string | null;
  token_id: string;
  token_symbol: string;
  amount: number;
  price_sats: number;
  total_sats: number;
  buyer_id: string;
  buyer_handle?: string | null;
  seller_id: string;
  seller_handle?: string | null;
  tx_hash?: string | null;
  executed_at: string;
  settled_at?: string | null;
  settlement_type: SettlementType;
}

export interface ClearingBalance {
  id: string;
  user_id: string;
  user_handle?: string | null;
  available_sats: number;
  locked_sats: number;
  total_deposited: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

export interface TokenBalance {
  id: string;
  user_id: string;
  user_handle?: string | null;
  token_id: string;
  token_symbol: string;
  available_amount: number;
  locked_amount: number;
  created_at: string;
  updated_at: string;
}

export interface OrderMatch {
  buyOrder: ExchangeOrder;
  sellOrder: ExchangeOrder;
  matchAmount: number;
  matchPrice: number;
}

export interface MatchResult {
  success: boolean;
  matches: OrderMatch[];
  tradesExecuted: ExchangeTrade[];
  errors: string[];
}

export interface CreateOrderInput {
  user_id: string;
  user_handle?: string;
  token_id: string;
  token_symbol: string;
  side: OrderSide;
  amount: number;
  price_sats: number;
  expires_at?: string;
}

export interface OrderBookEntry {
  price_sats: number;
  total_amount: number;
  order_count: number;
}

export interface OrderBook {
  token_id: string;
  token_symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number | null;
  last_trade_price?: number;
  last_updated: string;
}
