/**
 * $pathd Daemon
 *
 * The core daemon that:
 * 1. INDEXES - Reads BSV blockchain, tracks $402 tokens
 * 2. VALIDATES - Confirms token ownership before serving
 * 3. SERVES - Delivers content to verified holders
 * 4. EARNS - Receives $402 rewards via PoW20
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Config } from './config.js';
import { Logger } from './logger.js';

interface TokenInfo {
  path: string;
  inscription_id: string;
  supply: number;
  price_sats: number;
  pricing_model: string;
  created_at: string;
}

interface IndexState {
  last_indexed_block: number;
  tokens: Map<string, TokenInfo>;
  last_indexed_at: string;
}

export class Daemon {
  private config: Config;
  private logger: Logger;
  private server: ReturnType<typeof createServer> | null = null;
  private state: IndexState;
  private startTime: number = 0;
  private isRunning = false;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.state = this.loadState();
  }

  /**
   * Start the full daemon (indexer + server)
   */
  async start(): Promise<void> {
    this.startTime = Date.now();
    this.isRunning = true;

    this.logger.info('');
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║                                                           ║');
    this.logger.info('║   $pathd - The Path 402 Token Protocol Daemon             ║');
    this.logger.info('║                                                           ║');
    this.logger.info('║   "PoW forces operators into the open.                    ║');
    this.logger.info('║    Big nodes can\'t hide."                                 ║');
    this.logger.info('║                                                           ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝');
    this.logger.info('');

    // Start indexer
    await this.startIndexer();

    // Start HTTP server
    await this.startServer();

    // Start mining if enabled
    if (this.config.powEnabled) {
      await this.startMining();
    }

    this.logger.info('');
    this.logger.success('$pathd is running');
    this.logger.info(`  HTTP:  http://localhost:${this.config.port}`);
    this.logger.info(`  Docs:  https://path402.com/docs/PATHD_ARCHITECTURE`);
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
   * Start the BSV indexer
   */
  async startIndexer(): Promise<void> {
    this.logger.info('Starting indexer...');
    this.logger.debug(`BSV node: ${this.config.bsvNode}`);
    this.logger.debug(`Last indexed block: ${this.state.last_indexed_block}`);

    // Initial index
    await this.indexTokens();

    // Schedule periodic indexing
    setInterval(async () => {
      if (this.isRunning) {
        await this.indexTokens();
      }
    }, 60000); // Every minute

    this.logger.success(`Indexer started (tracking ${this.state.tokens.size} tokens)`);
  }

  /**
   * Index $402 tokens from BSV blockchain
   */
  private async indexTokens(): Promise<void> {
    this.logger.debug('Indexing tokens...');

    try {
      // TODO: Implement actual BSV-21 token indexing
      // For now, we'll use mock data

      // In production, this would:
      // 1. Query BSV node for new blocks since last_indexed_block
      // 2. Parse transactions for $402 inscriptions
      // 3. Update token registry
      // 4. Track ownership UTXOs

      this.state.last_indexed_at = new Date().toISOString();
      this.saveState();
    } catch (error) {
      this.logger.error(`Indexing failed: ${error}`);
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-$402-Signature, X-$402-Pubkey');

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
    } else if (path === '/api/tokens') {
      this.handleTokenList(req, res);
    } else if (path.startsWith('/api/tokens/')) {
      this.handleTokenDetails(req, res, path);
    } else if (path === '/api/verify') {
      this.handleVerify(req, res);
    } else if (path.startsWith('/content/')) {
      this.handleContent(req, res, path);
    } else if (path === '/api/index' && req.method === 'POST') {
      this.handleTriggerIndex(req, res);
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
      status: 'healthy',
      indexed_block: this.state.last_indexed_block,
      tokens_tracked: this.state.tokens.size,
      uptime_seconds: uptimeSeconds,
      version: '0.1.0',
    }));
  }

  /**
   * Discovery endpoint (/.well-known/$402.json)
   */
  private handleDiscovery(_req: IncomingMessage, res: ServerResponse): void {
    const tokens = Array.from(this.state.tokens.values()).map(t => ({
      path: t.path,
      price_sats: t.price_sats,
      supply: t.supply,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      $402_version: '2.2',
      node: {
        id: `pathd-${this.config.port}`,
        stake: 0, // TODO: Track stake
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      },
      tokens,
    }));
  }

  /**
   * List all tokens
   */
  private handleTokenList(_req: IncomingMessage, res: ServerResponse): void {
    const tokens = Array.from(this.state.tokens.values());

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tokens }));
  }

  /**
   * Get token details
   */
  private handleTokenDetails(_req: IncomingMessage, res: ServerResponse, path: string): void {
    const tokenPath = decodeURIComponent(path.replace('/api/tokens/', ''));
    const token = this.state.tokens.get(tokenPath);

    if (!token) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(token));
  }

  /**
   * Verify token ownership
   */
  private handleVerify(req: IncomingMessage, res: ServerResponse): void {
    // TODO: Implement actual signature verification against BSV UTXOs
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { path, signature, pubkey } = JSON.parse(body);

        // Mock verification - always succeeds for now
        // In production: verify signature against token UTXO ownership
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access: true,
          tokens_held: 1, // TODO: Look up actual balance
          content_url: `/content/${encodeURIComponent(path)}`,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  /**
   * Serve content to verified token holders
   */
  private handleContent(req: IncomingMessage, res: ServerResponse, path: string): void {
    const signature = req.headers['x-$402-signature'];
    const pubkey = req.headers['x-$402-pubkey'];

    if (!signature || !pubkey) {
      // Return 402 Payment Required
      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-$402-Version': '2.2.0',
        'X-$402-Price': '500',
        'X-$402-Token': path.replace('/content/', ''),
        'X-$402-Model': 'sqrt_decay',
      });
      res.end(JSON.stringify({
        error: 'Payment Required',
        price_sats: 500,
        token: path.replace('/content/', ''),
        accepts: ['bsv'],
        buy_url: 'https://path402.com/token',
      }));
      return;
    }

    // TODO: Verify signature before serving
    // For now, serve mock content

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      content: 'This is gated content. In production, this would be the actual content.',
      token: path.replace('/content/', ''),
      served_at: new Date().toISOString(),
    }));
  }

  /**
   * Trigger manual indexing
   */
  private async handleTriggerIndex(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    await this.indexTokens();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, indexed_at: this.state.last_indexed_at }));
  }

  /**
   * Prometheus-compatible metrics
   */
  private handleMetrics(_req: IncomingMessage, res: ServerResponse): void {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const metrics = [
      `# HELP pathd_indexed_blocks_total Total blocks indexed`,
      `# TYPE pathd_indexed_blocks_total counter`,
      `pathd_indexed_blocks_total ${this.state.last_indexed_block}`,
      ``,
      `# HELP pathd_tokens_tracked Number of tokens being tracked`,
      `# TYPE pathd_tokens_tracked gauge`,
      `pathd_tokens_tracked ${this.state.tokens.size}`,
      ``,
      `# HELP pathd_uptime_seconds Daemon uptime in seconds`,
      `# TYPE pathd_uptime_seconds counter`,
      `pathd_uptime_seconds ${uptimeSeconds}`,
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
    this.logger.info('PoW20 Mining Roadmap:');
    this.logger.info('  1. Solve hash puzzle: double_sha256(solution) < difficulty');
    this.logger.info('  2. Submit proof to earn $402 tokens');
    this.logger.info('  3. Requires stake to participate');
    this.logger.info('');
    this.logger.info('WHY PoW?');
    this.logger.info('  Not to reward work - to force operators into the open.');
    this.logger.info('  Computational cost → Capital investment → Scale');
    this.logger.info('  Scale → Physical presence → Regulatory visibility');
    this.logger.info('  Big nodes can\'t hide. Big nodes must identify themselves.');
    this.logger.info('');

    // TODO: Implement actual PoW20 mining
    // 1. Get current difficulty from network
    // 2. Start mining threads
    // 3. Submit valid solutions
    // 4. Claim $402 rewards
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
          last_indexed_block: data.last_indexed_block || 0,
          tokens: new Map(Object.entries(data.tokens || {})),
          last_indexed_at: data.last_indexed_at || '',
        };
      } catch {
        // Invalid state file
      }
    }

    return {
      last_indexed_block: 0,
      tokens: new Map(),
      last_indexed_at: '',
    };
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    const statePath = join(this.config.dataDir, 'state.json');
    const data = {
      last_indexed_block: this.state.last_indexed_block,
      tokens: Object.fromEntries(this.state.tokens),
      last_indexed_at: this.state.last_indexed_at,
    };
    writeFileSync(statePath, JSON.stringify(data, null, 2));
  }
}
