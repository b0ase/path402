/**
 * $402 Pathd Client - Local SQLite Database
 *
 * Each node maintains its own database. No central server dependency.
 * Data is synced via gossip protocol and verified against on-chain state.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// ── Types ──────────────────────────────────────────────────────────

export interface Token {
  token_id: string;
  name: string | null;
  description: string | null;
  issuer_address: string | null;
  issuer_handle: string | null;
  base_price_sats: number;
  pricing_model: string;
  decay_factor: number;
  current_supply: number;
  max_supply: number | null;
  issuer_share_bps: number;
  network_share_bps: number;
  content_type: string | null;
  content_preview: string | null;
  access_url: string | null;
  discovered_at: number;
  last_verified_at: number | null;
  verification_status: 'unverified' | 'verified' | 'invalid';
  discovered_via: string | null;
}

export interface Holding {
  id: number;
  token_id: string;
  balance: number;
  avg_cost_sats: number | null;
  total_spent_sats: number;
  first_acquired_at: number | null;
  last_acquired_at: number | null;
  acquisition_supply: number | null;
  can_serve: boolean;
  total_serves: number;
  total_revenue_sats: number;
  is_speculative: boolean;
  ai_score_at_purchase: number | null;
}

export interface Transfer {
  id: number;
  token_id: string;
  from_address: string | null;
  to_address: string;
  amount: number;
  txid: string | null;
  block_height: number | null;
  block_time: number | null;
  verified_at: number | null;
  verified_via: string | null;
  created_at: number;
}

export interface Peer {
  peer_id: string;
  host: string;
  port: number;
  status: 'unknown' | 'active' | 'stale' | 'banned';
  last_seen_at: number | null;
  last_connected_at: number | null;
  connection_failures: number;
  reputation_score: number;
  valid_messages: number;
  invalid_messages: number;
  tokens_announced: string | null;
  discovered_via: string | null;
  created_at: number;
}

export interface AIDecision {
  id: number;
  token_id: string;
  decision_type: string;
  recommendation: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_score: number | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  token_supply: number | null;
  token_price_sats: number | null;
  action_taken: string | null;
  price_at_action: number | null;
  outcome_tracked: boolean;
  outcome_pnl_sats: number | null;
  created_at: number;
}

export interface PortfolioItem {
  token_id: string;
  name: string | null;
  balance: number;
  avg_cost_sats: number | null;
  total_spent_sats: number;
  total_revenue_sats: number;
  pnl_sats: number;
  roi_percent: number | null;
  is_speculative: boolean;
  current_supply: number;
  current_price_sats: number;
}

// ── Database Singleton ─────────────────────────────────────────────

let db: Database.Database | null = null;

/**
 * Get the database path
 */
function getDbPath(): string {
  const dataDir = process.env.PATHD_DATA_DIR || join(homedir(), '.pathd');

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  return join(dataDir, 'pathd.db');
}

/**
 * Initialize the local SQLite database
 */
export function initLocalDb(dbPath?: string, schemaPath?: string): Database.Database {
  if (db) return db;

  const path = dbPath || getDbPath();
  db = new Database(path);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load schema
  let finalSchemaPath = schemaPath;

  if (!finalSchemaPath) {
    // Default fallback logic only for development
    const possiblePaths = [
      join(_dirname, 'schema.sql'),
      join(_dirname, 'db', 'schema.sql'),
      join(_dirname, 'dist', 'db', 'schema.sql')
    ];
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        finalSchemaPath = p;
        break;
      }
    }
  }

  if (finalSchemaPath && existsSync(finalSchemaPath)) {
    const schema = readFileSync(finalSchemaPath, 'utf-8');
    db.exec(schema);
  } else if (!dbPath) { // If it's a new DB and no schema found, that's an error
    console.warn('[DB] Warning: No schema.sql found at:', finalSchemaPath || 'default paths');
  }

  console.log(`[DB] Initialized at ${path}`);
  return db;
}

/**
 * Get database instance (initializes if needed)
 */
export function getDb(): Database.Database {
  if (!db) {
    return initLocalDb();
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Config Operations ──────────────────────────────────────────────

export function getConfig(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setConfig(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

export function getNodeId(): string {
  return getConfig('node_id') || 'unknown';
}

// ── Token Operations ───────────────────────────────────────────────

export function upsertToken(token: Partial<Token> & { token_id: string }): void {
  const db = getDb();

  const existing = db.prepare('SELECT token_id FROM tokens WHERE token_id = ?').get(token.token_id);

  if (existing) {
    // Update
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(token)) {
      if (key !== 'token_id' && value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length > 0) {
      values.push(token.token_id);
      db.prepare(`UPDATE tokens SET ${updates.join(', ')} WHERE token_id = ?`).run(...values);
    }
  } else {
    // Insert
    db.prepare(`
      INSERT INTO tokens (token_id, name, description, issuer_address, issuer_handle,
        base_price_sats, pricing_model, current_supply, content_type, content_preview,
        discovered_via, verification_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token.token_id,
      token.name ?? null,
      token.description ?? null,
      token.issuer_address ?? null,
      token.issuer_handle ?? null,
      token.base_price_sats ?? 500,
      token.pricing_model ?? 'alice_bond',
      token.current_supply ?? 0,
      token.content_type ?? null,
      token.content_preview ?? null,
      token.discovered_via ?? 'direct',
      token.verification_status ?? 'unverified'
    );
  }
}

export function getToken(tokenId: string): Token | null {
  return getDb().prepare('SELECT * FROM tokens WHERE token_id = ?').get(tokenId) as Token | null;
}

export function getAllTokens(verified_only = false): Token[] {
  if (verified_only) {
    return getDb().prepare('SELECT * FROM tokens WHERE verification_status = ?').all('verified') as Token[];
  }
  return getDb().prepare('SELECT * FROM tokens').all() as Token[];
}

export function getTokensBySupply(maxSupply: number): Token[] {
  return getDb().prepare('SELECT * FROM tokens WHERE current_supply < ? ORDER BY current_supply ASC')
    .all(maxSupply) as Token[];
}

export function markTokenVerified(tokenId: string, supply: number): void {
  getDb().prepare(`
    UPDATE tokens
    SET verification_status = 'verified', current_supply = ?, last_verified_at = unixepoch()
    WHERE token_id = ?
  `).run(supply, tokenId);
}

// ── Holding Operations ─────────────────────────────────────────────

export function upsertHolding(tokenId: string, amount: number, pricePaid: number, isSpeculative = false): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const existing = db.prepare('SELECT * FROM holdings WHERE token_id = ?').get(tokenId) as Holding | undefined;

  if (existing) {
    const newBalance = existing.balance + amount;
    const newTotalSpent = existing.total_spent_sats + pricePaid;
    const newAvgCost = Math.floor(newTotalSpent / newBalance);

    db.prepare(`
      UPDATE holdings
      SET balance = ?, total_spent_sats = ?, avg_cost_sats = ?, last_acquired_at = ?
      WHERE token_id = ?
    `).run(newBalance, newTotalSpent, newAvgCost, now, tokenId);
  } else {
    // Get current supply for position tracking
    const token = getToken(tokenId);
    const acquisitionSupply = token?.current_supply ?? 0;

    db.prepare(`
      INSERT INTO holdings (token_id, balance, avg_cost_sats, total_spent_sats,
        first_acquired_at, last_acquired_at, acquisition_supply, is_speculative)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tokenId, amount, pricePaid, pricePaid, now, now, acquisitionSupply, isSpeculative ? 1 : 0);
  }
}

export function getHolding(tokenId: string): Holding | null {
  return getDb().prepare('SELECT * FROM holdings WHERE token_id = ?').get(tokenId) as Holding | null;
}

export function getAllHoldings(includeZero = false): Holding[] {
  if (includeZero) {
    return getDb().prepare('SELECT * FROM holdings').all() as Holding[];
  }
  return getDb().prepare('SELECT * FROM holdings WHERE balance > 0').all() as Holding[];
}

export function getSpeculativeHoldings(): Holding[] {
  return getDb().prepare('SELECT * FROM holdings WHERE is_speculative = 1 AND balance > 0').all() as Holding[];
}

export function recordServeRevenue(tokenId: string, revenueSats: number): void {
  getDb().prepare(`
    UPDATE holdings
    SET total_serves = total_serves + 1, total_revenue_sats = total_revenue_sats + ?
    WHERE token_id = ?
  `).run(revenueSats, tokenId);
}

// ── Portfolio View ─────────────────────────────────────────────────

export function getPortfolio(): PortfolioItem[] {
  return getDb().prepare('SELECT * FROM v_portfolio').all() as PortfolioItem[];
}

export function getPortfolioSummary(): {
  totalValue: number;
  totalSpent: number;
  totalRevenue: number;
  totalPnL: number;
  tokenCount: number;
  speculativeCount: number;
} {
  const portfolio = getPortfolio();

  return {
    totalValue: portfolio.reduce((sum, p) => sum + (p.balance * p.current_price_sats), 0),
    totalSpent: portfolio.reduce((sum, p) => sum + p.total_spent_sats, 0),
    totalRevenue: portfolio.reduce((sum, p) => sum + p.total_revenue_sats, 0),
    totalPnL: portfolio.reduce((sum, p) => sum + p.pnl_sats, 0),
    tokenCount: portfolio.length,
    speculativeCount: portfolio.filter(p => p.is_speculative).length
  };
}

// ── Peer Operations ────────────────────────────────────────────────

export function upsertPeer(peer: Partial<Peer> & { peer_id: string; host: string }): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO peers (peer_id, host, port, status, discovered_via)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(peer_id) DO UPDATE SET
      host = excluded.host,
      port = excluded.port,
      last_seen_at = unixepoch()
  `).run(
    peer.peer_id,
    peer.host,
    peer.port ?? 4020,
    peer.status ?? 'unknown',
    peer.discovered_via ?? 'gossip'
  );
}

export function getPeer(peerId: string): Peer | null {
  return getDb().prepare('SELECT * FROM peers WHERE peer_id = ?').get(peerId) as Peer | null;
}

export function getActivePeers(): Peer[] {
  return getDb().prepare('SELECT * FROM v_active_peers').all() as Peer[];
}

export function getAllPeers(): Peer[] {
  return getDb().prepare('SELECT * FROM peers ORDER BY reputation_score DESC').all() as Peer[];
}

export function updatePeerStatus(peerId: string, status: Peer['status']): void {
  getDb().prepare('UPDATE peers SET status = ?, last_seen_at = unixepoch() WHERE peer_id = ?')
    .run(status, peerId);
}

export function recordPeerMessage(peerId: string, valid: boolean): void {
  if (valid) {
    getDb().prepare(`
      UPDATE peers
      SET valid_messages = valid_messages + 1,
          reputation_score = MIN(100, reputation_score + 1),
          last_seen_at = unixepoch()
      WHERE peer_id = ?
    `).run(peerId);
  } else {
    getDb().prepare(`
      UPDATE peers
      SET invalid_messages = invalid_messages + 1,
          reputation_score = MAX(0, reputation_score - 10)
      WHERE peer_id = ?
    `).run(peerId);
  }
}

export function banPeer(peerId: string): void {
  getDb().prepare('UPDATE peers SET status = ?, reputation_score = 0 WHERE peer_id = ?')
    .run('banned', peerId);
}

// ── Transfer Operations ────────────────────────────────────────────

export function recordTransfer(transfer: Omit<Transfer, 'id' | 'created_at'>): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO transfers
    (token_id, from_address, to_address, amount, txid, block_height, block_time, verified_via, received_from_peer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transfer.token_id,
    transfer.from_address,
    transfer.to_address,
    transfer.amount,
    transfer.txid,
    transfer.block_height,
    transfer.block_time,
    transfer.verified_via,
    null
  );
}

export function getTransfers(tokenId: string, limit = 50): Transfer[] {
  return getDb().prepare('SELECT * FROM transfers WHERE token_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(tokenId, limit) as Transfer[];
}

export function hasTransfer(txid: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM transfers WHERE txid = ?').get(txid);
  return !!row;
}

// ── AI Decision Operations ─────────────────────────────────────────

export function recordAIDecision(decision: Omit<AIDecision, 'id' | 'created_at' | 'outcome_tracked' | 'outcome_pnl_sats'>): number {
  const result = getDb().prepare(`
    INSERT INTO ai_decisions
    (token_id, decision_type, recommendation, ai_provider, ai_model, ai_score, ai_confidence,
     ai_reasoning, token_supply, token_price_sats, action_taken, price_at_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    decision.token_id,
    decision.decision_type,
    decision.recommendation,
    decision.ai_provider,
    decision.ai_model,
    decision.ai_score,
    decision.ai_confidence,
    decision.ai_reasoning,
    decision.token_supply,
    decision.token_price_sats,
    decision.action_taken,
    decision.price_at_action
  );

  return result.lastInsertRowid as number;
}

export function getLatestDecision(tokenId: string): AIDecision | null {
  return getDb().prepare(`
    SELECT * FROM ai_decisions WHERE token_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(tokenId) as AIDecision | null;
}

export function getUnresolvedDecisions(): AIDecision[] {
  return getDb().prepare(`
    SELECT * FROM ai_decisions WHERE outcome_tracked = 0 AND action_taken IS NOT NULL
  `).all() as AIDecision[];
}

export function resolveDecision(decisionId: number, pnlSats: number): void {
  getDb().prepare(`
    UPDATE ai_decisions SET outcome_tracked = 1, outcome_pnl_sats = ? WHERE id = ?
  `).run(pnlSats, decisionId);
}

// ── Gossip Log ─────────────────────────────────────────────────────

export function logGossipMessage(
  direction: 'in' | 'out',
  peerId: string | null,
  messageType: string,
  payload: unknown,
  wasValid?: boolean,
  validationError?: string
): void {
  const hash = Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 32);

  getDb().prepare(`
    INSERT INTO gossip_log (direction, peer_id, message_type, message_hash, payload, was_valid, validation_error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(direction, peerId, messageType, hash, JSON.stringify(payload), wasValid ?? null, validationError ?? null);
}

export function hasSeenMessage(messageHash: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM gossip_log WHERE message_hash = ?').get(messageHash);
  return !!row;
}

// ── Content Cache Operations ──────────────────────────────────────

export interface ContentCacheRow {
  id: number;
  token_id: string;
  content_hash: string;
  content_type: string | null;
  content_size: number | null;
  content_path: string | null;
  acquired_at: number;
  price_paid_sats: number | null;
}

export function upsertContentCache(entry: {
  token_id: string;
  content_hash: string;
  content_type?: string;
  content_size?: number;
  content_path?: string;
  price_paid_sats?: number;
}): void {
  getDb().prepare(`
    INSERT INTO content_cache (token_id, content_hash, content_type, content_size, content_path, price_paid_sats)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      content_hash = excluded.content_hash,
      content_type = excluded.content_type,
      content_size = excluded.content_size,
      content_path = excluded.content_path,
      price_paid_sats = excluded.price_paid_sats
  `).run(
    entry.token_id,
    entry.content_hash,
    entry.content_type ?? null,
    entry.content_size ?? null,
    entry.content_path ?? null,
    entry.price_paid_sats ?? null
  );
}

export function getContentByHash(hash: string): ContentCacheRow | null {
  return getDb().prepare('SELECT * FROM content_cache WHERE content_hash = ?').get(hash) as ContentCacheRow | null;
}

export function getContentByToken(tokenId: string): ContentCacheRow | null {
  return getDb().prepare('SELECT * FROM content_cache WHERE token_id = ?').get(tokenId) as ContentCacheRow | null;
}

export function getAllCachedContent(): ContentCacheRow[] {
  return getDb().prepare('SELECT * FROM content_cache ORDER BY acquired_at DESC').all() as ContentCacheRow[];
}

export function deleteContentCache(hash: string): void {
  getDb().prepare('DELETE FROM content_cache WHERE content_hash = ?').run(hash);
}

export function getContentCacheStats(): { totalItems: number; totalBytes: number } {
  const row = getDb().prepare(`
    SELECT COUNT(*) as totalItems, COALESCE(SUM(content_size), 0) as totalBytes
    FROM content_cache
  `).get() as { totalItems: number; totalBytes: number };
  return row;
}

// ── Serve Log ─────────────────────────────────────────────────────

export function logServe(entry: {
  token_id: string;
  requester_address?: string;
  requester_peer_id?: string;
  revenue_sats: number;
  txid?: string;
}): void {
  getDb().prepare(`
    INSERT INTO serve_log (token_id, requester_address, requester_peer_id, revenue_sats, txid)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.token_id,
    entry.requester_address ?? null,
    entry.requester_peer_id ?? null,
    entry.revenue_sats,
    entry.txid ?? null
  );
}

// ── Identity Token Operations ──────────────────────────────────────

export interface IdentityToken {
  id: number;
  symbol: string;
  token_id: string;
  issuer_address: string;
  total_supply: string;
  decimals: number;
  access_rate: number;
  inscription_data: string | null;
  broadcast_txid: string | null;
  broadcast_status: 'local' | 'pending' | 'confirmed' | 'failed';
  metadata: string | null;
  created_at: number;
}

export function createIdentityToken(
  symbol: string,
  tokenId: string,
  issuerAddress: string,
  inscriptionData?: string,
  metadata?: Record<string, unknown>
): void {
  getDb().prepare(`
    INSERT INTO identity_tokens (symbol, token_id, issuer_address, inscription_data, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    symbol,
    tokenId,
    issuerAddress,
    inscriptionData ?? null,
    metadata ? JSON.stringify(metadata) : null
  );
}

export function getIdentityToken(): IdentityToken | null {
  return getDb().prepare('SELECT * FROM identity_tokens ORDER BY id ASC LIMIT 1').get() as IdentityToken | null;
}

export function getIdentityTokenBySymbol(symbol: string): IdentityToken | null {
  return getDb().prepare('SELECT * FROM identity_tokens WHERE symbol = ?').get(symbol) as IdentityToken | null;
}

export function updateIdentityBroadcast(tokenId: string, txid: string, status: IdentityToken['broadcast_status']): void {
  getDb().prepare(`
    UPDATE identity_tokens SET broadcast_txid = ?, broadcast_status = ? WHERE token_id = ?
  `).run(txid, status, tokenId);
}

// ── Call Record Operations ──────────────────────────────────────

export interface CallRecord {
  id: number;
  call_id: string;
  caller_peer_id: string;
  callee_peer_id: string;
  caller_token_symbol: string | null;
  callee_token_symbol: string | null;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  caller_tokens_sent: string;
  callee_tokens_sent: string;
  settlement_status: 'pending' | 'settled' | 'disputed';
  settlement_txid: string | null;
  settlement_data: string | null;
  created_at: number;
}

export function createCallRecord(record: {
  call_id: string;
  caller_peer_id: string;
  callee_peer_id: string;
  caller_token_symbol?: string;
  callee_token_symbol?: string;
  started_at: number;
}): void {
  getDb().prepare(`
    INSERT INTO call_records (call_id, caller_peer_id, callee_peer_id, caller_token_symbol, callee_token_symbol, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    record.call_id,
    record.caller_peer_id,
    record.callee_peer_id,
    record.caller_token_symbol ?? null,
    record.callee_token_symbol ?? null,
    record.started_at
  );
}

export function updateCallRecord(callId: string, updates: {
  ended_at?: number;
  duration_seconds?: number;
  caller_tokens_sent?: string;
  callee_tokens_sent?: string;
  settlement_status?: CallRecord['settlement_status'];
  settlement_txid?: string;
  settlement_data?: string;
}): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return;
  values.push(callId);
  getDb().prepare(`UPDATE call_records SET ${sets.join(', ')} WHERE call_id = ?`).run(...values);
}

export function getCallRecords(limit = 50): CallRecord[] {
  return getDb().prepare('SELECT * FROM call_records ORDER BY created_at DESC LIMIT ?').all(limit) as CallRecord[];
}

export function getCallRecord(callId: string): CallRecord | null {
  return getDb().prepare('SELECT * FROM call_records WHERE call_id = ?').get(callId) as CallRecord | null;
}

// ── Cashboard Run Operations ──────────────────────────────────────

export interface CashboardRunRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  node_count: number;
  completed_count: number;
  error: string | null;
  created_at: number;
}

export interface CashboardStepRow {
  id: string;
  run_id: string;
  node_id: string;
  action: string;
  status: string;
  result_json: string | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
}

export function createCashboardRun(run: {
  id: string;
  workflow_id: string;
  workflow_name: string;
  node_count: number;
}): void {
  getDb().prepare(`
    INSERT INTO cashboard_runs (id, workflow_id, workflow_name, status, node_count)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(run.id, run.workflow_id, run.workflow_name, run.node_count);
}

export function getCashboardRun(runId: string): CashboardRunRow | null {
  return getDb().prepare('SELECT * FROM cashboard_runs WHERE id = ?').get(runId) as CashboardRunRow | null;
}

export function getAllCashboardRuns(limit = 20): CashboardRunRow[] {
  return getDb().prepare(
    'SELECT * FROM cashboard_runs ORDER BY started_at DESC LIMIT ?'
  ).all(limit) as CashboardRunRow[];
}

export function updateCashboardRun(runId: string, updates: {
  status?: string;
  finished_at?: number;
  completed_count?: number;
  error?: string;
}): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length === 0) return;
  values.push(runId);
  getDb().prepare(
    `UPDATE cashboard_runs SET ${sets.join(', ')} WHERE id = ?`
  ).run(...values);
}

export function createCashboardStep(step: {
  id: string;
  run_id: string;
  node_id: string;
  action: string;
}): void {
  getDb().prepare(`
    INSERT INTO cashboard_steps (id, run_id, node_id, action, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(step.id, step.run_id, step.node_id, step.action);
}

export function getCashboardStepsByRun(runId: string): CashboardStepRow[] {
  return getDb().prepare(
    'SELECT * FROM cashboard_steps WHERE run_id = ? ORDER BY started_at ASC'
  ).all(runId) as CashboardStepRow[];
}

export function updateCashboardStep(stepId: string, updates: {
  status?: string;
  result_json?: string;
  error?: string;
  started_at?: number;
  finished_at?: number;
  duration_ms?: number;
}): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (sets.length === 0) return;
  values.push(stepId);
  getDb().prepare(
    `UPDATE cashboard_steps SET ${sets.join(', ')} WHERE id = ?`
  ).run(...values);
}

export function getActiveCashboardRun(): CashboardRunRow | null {
  return getDb().prepare(
    "SELECT * FROM cashboard_runs WHERE status IN ('pending', 'running', 'paused') ORDER BY started_at DESC LIMIT 1"
  ).get() as CashboardRunRow | null;
}

// ── Chat Message Operations ──────────────────────────────────────

export interface ChatMessage {
  id: number;
  message_id: string;
  message_type: 'channel' | 'dm' | 'room';
  channel: string | null;
  room_id: string | null;
  sender_peer_id: string;
  recipient_peer_id: string | null;
  sender_handle: string | null;
  content: string;
  timestamp: number;
  received_at: number;
}

export interface ChatRoom {
  room_id: string;
  name: string;
  room_type: 'text' | 'voice' | 'hybrid';
  access_type: 'public' | 'private' | 'token_gated';
  token_id: string | null;
  creator_peer_id: string;
  capacity: number;
  description: string | null;
  created_at: number;
}

export interface RoomMember {
  id: number;
  room_id: string;
  peer_id: string;
  role: 'owner' | 'admin' | 'member';
  active: number;
  joined_at: number;
  left_at: number | null;
}

export function saveChatMessage(msg: {
  message_id: string;
  message_type: 'channel' | 'dm' | 'room';
  channel?: string;
  room_id?: string;
  sender_peer_id: string;
  recipient_peer_id?: string;
  sender_handle?: string;
  content: string;
  timestamp: number;
}): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO chat_messages
    (message_id, message_type, channel, room_id, sender_peer_id, recipient_peer_id, sender_handle, content, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.message_id,
    msg.message_type,
    msg.channel ?? null,
    msg.room_id ?? null,
    msg.sender_peer_id,
    msg.recipient_peer_id ?? null,
    msg.sender_handle ?? null,
    msg.content,
    msg.timestamp
  );
}

export function getChannelMessages(channel: string, limit = 50, before?: number): ChatMessage[] {
  if (before) {
    return getDb().prepare(
      `SELECT * FROM chat_messages WHERE message_type = 'channel' AND channel = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`
    ).all(channel, before, limit) as ChatMessage[];
  }
  return getDb().prepare(
    `SELECT * FROM chat_messages WHERE message_type = 'channel' AND channel = ? ORDER BY timestamp DESC LIMIT ?`
  ).all(channel, limit) as ChatMessage[];
}

export function getDMMessages(peerA: string, peerB: string, limit = 50, before?: number): ChatMessage[] {
  const sql = before
    ? `SELECT * FROM chat_messages WHERE message_type = 'dm'
       AND ((sender_peer_id = ? AND recipient_peer_id = ?) OR (sender_peer_id = ? AND recipient_peer_id = ?))
       AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`
    : `SELECT * FROM chat_messages WHERE message_type = 'dm'
       AND ((sender_peer_id = ? AND recipient_peer_id = ?) OR (sender_peer_id = ? AND recipient_peer_id = ?))
       ORDER BY timestamp DESC LIMIT ?`;

  if (before) {
    return getDb().prepare(sql).all(peerA, peerB, peerB, peerA, before, limit) as ChatMessage[];
  }
  return getDb().prepare(sql).all(peerA, peerB, peerB, peerA, limit) as ChatMessage[];
}

export function getRoomMessages(roomId: string, limit = 50, before?: number): ChatMessage[] {
  if (before) {
    return getDb().prepare(
      `SELECT * FROM chat_messages WHERE message_type = 'room' AND room_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?`
    ).all(roomId, before, limit) as ChatMessage[];
  }
  return getDb().prepare(
    `SELECT * FROM chat_messages WHERE message_type = 'room' AND room_id = ? ORDER BY timestamp DESC LIMIT ?`
  ).all(roomId, limit) as ChatMessage[];
}

export function getDMConversations(myPeerId: string): Array<{ peer_id: string; last_message: string; last_timestamp: number; unread_count: number }> {
  return getDb().prepare(`
    SELECT
      CASE WHEN sender_peer_id = ? THEN recipient_peer_id ELSE sender_peer_id END as peer_id,
      content as last_message,
      MAX(timestamp) as last_timestamp,
      0 as unread_count
    FROM chat_messages
    WHERE message_type = 'dm' AND (sender_peer_id = ? OR recipient_peer_id = ?)
    GROUP BY peer_id
    ORDER BY last_timestamp DESC
  `).all(myPeerId, myPeerId, myPeerId) as Array<{ peer_id: string; last_message: string; last_timestamp: number; unread_count: number }>;
}

// ── Chat Room Operations ──────────────────────────────────────

export function createChatRoom(room: {
  room_id: string;
  name: string;
  room_type: 'text' | 'voice' | 'hybrid';
  access_type: 'public' | 'private' | 'token_gated';
  token_id?: string;
  creator_peer_id: string;
  capacity?: number;
  description?: string;
}): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO chat_rooms (room_id, name, room_type, access_type, token_id, creator_peer_id, capacity, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    room.room_id,
    room.name,
    room.room_type,
    room.access_type,
    room.token_id ?? null,
    room.creator_peer_id,
    room.capacity ?? 50,
    room.description ?? null
  );
}

export function getChatRoom(roomId: string): ChatRoom | null {
  return getDb().prepare('SELECT * FROM chat_rooms WHERE room_id = ?').get(roomId) as ChatRoom | null;
}

export function getAllChatRooms(): ChatRoom[] {
  return getDb().prepare('SELECT * FROM chat_rooms ORDER BY created_at DESC').all() as ChatRoom[];
}

export function addRoomMember(roomId: string, peerId: string, role: 'owner' | 'admin' | 'member' = 'member'): void {
  getDb().prepare(`
    INSERT INTO room_members (room_id, peer_id, role, active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(room_id, peer_id) DO UPDATE SET active = 1, role = excluded.role, left_at = NULL
  `).run(roomId, peerId, role);
}

export function removeRoomMember(roomId: string, peerId: string): void {
  getDb().prepare(`
    UPDATE room_members SET active = 0, left_at = unixepoch() WHERE room_id = ? AND peer_id = ?
  `).run(roomId, peerId);
}

export function getRoomMembers(roomId: string, activeOnly = true): RoomMember[] {
  if (activeOnly) {
    return getDb().prepare('SELECT * FROM room_members WHERE room_id = ? AND active = 1').all(roomId) as RoomMember[];
  }
  return getDb().prepare('SELECT * FROM room_members WHERE room_id = ?').all(roomId) as RoomMember[];
}

// ── Speculation Opportunities ──────────────────────────────────────

export function getSpeculationOpportunities(): Array<{
  token_id: string;
  name: string | null;
  current_supply: number;
  current_price_sats: number;
  ai_score: number | null;
  ai_confidence: number | null;
  recommendation: string | null;
}> {
  return getDb().prepare('SELECT * FROM v_speculation_opportunities').all() as Array<{
    token_id: string;
    name: string | null;
    current_supply: number;
    current_price_sats: number;
    ai_score: number | null;
    ai_confidence: number | null;
    recommendation: string | null;
  }>;
}

// ── PoI Blocks ──────────────────────────────────────────────────────
// Cross-client compatible with Go ClawMiner block storage

export interface PoIBlock {
  hash: string;
  height: number;
  prev_hash: string;
  merkle_root: string;
  miner_address: string;
  timestamp: number;
  bits: number;
  nonce: number;
  version: number;
  item_count: number;
  items_json: string | null;
  is_own: number; // 0 or 1 (SQLite boolean)
  mint_txid: string | null;
  target_hex: string | null;
  source_peer: string | null;
  created_at: number;
}

export function insertPoIBlock(block: Omit<PoIBlock, 'created_at'>): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO poi_blocks
      (hash, height, prev_hash, merkle_root, miner_address, timestamp,
       bits, nonce, version, item_count, items_json, is_own, mint_txid,
       target_hex, source_peer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    block.hash, block.height, block.prev_hash, block.merkle_root,
    block.miner_address, block.timestamp,
    block.bits, block.nonce, block.version, block.item_count,
    block.items_json, block.is_own ? 1 : 0, block.mint_txid,
    block.target_hex, block.source_peer
  );
}

export function updateBlockMintTxid(hash: string, txid: string): void {
  getDb().prepare('UPDATE poi_blocks SET mint_txid = ? WHERE hash = ?').run(txid, hash);
}

export function getPoIBlockByHash(hash: string): PoIBlock | undefined {
  return getDb().prepare(`
    SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
      bits, nonce, version, item_count, items_json, is_own, mint_txid,
      target_hex, source_peer, created_at
    FROM poi_blocks WHERE hash = ?
  `).get(hash) as PoIBlock | undefined;
}

export function getLatestPoIBlock(): PoIBlock | undefined {
  return getDb().prepare(`
    SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
      bits, nonce, version, item_count, items_json, is_own, mint_txid,
      target_hex, source_peer, created_at
    FROM poi_blocks ORDER BY height DESC LIMIT 1
  `).get() as PoIBlock | undefined;
}

export function getPoIBlockCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM poi_blocks').get() as { count: number };
  return row.count;
}

export function getOwnBlockCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM poi_blocks WHERE is_own = 1').get() as { count: number };
  return row.count;
}

export function getRecentPoIBlocks(limit: number, offset = 0): PoIBlock[] {
  return getDb().prepare(`
    SELECT hash, height, prev_hash, merkle_root, miner_address, timestamp,
      bits, nonce, version, item_count, items_json, is_own, mint_txid,
      target_hex, source_peer, created_at
    FROM poi_blocks ORDER BY height DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as PoIBlock[];
}

export function getBlockTimestampsSince(sinceMs: number): number[] {
  const rows = getDb().prepare(`
    SELECT timestamp FROM poi_blocks
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
  `).all(sinceMs) as Array<{ timestamp: number }>;
  return rows.map(r => r.timestamp);
}

export function getChainTip(): { hash: string; height: number } | undefined {
  return getDb().prepare(
    'SELECT hash, height FROM poi_blocks ORDER BY height DESC LIMIT 1'
  ).get() as { hash: string; height: number } | undefined;
}
