/**
 * path402d Daemon
 *
 * The core daemon that:
 * 1. INDEXES - Reads from Supabase (populated by indexer on Hetzner)
 * 2. VALIDATES - Confirms token ownership via database lookup
 * 3. SERVES - Delivers content to verified holders
 * 4. EARNS - Receives $402 rewards via PoW20 (future)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Config } from './config.js';
import { Logger } from './logger.js';
import {
  initDatabase,
  getTokenStats,
  getHolders,
  getHolder,
  hasTokens,
  verifyTokenOwnership,
  getRecentTransfers,
  type TokenStats,
  type Holder,
} from '../services/database.js';
import { initIdentity, getPublicKey, getAddress, signStamp } from '../services/wallet.js';
import { GossipNode } from '../gossip/node.js';

interface IndexState {
  last_sync_at: string;
  token_stats: TokenStats | null;
  holder_count: number;
}

export class Daemon {
  private config: Config;
  private logger: Logger;
  private server: ReturnType<typeof createServer> | null = null;
  private gossip: GossipNode | null = null;
  private state: IndexState;
  private startTime: number = 0;
  private isRunning = false;
  private dbConnected = false;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.state = {
      last_sync_at: '',
      token_stats: null,
      holder_count: 0,
    };
  }

  /**
   * Start the full daemon (indexer + server)
   */
  async start(): Promise<void> {
    this.startTime = Date.now();
    this.isRunning = true;

    // Initialize identity
    initIdentity(this.config.walletKey);

    // Start gossip node
    this.gossip = new GossipNode({
      port: 4020, // Default gossip port
      verifyOnChain: true
    });
    await this.gossip.start();

    this.logger.info('');
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║                                                           ║');
    this.logger.info('║   path402d - The Path 402 Token Protocol Daemon             ║');
    this.logger.info('║                                                           ║');
    this.logger.info('║   Identity: ' + getAddress().padEnd(46) + '║');
    this.logger.info('║   Pubkey:   ' + (getPublicKey().slice(0, 46) + '...').padEnd(46) + '║');
    this.logger.info('║                                                           ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝');
    this.logger.info('');

    // Connect to database
    await this.connectDatabase();

    // Initial sync from database
    await this.syncFromDatabase();

    // Start HTTP server
    await this.startServer();

    // Schedule periodic sync
    setInterval(async () => {
      if (this.isRunning) {
        await this.syncFromDatabase();
      }
    }, 30000); // Every 30 seconds

    // Start mining if enabled
    if (this.config.powEnabled) {
      await this.startMining();
    }

    this.logger.info('');
    this.logger.success('path402d is running');
    this.logger.info(`  HTTP:    http://localhost:${this.config.port}`);
    this.logger.info(`  DB:      ${this.dbConnected ? 'Connected' : 'Disconnected'}`);
    this.logger.info(`  Supply:  ${this.state.token_stats?.circulatingSupply?.toLocaleString() || 'N/A'} tokens`);
    this.logger.info(`  Holders: ${this.state.holder_count}`);
    this.logger.info(`  Price:   ${this.state.token_stats?.currentPriceSats || 'N/A'} sats`);
    this.logger.info('');
    this.logger.info('Press Ctrl+C to stop');
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.saveState();

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.logger.info('Daemon stopped');
  }

  /**
   * Connect to Supabase database
   */
  private async connectDatabase(): Promise<void> {
    this.logger.info('Connecting to database...');

    try {
      // Initialize database with environment variables
      initDatabase();
      this.dbConnected = true;
      this.logger.success('Database connected');
    } catch (error) {
      this.logger.error(`Database connection failed: ${error}`);
      this.dbConnected = false;
    }
  }

  /**
   * Sync state from database (replaces old indexTokens)
   */
  private async syncFromDatabase(): Promise<void> {
    if (!this.dbConnected) {
      this.logger.debug('Skipping sync - database not connected');
      return;
    }

    this.logger.debug('Syncing from database...');

    try {
      // Get token stats
      const stats = await getTokenStats();
      if (stats) {
        this.state.token_stats = stats;
      }

      // Get holder count
      const holders = await getHolders();
      this.state.holder_count = holders.length;

      this.state.last_sync_at = new Date().toISOString();
      this.saveState();

      this.logger.debug(`Synced: ${stats?.circulatingSupply || 0} supply, ${holders.length} holders`);
    } catch (error) {
      this.logger.error(`Sync failed: ${error}`);
    }
  }

  /**
   * Start the HTTP content server
   */
  async startServer(): Promise<void> {
    this.logger.info('Starting HTTP server...');

    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, () => {
        this.logger.success(`HTTP server listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
    const path = url.pathname;

    this.logger.debug(`${req.method} ${path}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-$402-Signature, X-$402-Pubkey, X-$402-Address');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Routes
    if (path === '/health') {
      this.handleHealth(req, res);
    } else if (path === '/.well-known/$402.json') {
      this.handleDiscovery(req, res);
    } else if (path === '/api/stats') {
      this.handleStats(req, res);
    } else if (path === '/api/holders') {
      this.handleHolders(req, res);
    } else if (path === '/api/verify') {
      this.handleVerify(req, res);
    } else if (path.startsWith('/api/holder/')) {
      this.handleHolderDetails(req, res, path);
    } else if (path.startsWith('/content/')) {
      this.handleContent(req, res, path);
    } else if (path === '/api/sync' && req.method === 'POST') {
      this.handleTriggerSync(req, res);
    } else if (path === '/metrics') {
      this.handleMetrics(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Health check endpoint
   */
  private handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: this.dbConnected ? 'healthy' : 'degraded',
      database: this.dbConnected ? 'connected' : 'disconnected',
      circulating_supply: this.state.token_stats?.circulatingSupply || 0,
      holder_count: this.state.holder_count,
      current_price_sats: this.state.token_stats?.currentPriceSats || 0,
      uptime_seconds: uptimeSeconds,
      last_sync_at: this.state.last_sync_at,
      version: '1.3.1',
      identity: {
        address: getAddress(),
        pubkey: getPublicKey(),
        brc_compliance: ['BRC-100', 'BRC-103', 'BRC-104', 'BRC-105']
      }
    }));
  }

  /**
   * Discovery endpoint (/.well-known/$402.json)
   */
  private handleDiscovery(_req: IncomingMessage, res: ServerResponse): void {
    const stats = this.state.token_stats;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      $402_version: '3.0.0',
      protocol: '$402',
      standards: {
        payment: 'BRC-105',
        auth: 'BRC-104',
        identity: 'BRC-103',
        wallet: 'BRC-100'
      },
      token: {
        name: 'PATH402',
        ticker: 'PATH402.com',
        treasury_address: stats?.treasuryAddress || '1BrbnQon4uZPSxNwt19ozwtgHPDbgvaeD1',
        total_supply: stats?.totalSupply || 1_000_000_000,
        circulating_supply: stats?.circulatingSupply || 0,
        current_price_sats: stats?.currentPriceSats || 500,
        pricing_model: 'sqrt_decay',
        base_price_sats: 500,
      },
      node: {
        id: `path402d-${this.config.port}`,
        address: getAddress(),
        pubkey: getPublicKey(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        holder_count: this.state.holder_count,
      },
      buy_url: 'https://path402.com/token',
    }));
  }

  /**
   * Token stats endpoint
   */
  private async handleStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Fetch fresh stats
    const stats = await getTokenStats();

    if (!stats) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
  }

  /**
   * List all holders
   */
  private async handleHolders(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const holders = await getHolders();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: holders.length,
      holders: holders.map(h => ({
        handle: h.handle,
        balance: h.balance,
        staked: h.staked_balance,
        provider: h.provider,
      })),
    }));
  }

  /**
   * Get holder details
   */
  private async handleHolderDetails(_req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const addressOrHandle = decodeURIComponent(path.replace('/api/holder/', ''));
    const holder = await getHolder(addressOrHandle);

    if (!holder) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Holder not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      handle: holder.handle,
      balance: holder.balance,
      staked_balance: holder.staked_balance,
      total_purchased: holder.total_purchased,
      total_dividends: holder.total_dividends,
      provider: holder.provider,
      created_at: holder.created_at,
    }));
  }

  /**
   * Verify token ownership - REAL verification against database
   */
  private async handleVerify(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { address, handle, signature, pubkey } = JSON.parse(body);

        // Look up holder by address or handle
        const identifier = address || handle;
        if (!identifier) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'address or handle required' }));
          return;
        }

        // Check if they have tokens
        const holder = await verifyTokenOwnership(identifier);

        if (!holder) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access: false,
            reason: 'No tokens held',
            buy_url: 'https://path402.com/token',
          }));
          return;
        }

        // TODO: Verify signature against pubkey
        // For now, having tokens = access granted
        // In production: verify signature proves ownership of the address

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access: true,
          holder: holder.handle || holder.address,
          tokens_held: holder.balance,
          staked: holder.staked_balance,
          content_url: '/content/$PATH402',
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  /**
   * Serve content to verified token holders
   * 
   * ALIGNMENT (Bob's suggestion):
   * 1. BRC-105 for 402 challenge
   * 2. BRC-104 for multi-auth/stamping
   */
  private async handleContent(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // BRC-104 headers
    const address = req.headers['x-bsv-auth-identity-key'] as string; // Using identity key as address for simplicity in core
    const signature = req.headers['x-bsv-auth-signature'] as string;
    const nonce = req.headers['x-bsv-auth-nonce'] as string;

    if (!address) {
      // BRC-105 Payment Required
      const stats = this.state.token_stats;
      const price = stats?.currentPriceSats || 500;
      const derivationPrefix = Math.random().toString(36).substring(2, 12);

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        // BRC-105 Normative Headers
        'x-bsv-payment-satoshis-required': String(price),
        'x-bsv-payment-derivation-prefix': derivationPrefix,
        'x-bsv-payment-version': '1.0',
        // Historical/UX Fallback
        'X-$402-Version': '3.0.0',
        'X-$402-Token': 'PATH402.com'
      });

      res.end(JSON.stringify({
        error: 'Payment Required',
        price_sats: price,
        token: 'PATH402.com',
        derivationPrefix,
        buy_url: 'https://path402.com/token',
        notice: 'Support BRC-105 compliant wallets'
      }));
      return;
    }

    // Verify token ownership
    const holder = await verifyTokenOwnership(address);

    if (!holder) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Access denied',
        reason: 'Identity does not hold required tokens',
        buy_url: 'https://path402.com/token',
      }));
      return;
    }

    // Access granted - serve content
    const timestamp = new Date().toISOString();
    const stampData = `${address}:${path}:${timestamp}:${nonce || ''}`;
    const indexerSignature = signStamp(stampData);

    // Broadcast stamp to gossip network (Proof of Serve)
    if (this.gossip) {
      this.gossip.broadcastTicketStamp({
        token_id: 'PATH402.com',
        address,
        path,
        timestamp,
        indexer_pubkey: getPublicKey(),
        indexer_signature: indexerSignature
      });
    }

    // BRC-104 Auth Response Headers (The "Indexer Stamp")
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'x-bsv-auth-identity-key': getPublicKey(),
      'x-bsv-auth-signature': indexerSignature,
      'x-bsv-auth-nonce': nonce || '',
      'x-bsv-auth-your-nonce': Math.random().toString(36).substring(2, 12),
      'x-bsv-auth-version': '1.0'
    });

    res.end(JSON.stringify({
      access: true,
      holder: holder.handle || address,
      tokens_held: holder.balance,
      content: `Welcome to $PATH402 gated content. You hold ${holder.balance.toLocaleString()} tokens.`,
      served_at: timestamp,
      indexer_stamp: {
        pubkey: getPublicKey(),
        signature: indexerSignature,
        data: stampData
      }
    }));
  }

  /**
   * Trigger manual sync
   */
  private async handleTriggerSync(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    await this.syncFromDatabase();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, synced_at: this.state.last_sync_at }));
  }

  /**
   * Prometheus-compatible metrics
   */
  private handleMetrics(_req: IncomingMessage, res: ServerResponse): void {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const stats = this.state.token_stats;

    const metrics = [
      `# HELP pathd_circulating_supply Total tokens in circulation`,
      `# TYPE pathd_circulating_supply gauge`,
      `pathd_circulating_supply ${stats?.circulatingSupply || 0}`,
      ``,
      `# HELP pathd_holder_count Number of token holders`,
      `# TYPE pathd_holder_count gauge`,
      `pathd_holder_count ${this.state.holder_count}`,
      ``,
      `# HELP pathd_current_price_sats Current token price in satoshis`,
      `# TYPE pathd_current_price_sats gauge`,
      `pathd_current_price_sats ${stats?.currentPriceSats || 0}`,
      ``,
      `# HELP pathd_total_revenue_sats Total revenue in satoshis`,
      `# TYPE pathd_total_revenue_sats counter`,
      `pathd_total_revenue_sats ${stats?.totalRevenueSats || 0}`,
      ``,
      `# HELP pathd_uptime_seconds Daemon uptime in seconds`,
      `# TYPE pathd_uptime_seconds counter`,
      `pathd_uptime_seconds ${uptimeSeconds}`,
      ``,
      `# HELP pathd_database_connected Database connection status`,
      `# TYPE pathd_database_connected gauge`,
      `pathd_database_connected ${this.dbConnected ? 1 : 0}`,
    ].join('\n');

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(metrics);
  }

  /**
   * Start PoW20 mining
   */
  async startMining(): Promise<void> {
    this.logger.warn('PoW20 mining is not yet implemented');
    this.logger.info('');
    this.logger.info('WHY PoW?');
    this.logger.info('  Not to reward work - to force operators into the open.');
    this.logger.info('  Computational cost → Capital investment → Scale');
    this.logger.info('  Scale → Physical presence → Regulatory visibility');
    this.logger.info('  Big nodes can\'t hide. Big nodes must identify themselves.');
    this.logger.info('');
  }

  /**
   * Load state from disk
   */
  private loadState(): IndexState {
    const statePath = join(this.config.dataDir, 'state.json');

    if (existsSync(statePath)) {
      try {
        const content = readFileSync(statePath, 'utf-8');
        const data = JSON.parse(content);
        return {
          last_sync_at: data.last_sync_at || '',
          token_stats: data.token_stats || null,
          holder_count: data.holder_count || 0,
        };
      } catch {
        // Invalid state file
      }
    }

    return {
      last_sync_at: '',
      token_stats: null,
      holder_count: 0,
    };
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    const statePath = join(this.config.dataDir, 'state.json');
    writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }
}
