/**
 * $402 Client Web GUI Server
 *
 * Serves a local dashboard for the Path402 client.
 * Shows node status, portfolio, peers, and speculation controls.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Path402Agent } from '../client/agent.js';
import {
  getAllTokens,
  getPortfolio,
  getActivePeers,
  getAllPeers,
  getSpeculationOpportunities
} from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class GUIServer {
  private agent: Path402Agent;
  private port: number;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(agent: Path402Agent, port = 4021) {
    this.agent = agent;
    this.port = port;
  }

  start(): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(this.port, () => {
      console.log(`[GUI] Dashboard available at \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
    });
  }

  stop(): void {
    this.server?.close();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';

    // CORS headers for local dev
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

      // Serve dashboard
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getDashboardHTML());
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
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

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }
  }

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$402 Client Dashboard</title>
  <style>
    :root {
      --bg-dark: #0a0e14;
      --bg-card: #111820;
      --border: #1e2a38;
      --cyan: #00d4ff;
      --green: #00ff88;
      --yellow: #ffcc00;
      --red: #ff4444;
      --text: #e0e0e0;
      --text-dim: #6b7280;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid var(--cyan);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(0,212,255,0.1) 0%, transparent 100%);
    }

    .logo {
      font-size: 48px;
      font-weight: bold;
      background: linear-gradient(90deg, var(--green), var(--cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--text-dim);
      margin-top: 8px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }

    .card-title {
      color: var(--cyan);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-title::before {
      content: '▸';
      color: var(--green);
    }

    .stat {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }

    .stat:last-child {
      border-bottom: none;
    }

    .stat-label {
      color: var(--text-dim);
    }

    .stat-value {
      font-weight: bold;
    }

    .stat-value.positive { color: var(--green); }
    .stat-value.negative { color: var(--red); }
    .stat-value.highlight { color: var(--cyan); }

    .toggle-group {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }

    .toggle-btn {
      flex: 1;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      transition: all 0.2s;
    }

    .toggle-btn:hover {
      border-color: var(--cyan);
    }

    .toggle-btn.active {
      background: var(--cyan);
      color: var(--bg-dark);
      border-color: var(--cyan);
    }

    .toggle-btn.danger.active {
      background: var(--red);
      border-color: var(--red);
    }

    .peer-list, .token-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .peer-item, .token-item {
      padding: 8px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }

    .peer-item:last-child, .token-item:last-child {
      border-bottom: none;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .status-dot.online { background: var(--green); }
    .status-dot.offline { background: var(--red); }
    .status-dot.pending { background: var(--yellow); }

    .empty {
      color: var(--text-dim);
      font-style: italic;
      text-align: center;
      padding: 20px;
    }

    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid var(--cyan);
      background: var(--bg-card);
      color: var(--cyan);
      cursor: pointer;
      font-size: 20px;
      transition: all 0.2s;
    }

    .refresh-btn:hover {
      background: var(--cyan);
      color: var(--bg-dark);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .loading {
      animation: pulse 1s infinite;
    }

    /* Tabs */
    .tabs {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .tab {
      padding: 10px 20px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-card);
      color: var(--text-dim);
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      transition: all 0.2s;
    }

    .tab:hover {
      border-color: var(--cyan);
      color: var(--text);
    }

    .tab.active {
      border-color: var(--cyan);
      background: rgba(0, 212, 255, 0.1);
      color: var(--cyan);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Call Panel */
    .video-placeholder {
      background: var(--bg-dark);
      border: 2px dashed var(--border);
      border-radius: 8px;
      height: 300px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      margin-bottom: 20px;
    }

    .video-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }

    .call-controls {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }

    .call-input {
      flex: 1;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-dark);
      color: var(--text);
      font-family: inherit;
    }

    .call-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      background: var(--cyan);
      color: var(--bg-dark);
      font-family: inherit;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .call-btn:hover {
      background: var(--green);
    }

    .call-info {
      color: var(--text-dim);
      font-size: 12px;
      text-align: center;
    }

    /* Search */
    .search-input {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-dark);
      color: var(--text);
      font-family: inherit;
      margin-bottom: 20px;
    }

    /* Discover Grid */
    .discover-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .discover-section h3 {
      color: var(--cyan);
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    /* Coming Soon */
    .coming-soon {
      margin-top: 20px;
      padding: 20px;
      border: 1px dashed var(--border);
      border-radius: 8px;
      text-align: center;
      color: var(--text-dim);
    }

    .coming-soon p {
      margin: 5px 0;
    }

    /* KYC Info */
    .kyc-info {
      margin-top: 20px;
    }

    .kyc-info h3 {
      color: var(--cyan);
      font-size: 14px;
      margin-bottom: 10px;
    }

    .kyc-info ul {
      list-style: none;
      color: var(--text-dim);
    }

    .kyc-info li {
      padding: 5px 0;
    }

    .kyc-info li::before {
      content: '✓ ';
      color: var(--green);
    }

    /* Staking */
    .staking-summary {
      margin-bottom: 20px;
    }

    .staking-list h3 {
      color: var(--cyan);
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">$402</div>
    <div class="subtitle">Tokenized Attention Economy · Social Scaling</div>
  </div>

  <!-- Navigation Tabs -->
  <div class="tabs">
    <button class="tab active" onclick="showTab('dashboard')">Dashboard</button>
    <button class="tab" onclick="showTab('calls')">Calls</button>
    <button class="tab" onclick="showTab('mytoken')">My Token</button>
    <button class="tab" onclick="showTab('discover')">Discover</button>
    <button class="tab" onclick="showTab('staking')">Staking</button>
    <button class="tab" onclick="showTab('kyc')">KYC</button>
  </div>

  <!-- Dashboard Tab -->
  <div id="tab-dashboard" class="tab-content active">
  <div class="grid">
    <!-- Node Status -->
    <div class="card">
      <div class="card-title">Node Status</div>
      <div class="stat">
        <span class="stat-label">Node ID</span>
        <span class="stat-value highlight" id="node-id">Loading...</span>
      </div>
      <div class="stat">
        <span class="stat-label">Uptime</span>
        <span class="stat-value" id="uptime">-</span>
      </div>
      <div class="stat">
        <span class="stat-label">Gossip Port</span>
        <span class="stat-value">4020</span>
      </div>
      <div class="stat">
        <span class="stat-label">Status</span>
        <span class="stat-value positive" id="status">●  Online</span>
      </div>
    </div>

    <!-- Network -->
    <div class="card">
      <div class="card-title">Network</div>
      <div class="stat">
        <span class="stat-label">Connected Peers</span>
        <span class="stat-value highlight" id="peers-connected">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Known Peers</span>
        <span class="stat-value" id="peers-known">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Known Tokens</span>
        <span class="stat-value" id="tokens-known">0</span>
      </div>
      <div class="peer-list" id="peer-list">
        <div class="empty">No peers connected</div>
      </div>
    </div>

    <!-- Portfolio -->
    <div class="card">
      <div class="card-title">Portfolio</div>
      <div class="stat">
        <span class="stat-label">Tokens Held</span>
        <span class="stat-value highlight" id="tokens-held">0</span>
      </div>
      <div class="stat">
        <span class="stat-label">Total Value</span>
        <span class="stat-value" id="total-value">0 SAT</span>
      </div>
      <div class="stat">
        <span class="stat-label">Total Spent</span>
        <span class="stat-value" id="total-spent">0 SAT</span>
      </div>
      <div class="stat">
        <span class="stat-label">Total Revenue</span>
        <span class="stat-value positive" id="total-revenue">0 SAT</span>
      </div>
      <div class="stat">
        <span class="stat-label">P&L</span>
        <span class="stat-value" id="pnl">0 SAT</span>
      </div>
    </div>

    <!-- Speculation -->
    <div class="card">
      <div class="card-title">Speculation Engine</div>
      <div class="stat">
        <span class="stat-label">Strategy</span>
        <span class="stat-value highlight" id="strategy">early_adopter</span>
      </div>
      <div class="stat">
        <span class="stat-label">Budget</span>
        <span class="stat-value" id="budget">100,000 SAT</span>
      </div>
      <div class="stat">
        <span class="stat-label">Exposure</span>
        <span class="stat-value" id="exposure">0%</span>
      </div>
      <div class="stat">
        <span class="stat-label">Positions</span>
        <span class="stat-value" id="positions">0</span>
      </div>
      <div class="toggle-group">
        <button class="toggle-btn" id="speculation-btn" onclick="toggleSpeculation()">
          Speculation: OFF
        </button>
        <button class="toggle-btn" id="auto-btn" onclick="toggleAuto()">
          Auto-Acquire: OFF
        </button>
      </div>
    </div>

    <!-- Opportunities -->
    <div class="card">
      <div class="card-title">Opportunities</div>
      <div class="token-list" id="opportunities">
        <div class="empty">No opportunities found</div>
      </div>
    </div>

    <!-- Holdings -->
    <div class="card">
      <div class="card-title">Holdings</div>
      <div class="token-list" id="holdings">
        <div class="empty">No tokens held</div>
      </div>
    </div>
  </div>

  </div>
  </div><!-- End Dashboard Tab -->

  <!-- Calls Tab -->
  <div id="tab-calls" class="tab-content">
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-title">Video Calls</div>
      <div class="call-panel">
        <div class="video-placeholder">
          <div class="video-icon">📹</div>
          <div>No active call</div>
        </div>
        <div class="call-controls">
          <input type="text" id="call-token" placeholder="Enter $TOKEN to call..." class="call-input">
          <button class="call-btn" onclick="startCall()">Start Call</button>
        </div>
        <div class="call-info">
          <p>To call someone, you need their tokens.</p>
          <p>1 token = 1 second of connection time.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- My Token Tab -->
  <div id="tab-mytoken" class="tab-content">
    <div class="card" style="max-width: 600px; margin: 0 auto;">
      <div class="card-title">Your Token</div>
      <div class="token-config">
        <div class="stat">
          <span class="stat-label">Token Name</span>
          <span class="stat-value highlight">$YOUR_NAME</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Supply</span>
          <span class="stat-value">1,000,000,000</span>
        </div>
        <div class="stat">
          <span class="stat-label">Float (for sale)</span>
          <span class="stat-value">100,000,000 (10%)</span>
        </div>
        <div class="stat">
          <span class="stat-label">Floor Price</span>
          <span class="stat-value">500 SAT</span>
        </div>
        <div class="stat">
          <span class="stat-label">Access Rate</span>
          <span class="stat-value">1 token/second</span>
        </div>
        <div class="coming-soon">
          <p>Token minting coming soon...</p>
          <p>You'll be able to create your $TOKEN and control access to your time.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Discover Tab -->
  <div id="tab-discover" class="tab-content">
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-title">Discover Tokens</div>
      <input type="text" placeholder="Search $TOKEN..." class="search-input">
      <div class="discover-grid">
        <div class="discover-section">
          <h3>Trending</h3>
          <div class="token-list" id="trending-tokens">
            <div class="empty">Loading...</div>
          </div>
        </div>
        <div class="discover-section">
          <h3>Friends</h3>
          <div class="token-list" id="friend-tokens">
            <div class="empty">No friends added</div>
          </div>
        </div>
        <div class="discover-section">
          <h3>New</h3>
          <div class="token-list" id="new-tokens">
            <div class="empty">Loading...</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Staking Tab -->
  <div id="tab-staking" class="tab-content">
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-title">Staking & Dividends</div>
      <div class="staking-summary">
        <div class="stat">
          <span class="stat-label">Total Staked Value</span>
          <span class="stat-value highlight">0 SAT</span>
        </div>
        <div class="stat">
          <span class="stat-label">Pending Dividends</span>
          <span class="stat-value positive">0 SAT</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Earned (All Time)</span>
          <span class="stat-value">0 SAT</span>
        </div>
      </div>
      <div class="staking-list">
        <h3>Your Staked Positions</h3>
        <div class="token-list" id="staked-tokens">
          <div class="empty">No staked positions</div>
        </div>
      </div>
      <div class="coming-soon">
        <p>Stake tokens in creators you believe in.</p>
        <p>Earn dividends from their success.</p>
      </div>
    </div>
  </div>

  <!-- KYC Tab -->
  <div id="tab-kyc" class="tab-content">
    <div class="card" style="max-width: 600px; margin: 0 auto;">
      <div class="card-title">Identity Verification</div>
      <div class="kyc-status">
        <div class="stat">
          <span class="stat-label">Status</span>
          <span class="stat-value" style="color: var(--yellow);">Not Verified</span>
        </div>
        <div class="stat">
          <span class="stat-label">Linked Tokens</span>
          <span class="stat-value">0</span>
        </div>
      </div>
      <div class="kyc-info">
        <h3>Why KYC?</h3>
        <ul>
          <li>Basic access requires NO verification</li>
          <li>To claim dividends, KYC is required</li>
          <li>Your identity links to tokens you trust</li>
          <li>Privacy preserved - only share where needed</li>
        </ul>
      </div>
      <div class="coming-soon">
        <p>Identity verification coming soon...</p>
        <p>Link your phone contract or government ID to claim dividends.</p>
      </div>
    </div>
  </div>

  <button class="refresh-btn" onclick="refresh()" title="Refresh">↻</button>

  <script>
    let speculationEnabled = false;
    let autoAcquireEnabled = false;

    async function fetchData() {
      try {
        const status = await fetch('/api/status').then(r => r.json());
        const portfolio = await fetch('/api/portfolio').then(r => r.json());
        const peers = await fetch('/api/peers').then(r => r.json());
        const opportunities = await fetch('/api/opportunities').then(r => r.json());

        // Update status
        document.getElementById('node-id').textContent = status.nodeId.slice(0, 16) + '...';
        document.getElementById('uptime').textContent = formatUptime(status.uptime);
        document.getElementById('peers-connected').textContent = status.peers.connected;
        document.getElementById('peers-known').textContent = status.peers.known;
        document.getElementById('tokens-known').textContent = status.tokens.known;
        document.getElementById('tokens-held').textContent = status.tokens.held;

        // Portfolio
        document.getElementById('total-value').textContent = formatSats(status.portfolio.totalValue);
        document.getElementById('total-spent').textContent = formatSats(status.portfolio.totalSpent);
        document.getElementById('total-revenue').textContent = formatSats(status.portfolio.totalRevenue);

        const pnlEl = document.getElementById('pnl');
        pnlEl.textContent = formatSats(status.portfolio.pnl);
        pnlEl.className = 'stat-value ' + (status.portfolio.pnl >= 0 ? 'positive' : 'negative');

        // Speculation
        document.getElementById('strategy').textContent = status.speculation.strategy;
        document.getElementById('budget').textContent = formatSats(status.speculation.budget);
        document.getElementById('exposure').textContent = status.speculation.exposure + '%';
        document.getElementById('positions').textContent = status.speculation.positions;

        speculationEnabled = status.speculation.enabled;
        autoAcquireEnabled = status.speculation.autoAcquire;
        updateButtons();

        // Peers list
        const peerList = document.getElementById('peer-list');
        if (peers.active.length > 0) {
          peerList.innerHTML = peers.active.map(p =>
            '<div class="peer-item"><span class="status-dot online"></span>' +
            p.peer_id.slice(0, 12) + '... (' + p.host + ':' + p.port + ')</div>'
          ).join('');
        } else {
          peerList.innerHTML = '<div class="empty">No peers connected</div>';
        }

        // Opportunities
        const oppList = document.getElementById('opportunities');
        if (opportunities.length > 0) {
          oppList.innerHTML = opportunities.slice(0, 5).map(o =>
            '<div class="token-item">' +
            '<strong>' + o.token_id + '</strong><br>' +
            '<span style="color: var(--text-dim)">Supply: ' + o.current_supply +
            ' · Price: ' + o.current_price_sats + ' SAT' +
            (o.ai_score ? ' · Score: ' + o.ai_score : '') + '</span></div>'
          ).join('');
        } else {
          oppList.innerHTML = '<div class="empty">No opportunities found</div>';
        }

        // Holdings
        const holdList = document.getElementById('holdings');
        if (portfolio.length > 0) {
          holdList.innerHTML = portfolio.map(h =>
            '<div class="token-item">' +
            '<strong>' + h.token_id + '</strong><br>' +
            '<span style="color: var(--text-dim)">Balance: ' + h.balance +
            ' · P&L: <span style="color: ' + (h.pnl_sats >= 0 ? 'var(--green)' : 'var(--red)') + '">' +
            formatSats(h.pnl_sats) + '</span></span></div>'
          ).join('');
        } else {
          holdList.innerHTML = '<div class="empty">No tokens held</div>';
        }

      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    }

    function formatSats(sats) {
      return sats.toLocaleString() + ' SAT';
    }

    function formatUptime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
      if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
      return seconds + 's';
    }

    function updateButtons() {
      const specBtn = document.getElementById('speculation-btn');
      const autoBtn = document.getElementById('auto-btn');

      specBtn.textContent = 'Speculation: ' + (speculationEnabled ? 'ON' : 'OFF');
      specBtn.className = 'toggle-btn' + (speculationEnabled ? ' active' : '');

      autoBtn.textContent = 'Auto-Acquire: ' + (autoAcquireEnabled ? 'ON' : 'OFF');
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

    // Tab switching
    function showTab(tabId) {
      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
      });
      document.querySelectorAll('.tab').forEach(el => {
        el.classList.remove('active');
      });

      // Show selected tab
      document.getElementById('tab-' + tabId).classList.add('active');
      event.target.classList.add('active');
    }

    // Start call (placeholder)
    function startCall() {
      const token = document.getElementById('call-token').value;
      if (token) {
        alert('Calling ' + token + '...\\nVideo calls coming soon!');
      }
    }

    // Initial load
    fetchData();

    // Auto-refresh every 5 seconds
    setInterval(fetchData, 5000);
  </script>
</body>
</html>`;
  }
}
