/**
 * $402 Client Web GUI Server
 *
 * Serves the $402 web GUI for the Path402 client.
 * Shows node status, portfolio, peers, and speculation controls.
 *
 * Uses Express with optional BRC-105 (HTTP 402) payment middleware
 * for content monetization when walletKey is configured.
 */

import type { Server } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import express, { Request, Response, NextFunction } from 'express';
import { Path402Agent } from '../client/agent.js';
import {
  getAllTokens,
  getPortfolio,
  getActivePeers,
  getAllPeers,
  getSpeculationOpportunities,
  getAllCachedContent,
  getContentCacheStats,
  getContentByHash,
  logServe
} from '../db/index.js';

// BRC-105 imports — used conditionally when walletKey is present
let createAuthMiddleware: typeof import('@bsv/auth-express-middleware').createAuthMiddleware | null = null;
let createPaymentMiddleware: typeof import('@bsv/payment-express-middleware').createPaymentMiddleware | null = null;
let PrivateKey: typeof import('@bsv/sdk').PrivateKey | null = null;
let ProtoWallet: typeof import('@bsv/sdk').ProtoWallet | null = null;

// Lazy-load BSV deps so the server still starts without them
async function loadBsvDeps(): Promise<boolean> {
  try {
    const sdk = await import('@bsv/sdk');
    PrivateKey = sdk.PrivateKey;
    ProtoWallet = sdk.ProtoWallet;
    const authMw = await import('@bsv/auth-express-middleware');
    createAuthMiddleware = authMw.createAuthMiddleware;
    const payMw = await import('@bsv/payment-express-middleware');
    createPaymentMiddleware = payMw.createPaymentMiddleware;
    return true;
  } catch (e) {
    console.warn('[GUI] BRC-105 deps not available, payment gates disabled:', (e as Error).message);
    return false;
  }
}

export class GUIServer {
  private agent: Path402Agent;
  private port: number;
  private server: Server | null = null;
  private uiPath: string | null = null;
  private walletKey: string | undefined;

  constructor(agent: Path402Agent, port = 4021, uiPath: string | null = null, walletKey?: string) {
    this.agent = agent;
    this.port = port;
    this.uiPath = uiPath;
    this.walletKey = walletKey;
  }

  async start(): Promise<void> {
    const app = express();

    // ── CORS ──────────────────────────────────────────────────────
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers',
        'Content-Type, x-bsv-auth-version, x-bsv-auth-identity-key, x-bsv-auth-nonce, ' +
        'x-bsv-auth-your-nonce, x-bsv-auth-signature, x-bsv-auth-certificates, ' +
        'x-bsv-payment, x-bsv-payment-version, x-bsv-payment-satoshis-required, ' +
        'x-bsv-payment-derivation-prefix');
      res.setHeader('Access-Control-Expose-Headers',
        'x-bsv-auth-version, x-bsv-auth-identity-key, x-bsv-auth-nonce, ' +
        'x-bsv-auth-your-nonce, x-bsv-auth-signature, x-bsv-auth-certificates, ' +
        'x-bsv-payment-version, x-bsv-payment-satoshis-required, ' +
        'x-bsv-payment-derivation-prefix');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // JSON body parsing
    app.use(express.json());

    // ── BRC-105 Middleware (only when walletKey is configured) ────
    if (this.walletKey) {
      const loaded = await loadBsvDeps();
      if (loaded && PrivateKey && ProtoWallet && createAuthMiddleware && createPaymentMiddleware) {
        try {
          // walletKey can be WIF (L/K/5 prefix) or hex — auto-detect
          const pk = this.walletKey.match(/^[5KL]/)
            ? PrivateKey.fromWif(this.walletKey)
            : new PrivateKey(this.walletKey, 'hex');
          const serverWallet = new ProtoWallet(pk);

          app.use(createAuthMiddleware({
            wallet: serverWallet as any,
            allowUnauthenticated: true
          }));

          app.use(createPaymentMiddleware({
            wallet: serverWallet as any,
            calculateRequestPrice: (req: any) => {
              // Only charge for content serve routes
              if (req.path.startsWith('/api/content/serve/')) {
                const hash = req.path.replace('/api/content/serve/', '');
                const meta = getContentByHash(hash);
                return meta?.price_paid_sats ?? 100;
              }
              return 0; // All other routes are free
            }
          }));

          console.log('[GUI] BRC-105 payment gates enabled');
        } catch (e) {
          console.error('[GUI] Failed to initialize BRC-105 wallet:', (e as Error).message);
        }
      }
    }

    // ── API Routes ───────────────────────────────────────────────

    app.get('/api/status', (_req: Request, res: Response) => {
      res.json(this.agent.getStatus());
    });

    app.get('/api/tokens', (_req: Request, res: Response) => {
      res.json(getAllTokens());
    });

    app.get('/api/marketplace', (_req: Request, res: Response) => {
      const bridge = this.agent.getMarketplaceBridge?.();
      if (!bridge) {
        res.json({ tokens: [], stats: null, bsvPrice: null, lastSyncedAt: 0 });
        return;
      }
      res.json(bridge.getData());
    });

    app.get('/api/portfolio', (_req: Request, res: Response) => {
      res.json(getPortfolio());
    });

    app.get('/api/peers', (_req: Request, res: Response) => {
      res.json({
        active: getActivePeers(),
        all: getAllPeers()
      });
    });

    app.get('/api/opportunities', (_req: Request, res: Response) => {
      res.json(getSpeculationOpportunities());
    });

    app.post('/api/speculation/enable', (_req: Request, res: Response) => {
      this.agent.setSpeculation(true);
      res.json({ success: true, enabled: true });
    });

    app.post('/api/speculation/disable', (_req: Request, res: Response) => {
      this.agent.setSpeculation(false);
      res.json({ success: true, enabled: false });
    });

    app.post('/api/auto/enable', (_req: Request, res: Response) => {
      this.agent.setAutoAcquire(true);
      res.json({ success: true, autoAcquire: true });
    });

    app.post('/api/auto/disable', (_req: Request, res: Response) => {
      this.agent.setAutoAcquire(false);
      res.json({ success: true, autoAcquire: false });
    });

    app.get('/api/content', (_req: Request, res: Response) => {
      res.json(getAllCachedContent());
    });

    app.get('/api/content/stats', (_req: Request, res: Response) => {
      res.json(getContentCacheStats());
    });

    app.get('/api/config', (_req: Request, res: Response) => {
      this.handleConfigGet(res);
    });

    app.post('/api/config', (req: Request, res: Response) => {
      this.handleConfigSet(req, res);
    });

    app.post('/api/restart', (_req: Request, res: Response) => {
      this.agent.emit('restart_requested');
      res.json({ success: true, message: 'Restart initiated' });
    });

    // Content serve — the paid route
    app.get('/api/content/serve/:hash', async (req: Request, res: Response) => {
      const hash = req.params.hash as string;
      await this.handleContentServe(hash, req, res);
    });

    // ── Static Files + SPA Fallback ──────────────────────────────
    if (this.uiPath) {
      app.use(express.static(this.uiPath, { extensions: ['html'] }));

      // SPA fallback: serve index.html for unmatched routes
      app.get('*', (req: Request, res: Response) => {
        // Don't intercept API 404s
        if (req.path.startsWith('/api/')) {
          res.status(404).json({ error: 'API endpoint not found' });
          return;
        }
        const indexPath = join(this.uiPath!, 'index.html');
        if (existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.type('html').send(this.getEmbeddedHTML());
        }
      });
    } else {
      // No static UI — serve embedded HTML at root
      app.get('/', (_req: Request, res: Response) => {
        res.type('html').send(this.getEmbeddedHTML());
      });
    }

    // ── Error handler ────────────────────────────────────────────
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[GUI] Request error:', err);
      res.status(500).json({ error: err.message });
    });

    // ── Start ────────────────────────────────────────────────────
    this.server = app.listen(this.port, () => {
      console.log(`[GUI] $402 available at \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
      if (this.uiPath) {
        console.log(`[GUI] Serving static UI from: ${this.uiPath}`);
      }
    });
  }

  stop(): void {
    this.server?.close();
  }

  private getConfigPath(): string {
    return join(homedir(), '.pathd', 'config.json');
  }

  private readConfigFile(): Record<string, unknown> {
    const configPath = this.getConfigPath();
    if (!existsSync(configPath)) return {};
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private handleConfigGet(res: Response): void {
    const config = this.readConfigFile();
    // Mask walletKey for security — only show last 6 chars
    const walletKey = config.walletKey as string | undefined;
    const masked = walletKey ? `***${walletKey.slice(-6)}` : undefined;

    res.json({
      walletKey: masked,
      walletKeySet: !!walletKey,
      tokenId: config.tokenId || null,
      bootstrapPeers: config.bootstrapPeers || [],
      powEnabled: config.powEnabled ?? false,
      powThreads: config.powThreads ?? 4,
    });
  }

  private handleConfigSet(req: Request, res: Response): void {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    const configPath = this.getConfigPath();
    const dataDir = dirname(configPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const existing = this.readConfigFile();

    // Merge allowed fields
    const allowed = ['walletKey', 'tokenId', 'bootstrapPeers', 'powEnabled', 'powThreads'];
    for (const key of allowed) {
      if (key in updates) {
        if (updates[key] === null || updates[key] === '') {
          delete existing[key];
        } else {
          existing[key] = updates[key];
        }
      }
    }

    writeFileSync(configPath, JSON.stringify(existing, null, 2));
    res.json({ success: true, restart_required: true });
  }

  private async handleContentServe(hash: string, _req: Request, res: Response): Promise<void> {
    const contentStore = this.agent.getContentStore?.();
    if (!contentStore) {
      res.status(503).json({ error: 'Content store not available' });
      return;
    }

    const meta = getContentByHash(hash);
    if (!meta) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }

    const stream = await contentStore.getStream(hash);
    if (!stream) {
      res.status(404).json({ error: 'Content file not found' });
      return;
    }

    // Log the serve event
    try {
      const authIdentity = (_req as any).auth?.identityKey;
      logServe({
        token_id: meta.token_id,
        requester_address: typeof authIdentity === 'string' && authIdentity !== 'unknown' ? authIdentity : undefined,
        revenue_sats: meta.price_paid_sats ?? 0,
      });
    } catch {
      // Don't fail the serve if logging fails
    }

    res.writeHead(200, {
      'Content-Type': meta.content_type || 'application/octet-stream',
      'Content-Length': String(meta.content_size || 0),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400'
    });

    stream.pipe(res);
  }

  private getEmbeddedHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$402_AGENT // 4021</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    /* INDUSTRIAL THEME (Core Agent) - MATCHING CLIENT AESTHETIC */
    :root {
      --bg: #000000;
      --bg-panel: #09090b;     /* zinc-950 */
      --border: #27272a;       /* zinc-800 */
      --border-light: #3f3f46; /* zinc-700 */
      --text: #ffffff;
      --text-dim: #71717a;     /* zinc-500 */
      --green: #22c55e;
      --red: #ef4444;
      --white: #ffffff;
      --zinc-100: #f4f4f5;
      --zinc-900: #18181b;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 40px;
      line-height: 1.4;
      font-size: 13px;
    }

    /* TYPOGRAPHY */
    h1, h2, h3 {
      text-transform: uppercase;
      letter-spacing: -0.05em;
      font-weight: 900;
      font-family: 'Inter', sans-serif;
    }

    .mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: var(--text-dim);
      font-weight: bold;
      margin-bottom: 6px;
      display: block;
      font-family: 'Inter', sans-serif;
    }

    /* LAYOUT */
    .header {
      margin-bottom: 60px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .logo {
      font-size: 64px;
      line-height: 0.9;
      font-weight: 900;
      letter-spacing: -0.06em;
      margin-bottom: 15px;
      color: var(--white);
    }

    .logo span {
        color: var(--border-light);
    }

    .subtitle {
      color: var(--text-dim);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: bold;
    }

    .warning-banner {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      color: var(--text-dim);
      padding: 12px 20px;
      margin-bottom: 40px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
    }

    .warning-banner a {
      color: var(--white);
      text-decoration: none;
      font-weight: bold;
      border-bottom: 1px solid var(--border-light);
    }

    .warning-banner a:hover {
        border-bottom-color: var(--white);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 32px;
      max-width: 1800px;
      margin: 0 auto;
    }

    /* CARDS */
    .card {
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 32px;
      position: relative;
      transition: border-color 0.2s;
    }

    .card:hover {
      border-color: var(--text-dim);
    }

    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
      font-weight: bold;
      font-family: 'Inter', sans-serif;
    }

    /* STATS */
    .stat {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px solid var(--zinc-900);
    }

    .stat:last-child {
      border-bottom: none;
    }

    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: bold;
      font-size: 16px;
      color: var(--text-dim);
    }

    .stat-value.highlight { color: var(--white); }
    .stat-value.positive { color: var(--green); }
    .stat-value.negative { color: var(--red); }

    /* CONTROLS */
    .toggle-group {
      display: flex;
      gap: 1px;
      background: var(--border);
      margin-top: 24px;
      border: 1px solid var(--border);
    }

    .toggle-btn {
      flex: 1;
      padding: 16px;
      background: var(--bg);
      color: var(--text-dim);
      border: none;
      cursor: pointer;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: all 0.2s;
      font-weight: bold;
    }

    .toggle-btn:hover {
      background: var(--bg-panel);
      color: var(--white);
    }

    .toggle-btn.active {
      background: var(--white);
      color: var(--bg);
    }

    .toggle-btn.active.danger {
      background: var(--red);
      color: var(--white);
    }

    /* LISTS */
    .list-container {
      max-height: 240px;
      overflow-y: auto;
      margin-top: -10px;
    }

    .list-item {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    .list-item:last-child { border-bottom: none; }

    .status-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: var(--text-dim);
      margin-right: 8px;
    }
    .status-dot.online { background: var(--green); box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }

    .empty {
      padding: 24px;
      text-align: center;
      color: var(--text-dim);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      border: 1px dashed var(--border);
      margin-top: 16px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* TABS */
    .tabs {
      display: flex;
      gap: 32px;
      margin-bottom: 48px;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      background: none;
      border: none;
      color: var(--text-dim);
      padding: 0 0 16px 0;
      cursor: pointer;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      font-weight: bold;
    }

    .tab:hover { color: var(--white); }
    .tab.active {
      color: var(--white);
      border-bottom-color: var(--white);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* UTILS */
    .refresh-btn {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 48px;
        height: 48px;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--white);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        font-family: 'JetBrains Mono', monospace;
        font-size: 20px;
    }
    .refresh-btn:hover { background: var(--white); color: var(--bg); }
    .refresh-btn.loading { animation: spin 1s linear infinite; }

    @keyframes spin { 100% { transform: rotate(360deg); } }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

  </style>
</head>
<body>
  <div class="warning-banner">
    <div>
    <span style="color: var(--green)">●</span>&nbsp;
    LIGHTWEIGHT AGENT INTERFACE (CORE)
    </div>
    <div>
      FOR FULL EXPERIENCE USE <a href="http://localhost:4023">DESKTOP CLIENT (:4023)</a>
    </div>
  </div>

  <div class="header">
    <div>
      <div class="logo">$402_AGENT</div>
      <div class="subtitle">AUTONOMOUS NODE OPERATOR · PORT 4021</div>
    </div>
    <div style="text-align: right">
        <div class="label">SYSTEM STATUS</div>
        <div id="status-display" style="color: var(--green)">ONLINE</div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="tabs">
    <button class="tab active" onclick="showTab('dashboard')">DATA_STREAM</button>
    <button class="tab" onclick="showTab('calls')">COMMS.LINK</button>
    <button class="tab" onclick="showTab('mytoken')">TOKEN.MINT</button>
    <button class="tab" onclick="showTab('staking')">STAKING.POOL</button>
  </div>

  <!-- Dashboard Tab -->
  <div id="tab-dashboard" class="tab-content active">
  <div class="grid">
    <!-- Node Status -->
    <div class="card">
      <div class="card-title">SYSTEM_METRICS</div>
      <div class="stat">
        <span class="label">NODE ID</span>
        <span class="stat-value highlight" id="node-id">Initializing...</span>
      </div>
      <div class="stat">
        <span class="label">UPTIME</span>
        <span class="stat-value" id="uptime">-</span>
      </div>
      <div class="stat">
        <span class="label">GOSSIP PORT</span>
        <span class="stat-value">4020</span>
      </div>
    </div>

    <!-- Network -->
    <div class="card">
      <div class="card-title">NETWORK_TOPOLOGY</div>
      <div class="stat">
        <span class="label">PEERS CONNECTED</span>
        <span class="stat-value highlight" id="peers-connected">0</span>
      </div>
      <div class="stat">
        <span class="label">KNOWN PEERS</span>
        <span class="stat-value" id="peers-known">0</span>
      </div>
      <div class="list-container" id="peer-list" style="margin-top: 15px">
        <div class="empty">Scanning for peers...</div>
      </div>
    </div>

    <!-- Portfolio -->
    <div class="card">
      <div class="card-title">ASSET_ALLOCATION</div>
      <div class="stat">
        <span class="label">NET LIQUIDITY</span>
        <span class="stat-value highlight" id="total-value">0 SAT</span>
      </div>
      <div class="stat">
        <span class="label">TOTAL ALPHA (P&L)</span>
        <span class="stat-value" id="pnl">0 SAT</span>
      </div>
      <div class="list-container" id="holdings" style="margin-top: 15px">
        <div class="empty">Wallet Empty</div>
      </div>
    </div>

    <!-- Speculation -->
    <div class="card">
      <div class="card-title">AGENT_CONTROL</div>
      <div class="stat">
        <span class="label">STRATEGY</span>
        <span class="stat-value highlight" id="strategy">early_adopter</span>
      </div>
      <div class="stat">
        <span class="label">BUDGET AVAIL</span>
        <span class="stat-value" id="budget">0 SAT</span>
      </div>
      <div class="toggle-group">
        <button class="toggle-btn" id="speculation-btn" onclick="toggleSpeculation()">
          SPECULATION: OFF
        </button>
        <button class="toggle-btn" id="auto-btn" onclick="toggleAuto()">
          AUTO-ACQUIRE: OFF
        </button>
      </div>
      <div class="label" style="margin-top: 15px">OPPORTUNITIES DETECTED</div>
      <div class="list-container" id="opportunities">
        <div class="empty">No signals</div>
      </div>
    </div>
  </div>
  </div>

  <!-- Calls Tab (Placeholder) -->
  <div id="tab-calls" class="tab-content">
    <div class="grid" style="place-items: center; height: 400px;">
        <div class="empty" style="border: 1px solid var(--border); padding: 40px;">
            <h3>COMMS MODULE OFFLINE</h3>
            <p style="margin-top: 10px; color: var(--text-dim)">Video uplink requires standard client connection (port 4022).</p>
        </div>
    </div>
  </div>

  <!-- Mint Tab (Placeholder) -->
  <div id="tab-mytoken" class="tab-content">
    <div class="grid" style="place-items: center; height: 400px;">
        <div class="empty" style="border: 1px solid var(--border); padding: 40px;">
            <h3>MINTING FACILITY LOCKED</h3>
            <p style="margin-top: 10px; color: var(--text-dim)">Token generation requires identity verification in main client.</p>
        </div>
    </div>
  </div>

   <!-- Staking Tab (Placeholder) -->
  <div id="tab-staking" class="tab-content">
    <div class="grid" style="place-items: center; height: 400px;">
        <div class="empty" style="border: 1px solid var(--border); padding: 40px;">
            <h3>STAKING POOL EMPTY</h3>
            <p style="margin-top: 10px; color: var(--text-dim)">No active yield farms detected.</p>
        </div>
    </div>
  </div>

  <button class="refresh-btn" onclick="refresh()" title="SYNC">↻</button>

  <script>
    let speculationEnabled = false;
    let autoAcquireEnabled = false;

    // Formatting Helpers
    const formatSats = (s) => parseInt(s).toLocaleString() + ' SAT';
    const formatUptime = (ms) => {
        const s = Math.floor(ms/1000);
        const m = Math.floor(s/60);
        const h = Math.floor(m/60);
        return \`\${h}h \${m%60}m\`;
    };

    async function fetchData() {
      try {
        const status = await fetch('/api/status').then(r => r.json());
        const portfolio = await fetch('/api/portfolio').then(r => r.json());
        const peers = await fetch('/api/peers').then(r => r.json());
        const opportunities = await fetch('/api/opportunities').then(r => r.json());

        // Update Headers
        document.getElementById('node-id').textContent = status.nodeId.slice(0, 12) + '...';
        document.getElementById('uptime').textContent = formatUptime(status.uptime);
        document.getElementById('peers-connected').textContent = status.peers.connected;
        document.getElementById('peers-known').textContent = status.peers.known;

        // Portfolio
        document.getElementById('total-value').textContent = formatSats(status.portfolio.totalValue);
        document.getElementById('pnl').textContent = formatSats(status.portfolio.pnl);
        document.getElementById('pnl').className = 'stat-value ' + (status.portfolio.pnl >= 0 ? 'positive' : 'negative');

        // Speculation Status
        document.getElementById('strategy').textContent = status.speculation.strategy;
        document.getElementById('budget').textContent = formatSats(status.speculation.budget);

        speculationEnabled = status.speculation.enabled;
        autoAcquireEnabled = status.speculation.autoAcquire;
        updateButtons();

        // Lists
        renderPeers(peers.active);
        renderHoldings(portfolio);
        renderOpportunities(opportunities);

      } catch (error) {
        console.error('Sync failed', error);
      }
    }

    function renderPeers(peers) {
        const container = document.getElementById('peer-list');
        if (!peers.length) {
            container.innerHTML = '<div class="empty">Scanning...</div>';
            return;
        }
        container.innerHTML = peers.map(p => \`
            <div class="list-item">
                <span style="font-size: 11px"><span class="status-dot online"></span>NODE_\${p.peer_id.slice(0,6)}</span>
                <span style="color: var(--text-dim); font-size: 10px">\${p.host}:\${p.port}</span>
            </div>
        \`).join('');
    }

    function renderHoldings(holdings) {
        const container = document.getElementById('holdings');
        if (!holdings.length) {
            container.innerHTML = '<div class="empty">Wallet Empty</div>';
            return;
        }
        container.innerHTML = holdings.map(h => \`
            <div class="list-item">
                <div style="display:flex; flex-direction:column">
                    <span style="font-weight:bold">\${h.token_id}</span>
                    <span style="color: var(--text-dim); font-size: 10px">\${h.balance.toLocaleString()} SHARES</span>
                </div>
                <div style="text-align:right">
                    <div class="\${h.pnl_sats >= 0 ? 'positive' : 'negative'}">\${formatSats(h.pnl_sats)}</div>
                </div>
            </div>
        \`).join('');
    }

    function renderOpportunities(opps) {
        const container = document.getElementById('opportunities');
        if (!opps.length) {
            container.innerHTML = '<div class="empty">No Signals</div>';
            return;
        }
        container.innerHTML = opps.slice(0,3).map(o => \`
            <div class="list-item">
                <div style="display:flex; flex-direction:column">
                    <span style="font-weight:bold">\${o.token_id}</span>
                    <span style="color: var(--text-dim); font-size: 10px">SCORE: \${o.ai_score || '-'}</span>
                </div>
                <div>\${formatSats(o.current_price_sats)}</div>
            </div>
        \`).join('');
    }

    function updateButtons() {
      const specBtn = document.getElementById('speculation-btn');
      const autoBtn = document.getElementById('auto-btn');

      specBtn.textContent = 'SPECULATION: ' + (speculationEnabled ? 'ON' : 'OFF');
      specBtn.className = 'toggle-btn' + (speculationEnabled ? ' active' : '');

      autoBtn.textContent = 'AUTO-ACQUIRE: ' + (autoAcquireEnabled ? 'ON' : 'OFF');
      autoBtn.className = 'toggle-btn' + (autoAcquireEnabled ? ' active danger' : '');
    }

    async function toggleSpeculation() {
      const endpoint = speculationEnabled ? '/api/speculation/disable' : '/api/speculation/enable';
      await fetch(endpoint, { method: 'POST' });
      speculationEnabled = !speculationEnabled;
      updateButtons();
    }

    async function toggleAuto() {
      const endpoint = autoAcquireEnabled ? '/api/auto/disable' : '/api/auto/enable';
      await fetch(endpoint, { method: 'POST' });
      autoAcquireEnabled = !autoAcquireEnabled;
      updateButtons();
    }

    function refresh() {
      document.querySelector('.refresh-btn').classList.add('loading');
      fetchData().then(() => {
        document.querySelector('.refresh-btn').classList.remove('loading');
      });
    }

    function showTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.add('active');
      event.target.classList.add('active');
    }

    // Init
    fetchData();
    setInterval(fetchData, 5000);
  </script>
</body>
</html>`;
  }
}
