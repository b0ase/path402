-- $402 ClawMiner - Local SQLite Schema
-- Ported from path402/packages/core/src/db/schema.sql
-- Each node maintains its own database, synced via gossip

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ══════════════════════════════════════════════════════════════════
-- TOKENS - Registry of discovered tokens
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tokens (
  token_id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  issuer_address TEXT,
  issuer_handle TEXT,

  -- Pricing
  base_price_sats INTEGER NOT NULL DEFAULT 500,
  pricing_model TEXT NOT NULL DEFAULT 'alice_bond',
  decay_factor REAL DEFAULT 1.0,

  -- Supply
  current_supply INTEGER NOT NULL DEFAULT 0,
  max_supply INTEGER,

  -- Revenue split (basis points)
  issuer_share_bps INTEGER DEFAULT 7000,
  network_share_bps INTEGER DEFAULT 3000,

  -- Content info
  content_type TEXT,
  content_preview TEXT,
  access_url TEXT,

  -- Metadata
  discovered_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_verified_at INTEGER,
  last_gossip_at INTEGER,
  verification_status TEXT DEFAULT 'unverified',

  -- Source tracking
  discovered_via TEXT,
  gossip_peer_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_tokens_issuer ON tokens(issuer_address);
CREATE INDEX IF NOT EXISTS idx_tokens_verified ON tokens(verification_status);
CREATE INDEX IF NOT EXISTS idx_tokens_supply ON tokens(current_supply);

-- ══════════════════════════════════════════════════════════════════
-- HOLDINGS - My token positions
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  -- Position
  balance INTEGER NOT NULL DEFAULT 0,
  avg_cost_sats INTEGER,
  total_spent_sats INTEGER DEFAULT 0,

  -- Acquisition tracking
  first_acquired_at INTEGER,
  last_acquired_at INTEGER,
  acquisition_supply INTEGER,

  -- Serving
  can_serve BOOLEAN DEFAULT 1,
  total_serves INTEGER DEFAULT 0,
  total_revenue_sats INTEGER DEFAULT 0,

  -- Speculation tracking
  is_speculative BOOLEAN DEFAULT 0,
  ai_score_at_purchase INTEGER,
  target_exit_price_sats INTEGER,
  stop_loss_price_sats INTEGER,

  UNIQUE(token_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_speculative ON holdings(is_speculative);
CREATE INDEX IF NOT EXISTS idx_holdings_balance ON holdings(balance) WHERE balance > 0;

-- ══════════════════════════════════════════════════════════════════
-- TRANSFERS - Indexed transfer events
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  from_address TEXT,
  to_address TEXT NOT NULL,
  amount INTEGER NOT NULL,

  txid TEXT UNIQUE,
  block_height INTEGER,
  block_time INTEGER,

  verified_at INTEGER,
  verified_via TEXT,

  received_from_peer TEXT,
  gossiped_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_transfers_token ON transfers(token_id);
CREATE INDEX IF NOT EXISTS idx_transfers_txid ON transfers(txid);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address);

-- ══════════════════════════════════════════════════════════════════
-- HOLDERS - Known holders for tokens we track
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),
  address TEXT NOT NULL,
  handle TEXT,

  balance INTEGER NOT NULL DEFAULT 0,
  last_verified_at INTEGER,

  received_from_peer TEXT,

  UNIQUE(token_id, address)
);

CREATE INDEX IF NOT EXISTS idx_holders_token ON holders(token_id);
CREATE INDEX IF NOT EXISTS idx_holders_address ON holders(address);

-- ══════════════════════════════════════════════════════════════════
-- PEERS - Known peers in the gossip network
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS peers (
  peer_id TEXT PRIMARY KEY,

  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 4020,

  status TEXT DEFAULT 'unknown',
  last_seen_at INTEGER,
  last_connected_at INTEGER,
  connection_failures INTEGER DEFAULT 0,

  reputation_score INTEGER DEFAULT 50,
  valid_messages INTEGER DEFAULT 0,
  invalid_messages INTEGER DEFAULT 0,

  tokens_announced TEXT,

  discovered_via TEXT,
  introduced_by TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_peers_status ON peers(status);
CREATE INDEX IF NOT EXISTS idx_peers_reputation ON peers(reputation_score);

-- ══════════════════════════════════════════════════════════════════
-- CONTENT_CACHE - Cached content acquired
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS content_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  content_hash TEXT NOT NULL,
  content_type TEXT,
  content_size INTEGER,
  content_path TEXT,

  acquired_at INTEGER NOT NULL DEFAULT (unixepoch()),
  price_paid_sats INTEGER,

  UNIQUE(token_id)
);

-- ══════════════════════════════════════════════════════════════════
-- SERVE_LOG - Content served to others
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS serve_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  requester_address TEXT,
  requester_peer_id TEXT,

  revenue_sats INTEGER NOT NULL DEFAULT 0,
  txid TEXT,

  served_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_serve_log_token ON serve_log(token_id);
CREATE INDEX IF NOT EXISTS idx_serve_log_time ON serve_log(served_at);

-- ══════════════════════════════════════════════════════════════════
-- AI_DECISIONS - Speculation history
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  decision_type TEXT NOT NULL,
  recommendation TEXT,

  ai_provider TEXT,
  ai_model TEXT,
  ai_score INTEGER,
  ai_confidence REAL,
  ai_reasoning TEXT,

  token_supply INTEGER,
  token_price_sats INTEGER,
  market_context TEXT,

  action_taken TEXT,
  price_at_action INTEGER,
  outcome_tracked BOOLEAN DEFAULT 0,
  outcome_pnl_sats INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_token ON ai_decisions(token_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON ai_decisions(decision_type);

-- ══════════════════════════════════════════════════════════════════
-- GOSSIP_LOG - Message history for debugging
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gossip_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  direction TEXT NOT NULL,
  peer_id TEXT,
  message_type TEXT NOT NULL,
  message_hash TEXT,
  payload TEXT,

  was_valid BOOLEAN,
  validation_error TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_gossip_log_type ON gossip_log(message_type);
CREATE INDEX IF NOT EXISTS idx_gossip_log_hash ON gossip_log(message_hash);
CREATE INDEX IF NOT EXISTS idx_gossip_log_time ON gossip_log(created_at);

-- ══════════════════════════════════════════════════════════════════
-- CONFIG - Local configuration (key-value)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ══════════════════════════════════════════════════════════════════
-- IDENTITY TOKENS - Self-issued Digital DNA token
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS identity_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  token_id TEXT NOT NULL UNIQUE,
  issuer_address TEXT NOT NULL,
  total_supply TEXT NOT NULL DEFAULT '100000000000000000',
  decimals INTEGER NOT NULL DEFAULT 8,
  access_rate INTEGER NOT NULL DEFAULT 1,
  inscription_data TEXT,
  broadcast_txid TEXT,
  broadcast_status TEXT NOT NULL DEFAULT 'local',
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Default config
INSERT OR IGNORE INTO config (key, value) VALUES
  ('node_id', lower(hex(randomblob(16)))),
  ('node_created_at', unixepoch()),
  ('gossip_enabled', 'true'),
  ('speculation_enabled', 'false'),
  ('auto_acquire', 'false'),
  ('max_speculation_budget_sats', '100000');

-- ══════════════════════════════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════════════════════════════

CREATE VIEW IF NOT EXISTS v_portfolio AS
SELECT
  h.token_id,
  t.name,
  h.balance,
  h.avg_cost_sats,
  h.total_spent_sats,
  h.total_revenue_sats,
  h.total_revenue_sats - h.total_spent_sats as pnl_sats,
  ROUND((h.total_revenue_sats - h.total_spent_sats) * 100.0 / NULLIF(h.total_spent_sats, 0), 2) as roi_percent,
  h.is_speculative,
  t.current_supply,
  CAST(t.base_price_sats / sqrt(t.current_supply + 1) AS INTEGER) as current_price_sats
FROM holdings h
JOIN tokens t ON h.token_id = t.token_id
WHERE h.balance > 0;

CREATE VIEW IF NOT EXISTS v_active_peers AS
SELECT *
FROM peers
WHERE status = 'active'
  AND last_seen_at > unixepoch() - 3600
ORDER BY reputation_score DESC;
