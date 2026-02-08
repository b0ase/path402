-- $402 Pathd Client - Local SQLite Schema
-- Each node maintains its own database, synced via gossip

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ══════════════════════════════════════════════════════════════════
-- TOKENS - Registry of discovered tokens
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tokens (
  token_id TEXT PRIMARY KEY,              -- e.g., "$b0ase.com/$blog"
  name TEXT,
  description TEXT,
  issuer_address TEXT,
  issuer_handle TEXT,

  -- Pricing
  base_price_sats INTEGER NOT NULL DEFAULT 500,
  pricing_model TEXT NOT NULL DEFAULT 'sqrt_decay',
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
  verification_status TEXT DEFAULT 'unverified',  -- unverified, verified, invalid

  -- Source tracking
  discovered_via TEXT,  -- 'chain', 'gossip', 'direct', 'browser'
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
  avg_cost_sats INTEGER,                  -- Average cost basis
  total_spent_sats INTEGER DEFAULT 0,

  -- Acquisition tracking
  first_acquired_at INTEGER,
  last_acquired_at INTEGER,
  acquisition_supply INTEGER,             -- Supply when first acquired (position #)

  -- Serving
  can_serve BOOLEAN DEFAULT 1,
  total_serves INTEGER DEFAULT 0,
  total_revenue_sats INTEGER DEFAULT 0,

  -- Speculation tracking
  is_speculative BOOLEAN DEFAULT 0,       -- Bought for speculation vs access
  ai_score_at_purchase INTEGER,
  target_exit_price_sats INTEGER,
  stop_loss_price_sats INTEGER,

  UNIQUE(token_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_speculative ON holdings(is_speculative);
CREATE INDEX IF NOT EXISTS idx_holdings_balance ON holdings(balance) WHERE balance > 0;

-- ══════════════════════════════════════════════════════════════════
-- TRANSFERS - Indexed transfer events (tokens I care about)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  -- Transfer details
  from_address TEXT,
  to_address TEXT NOT NULL,
  amount INTEGER NOT NULL,

  -- On-chain proof
  txid TEXT UNIQUE,
  block_height INTEGER,
  block_time INTEGER,

  -- Verification
  verified_at INTEGER,
  verified_via TEXT,  -- 'chain', 'gossip'

  -- Gossip tracking
  received_from_peer TEXT,
  gossiped_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_transfers_token ON transfers(token_id);
CREATE INDEX IF NOT EXISTS idx_transfers_txid ON transfers(txid);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address);

-- ══════════════════════════════════════════════════════════════════
-- HOLDERS - Known holders for tokens I'm tracking
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),
  address TEXT NOT NULL,
  handle TEXT,

  balance INTEGER NOT NULL DEFAULT 0,
  last_verified_at INTEGER,

  -- Gossip source
  received_from_peer TEXT,

  UNIQUE(token_id, address)
);

CREATE INDEX IF NOT EXISTS idx_holders_token ON holders(token_id);
CREATE INDEX IF NOT EXISTS idx_holders_address ON holders(address);

-- ══════════════════════════════════════════════════════════════════
-- PEERS - Known peers in the gossip network
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS peers (
  peer_id TEXT PRIMARY KEY,               -- Public key or unique ID

  -- Connection info
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 4020,

  -- Status
  status TEXT DEFAULT 'unknown',          -- unknown, active, stale, banned
  last_seen_at INTEGER,
  last_connected_at INTEGER,
  connection_failures INTEGER DEFAULT 0,

  -- Reputation
  reputation_score INTEGER DEFAULT 50,    -- 0-100, starts at 50
  valid_messages INTEGER DEFAULT 0,
  invalid_messages INTEGER DEFAULT 0,

  -- Capabilities
  tokens_announced TEXT,                  -- JSON array of token_ids they have

  -- Discovery
  discovered_via TEXT,                    -- 'bootstrap', 'gossip', 'mdns'
  introduced_by TEXT,                     -- peer_id that told us about them

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_peers_status ON peers(status);
CREATE INDEX IF NOT EXISTS idx_peers_reputation ON peers(reputation_score);

-- ══════════════════════════════════════════════════════════════════
-- CONTENT_CACHE - Cached content I've acquired
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS content_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  -- Content
  content_hash TEXT NOT NULL,             -- SHA256 of content
  content_type TEXT,
  content_size INTEGER,
  content_path TEXT,                      -- Local file path

  -- Acquisition
  acquired_at INTEGER NOT NULL DEFAULT (unixepoch()),
  price_paid_sats INTEGER,

  UNIQUE(token_id)
);

-- ══════════════════════════════════════════════════════════════════
-- SERVE_LOG - Content I've served to others
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS serve_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  -- Serve event
  requester_address TEXT,
  requester_peer_id TEXT,

  -- Revenue
  revenue_sats INTEGER NOT NULL DEFAULT 0,
  txid TEXT,

  served_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_serve_log_token ON serve_log(token_id);
CREATE INDEX IF NOT EXISTS idx_serve_log_time ON serve_log(served_at);

-- ══════════════════════════════════════════════════════════════════
-- AI_DECISIONS - Speculation history for learning
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL REFERENCES tokens(token_id),

  -- Decision
  decision_type TEXT NOT NULL,            -- 'evaluate', 'acquire', 'divest', 'hold'
  recommendation TEXT,                     -- 'acquire', 'skip', 'hold', 'sell'

  -- AI analysis
  ai_provider TEXT,                        -- 'claude', 'openai', 'ollama'
  ai_model TEXT,
  ai_score INTEGER,                        -- 0-100
  ai_confidence REAL,                      -- 0-1
  ai_reasoning TEXT,

  -- Context at decision time
  token_supply INTEGER,
  token_price_sats INTEGER,
  market_context TEXT,                     -- JSON

  -- Outcome tracking
  action_taken TEXT,                       -- What we actually did
  price_at_action INTEGER,
  outcome_tracked BOOLEAN DEFAULT 0,
  outcome_pnl_sats INTEGER,               -- Profit/loss if we can measure

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_decisions_token ON ai_decisions(token_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON ai_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_outcome ON ai_decisions(outcome_tracked) WHERE outcome_tracked = 0;

-- ══════════════════════════════════════════════════════════════════
-- GOSSIP_LOG - Message history for debugging
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gossip_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  direction TEXT NOT NULL,                -- 'in', 'out'
  peer_id TEXT,
  message_type TEXT NOT NULL,
  message_hash TEXT,                      -- For deduplication
  payload TEXT,                           -- JSON

  -- Validation
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
-- IDENTITY TOKENS - User's self-issued Digital DNA token
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS identity_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,           -- e.g., "$RICHARD"
  token_id TEXT NOT NULL UNIQUE,         -- deterministic SHA256(path402:symbol:address)
  issuer_address TEXT NOT NULL,          -- BSV address derived from walletKey
  total_supply TEXT NOT NULL DEFAULT '100000000000000000', -- 1B * 10^8 (8 decimals, stored as integer string)
  decimals INTEGER NOT NULL DEFAULT 8,
  access_rate INTEGER NOT NULL DEFAULT 1, -- tokens per second
  inscription_data TEXT,                 -- full BSV21 JSON (ready for broadcast)
  broadcast_txid TEXT,                   -- NULL until actually on-chain
  broadcast_status TEXT NOT NULL DEFAULT 'local', -- local | pending | confirmed | failed
  metadata TEXT,                         -- JSON: name, description, avatar
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ══════════════════════════════════════════════════════════════════
-- CALL RECORDS - P2P video call accounting
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS call_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL UNIQUE,
  caller_peer_id TEXT NOT NULL,
  callee_peer_id TEXT NOT NULL,
  caller_token_symbol TEXT,              -- caller's identity token
  callee_token_symbol TEXT,              -- callee's identity token
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  caller_tokens_sent TEXT DEFAULT '0',   -- tokens of $CALLER sent to callee
  callee_tokens_sent TEXT DEFAULT '0',   -- tokens of $CALLEE sent to caller
  settlement_status TEXT NOT NULL DEFAULT 'pending', -- pending | settled | disputed
  settlement_txid TEXT,                  -- on-chain call record (when broadcast works)
  settlement_data TEXT,                  -- JSON: full settlement inscription
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_call_records_caller ON call_records(caller_peer_id);
CREATE INDEX IF NOT EXISTS idx_call_records_callee ON call_records(callee_peer_id);
CREATE INDEX IF NOT EXISTS idx_call_records_status ON call_records(settlement_status);

-- Default config
INSERT OR IGNORE INTO config (key, value) VALUES
  ('node_id', lower(hex(randomblob(16)))),
  ('node_created_at', unixepoch()),
  ('gossip_enabled', 'true'),
  ('speculation_enabled', 'false'),
  ('auto_acquire', 'false'),
  ('max_speculation_budget_sats', '100000');

-- ══════════════════════════════════════════════════════════════════
-- VIEWS - Useful aggregations
-- ══════════════════════════════════════════════════════════════════

-- Portfolio summary
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

-- Active peers
CREATE VIEW IF NOT EXISTS v_active_peers AS
SELECT *
FROM peers
WHERE status = 'active'
  AND last_seen_at > unixepoch() - 3600  -- Seen in last hour
ORDER BY reputation_score DESC;

-- Speculation opportunities (tokens with low supply, high AI scores)
CREATE VIEW IF NOT EXISTS v_speculation_opportunities AS
SELECT
  t.token_id,
  t.name,
  t.current_supply,
  CAST(t.base_price_sats / sqrt(t.current_supply + 1) AS INTEGER) as current_price_sats,
  ad.ai_score,
  ad.ai_confidence,
  ad.recommendation
FROM tokens t
LEFT JOIN ai_decisions ad ON t.token_id = ad.token_id
  AND ad.id = (SELECT MAX(id) FROM ai_decisions WHERE token_id = t.token_id)
WHERE t.verification_status = 'verified'
  AND t.current_supply < 100
ORDER BY ad.ai_score DESC NULLS LAST;
