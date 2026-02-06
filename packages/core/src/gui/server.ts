/**
 * $402 Client Web GUI Server
 *
 * Serves the $402 web GUI for the Path402 client.
 * Shows node status, portfolio, peers, and speculation controls.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, lstatSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Path402Agent } from '../client/agent.js';
import {
  getAllTokens,
  getPortfolio,
  getActivePeers,
  getAllPeers,
  getSpeculationOpportunities,
  getAllCachedContent,
  getContentCacheStats,
  getContentByHash
} from '../db/index.js';

const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

export class GUIServer {
  private agent: Path402Agent;
  private port: number;
  private server: ReturnType<typeof createServer> | null = null;
  private uiPath: string | null = null;

  constructor(agent: Path402Agent, port = 4021, uiPath: string | null = null) {
    this.agent = agent;
    this.port = port;
    this.uiPath = uiPath;
  }

  start(): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(this.port, () => {
      console.log(`[GUI] $402 available at \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
      if (this.uiPath) {
        console.log(`[GUI] Serving static UI from: ${this.uiPath}`);
      }
    });
  }

  stop(): void {
    this.server?.close();
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimes: Record<string, string> = {
      'html': 'text/html',
      'js': 'application/javascript',
      'css': 'text/css',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'mp4': 'video/mp4',
      'webm': 'video/webm'
    };
    return mimes[ext || ''] || 'text/plain';
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // API routes
      if (url.startsWith('/api/')) {
        await this.handleAPI(url, req, res);
        return;
      }

      // Serve static files if UI path is provided
      if (this.uiPath) {
        let filePath = join(this.uiPath, url === '/' ? 'index.html' : url);

        // Next.js SPA Routing Support:
        // 1. Check for exact file
        // 2. Check for file + .html
        // 3. Fallback to index.html for client-side routing

        const tryPaths = [
          filePath,
          filePath + '.html',
          join(this.uiPath, url, 'index.html'),
          join(this.uiPath, 'index.html') // Final SPA fallback
        ];

        let found = false;
        for (const p of tryPaths) {
          if (existsSync(p)) {
            const stats = lstatSync(p);
            if (stats.isFile() && !p.includes('..')) {
              const content = readFileSync(p);
              res.writeHead(200, { 'Content-Type': this.getMimeType(p) });
              res.end(content);
              found = true;
              break;
            }
          }
        }
        if (found) return;
      }

      // Fallback to embedded HTML for index
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getEmbeddedHTML());
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('[GUI] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }

  private async handleAPI(url: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    switch (url) {
      case '/api/status':
        res.end(JSON.stringify(this.agent.getStatus()));
        break;

      case '/api/tokens':
        res.end(JSON.stringify(getAllTokens()));
        break;

      case '/api/portfolio':
        res.end(JSON.stringify(getPortfolio()));
        break;

      case '/api/peers':
        res.end(JSON.stringify({
          active: getActivePeers(),
          all: getAllPeers()
        }));
        break;

      case '/api/opportunities':
        res.end(JSON.stringify(getSpeculationOpportunities()));
        break;

      case '/api/speculation/enable':
        if (req.method === 'POST') {
          this.agent.setSpeculation(true);
          res.end(JSON.stringify({ success: true, enabled: true }));
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/speculation/disable':
        if (req.method === 'POST') {
          this.agent.setSpeculation(false);
          res.end(JSON.stringify({ success: true, enabled: false }));
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/auto/enable':
        if (req.method === 'POST') {
          this.agent.setAutoAcquire(true);
          res.end(JSON.stringify({ success: true, autoAcquire: true }));
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/auto/disable':
        if (req.method === 'POST') {
          this.agent.setAutoAcquire(false);
          res.end(JSON.stringify({ success: true, autoAcquire: false }));
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        break;

      case '/api/content':
        res.end(JSON.stringify(getAllCachedContent()));
        break;

      case '/api/content/stats': {
        const stats = getContentCacheStats();
        res.end(JSON.stringify(stats));
        break;
      }

      default:
        // Handle parameterized routes
        if (url.startsWith('/api/content/serve/')) {
          const hash = url.replace('/api/content/serve/', '');
          await this.handleContentServe(hash, req, res);
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }
  }

  private async handleContentServe(hash: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const contentStore = this.agent.getContentStore?.();
    if (!contentStore) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content store not available' }));
      return;
    }

    const meta = getContentByHash(hash);
    if (!meta) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content not found' }));
      return;
    }

    const stream = await contentStore.getStream(hash);
    if (!stream) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content file not found' }));
      return;
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
