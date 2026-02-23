package server

import "net/http"

const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ClawMiner Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0a09; --surface: #1c1917; --surface-hover: #292524;
    --border: rgba(249,115,22,0.12); --border-strong: rgba(249,115,22,0.25);
    --text: #fafaf9; --text-dim: #a8a29e; --text-muted: #57534e;
    --orange: #f97316; --orange-light: #fb923c; --orange-glow: rgba(249,115,22,0.08);
    --orange-dim: rgba(249,115,22,0.15); --orange-dimmer: rgba(249,115,22,0.06);
    --green: #22c55e; --red: #ef4444;
  }
  body {
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
    background: var(--bg); color: var(--text);
    min-height: 100vh; padding: 40px 24px;
  }
  .container { max-width: 880px; margin: 0 auto; }

  /* Header */
  .header {
    display: flex; align-items: center; gap: 16px;
    margin-bottom: 40px; padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }
  .header-icon {
    width: 48px; height: 48px; border-radius: 14px;
    box-shadow: 0 0 24px rgba(249,115,22,0.3), 0 0 48px rgba(249,115,22,0.1);
    object-fit: cover;
  }
  .header-text h1 {
    font-size: 26px; font-weight: 800; letter-spacing: -0.5px;
    background: linear-gradient(135deg, var(--orange-light) 0%, var(--orange) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header-text .subtitle {
    font-size: 12px; color: var(--text-muted); margin-top: 2px;
    font-family: 'SF Mono', 'Menlo', monospace; letter-spacing: 0.5px;
  }
  .header .spacer { flex: 1; }
  .header-badge {
    font-size: 11px; font-weight: 600; color: var(--orange);
    background: var(--orange-dim); padding: 4px 12px;
    border-radius: 20px; border: 1px solid var(--border);
    font-family: 'SF Mono', 'Menlo', monospace;
  }
  .status-pill {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 600; color: var(--green);
    background: rgba(34,197,94,0.08); padding: 6px 14px;
    border-radius: 20px; border: 1px solid rgba(34,197,94,0.15);
  }
  .status-pill.offline { color: var(--red); background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.15); }
  .status-pill .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor; position: relative;
  }
  .status-pill .dot::before {
    content: ''; position: absolute; inset: -3px;
    border-radius: 50%; background: currentColor; opacity: 0.3;
    animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
  }
  @keyframes ping { 75%, 100% { transform: scale(2.5); opacity: 0; } }

  /* Stats Grid */
  .stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 16px; margin-bottom: 16px;
  }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 20px; padding: 24px;
    transition: border-color 0.2s, background 0.2s;
  }
  .stat-card:hover {
    border-color: var(--border-strong); background: var(--surface-hover);
  }
  .stat-card.highlight {
    background: linear-gradient(135deg, var(--orange-dimmer) 0%, var(--surface) 100%);
    border-color: var(--border-strong);
  }
  .stat-card.full { grid-column: 1 / -1; }
  .stat-label {
    font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 12px;
  }
  .stat-value {
    font-size: 32px; font-weight: 800; color: var(--text);
    font-variant-numeric: tabular-nums; letter-spacing: -1px;
    line-height: 1;
  }
  .stat-value.orange { color: var(--orange); }
  .stat-value.small { font-size: 18px; letter-spacing: 0; }
  .stat-sub {
    font-size: 12px; color: var(--text-dim); margin-top: 6px;
    font-family: 'SF Mono', 'Menlo', monospace;
  }

  /* Wallet Card */
  .wallet-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 20px; padding: 24px; margin-bottom: 16px;
  }
  .wallet-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 12px; }
  .wallet-addr {
    font-size: 15px; font-weight: 600; color: var(--orange);
    font-family: 'SF Mono', 'Menlo', monospace;
    word-break: break-all; cursor: pointer;
    padding: 12px 16px; background: var(--orange-dimmer);
    border: 1px solid var(--border); border-radius: 12px;
    transition: all 0.2s; display: block;
  }
  .wallet-addr:hover { background: var(--orange-dim); border-color: var(--border-strong); }
  .wallet-sub {
    font-size: 11px; color: var(--text-muted); margin-top: 8px;
    font-family: 'SF Mono', 'Menlo', monospace;
  }

  /* Peers Card */
  .peers-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 20px; padding: 24px; margin-bottom: 16px;
  }
  .peers-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: var(--text-muted); margin-bottom: 16px; }
  .peers-table { width: 100%; border-collapse: collapse; }
  .peers-table th {
    font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--text-muted); text-align: left; padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .peers-table td {
    font-size: 13px; color: var(--text-dim); padding: 12px 0;
    border-bottom: 1px solid var(--border);
    font-family: 'SF Mono', 'Menlo', monospace;
  }
  .peers-table tr:last-child td { border-bottom: none; }
  .peers-table td:first-child { color: var(--text); font-weight: 500; }
  .peers-table .badge {
    display: inline-block; font-size: 10px; font-weight: 600; padding: 3px 10px;
    border-radius: 20px; background: var(--orange-dim); color: var(--orange);
    letter-spacing: 0.5px;
  }

  /* Toast */
  .copy-toast {
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, var(--orange) 0%, #ea580c 100%);
    color: #000; padding: 10px 24px;
    border-radius: 14px; font-size: 13px; font-weight: 700;
    box-shadow: 0 8px 32px rgba(249,115,22,0.4);
    opacity: 0; transition: opacity 0.3s; pointer-events: none;
  }
  .copy-toast.show { opacity: 1; }

  /* Footer */
  .footer {
    text-align: center; margin-top: 40px; padding-top: 24px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text-muted);
  }
  .footer a {
    color: var(--orange); text-decoration: none;
    font-weight: 600; transition: opacity 0.2s;
  }
  .footer a:hover { opacity: 0.7; }
  .footer .sep { margin: 0 8px; color: var(--border-strong); }

  /* Responsive */
  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
    body { padding: 24px 16px; }
    .stat-value { font-size: 26px; }
    .header-text h1 { font-size: 22px; }
  }
  @media (max-width: 400px) {
    .stats-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <img class="header-icon" src="data:image/png;base64,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" alt="ClawMiner" />
    <div class="header-text">
      <h1>ClawMiner</h1>
      <div class="subtitle">$402 Proof-of-Indexing</div>
    </div>
    <div class="spacer"></div>
    <span class="header-badge" id="version">v0.2.0</span>
    <div class="status-pill" id="statusPill">
      <span class="dot"></span>
      <span id="statusText">Mining</span>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card highlight">
      <div class="stat-label">Blocks Mined</div>
      <div class="stat-value orange" id="blocksMined">--</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Hash Rate</div>
      <div class="stat-value" id="hashRate">--</div>
      <div class="stat-sub" id="hashRateUnit">H/s</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peers</div>
      <div class="stat-value" id="peerCount">--</div>
      <div class="stat-sub">connected</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Difficulty</div>
      <div class="stat-value" id="difficulty">--</div>
      <div class="stat-sub" id="diffSub">leading zeros</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Mempool</div>
      <div class="stat-value" id="mempoolSize">--</div>
      <div class="stat-sub">pending items</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Uptime</div>
      <div class="stat-value small" id="uptime">--</div>
    </div>
    <div class="stat-card highlight full">
      <div class="stat-label">Network Difficulty Adjustment</div>
      <div style="display: flex; gap: 32px; flex-wrap: wrap; margin-top: 8px;">
        <div>
          <div class="stat-value small" id="netBlocks">--</div>
          <div class="stat-sub">network blocks</div>
        </div>
        <div>
          <div class="stat-value small" id="blocksUntil">--</div>
          <div class="stat-sub">until adjustment</div>
        </div>
        <div>
          <div class="stat-value small" id="targetTime">--</div>
          <div class="stat-sub">target block time</div>
        </div>
        <div>
          <div class="stat-value small" id="adjustPeriod">--</div>
          <div class="stat-sub">adjustment period</div>
        </div>
      </div>
    </div>
  </div>

  <div class="wallet-card">
    <div class="wallet-label">Wallet Address</div>
    <div class="wallet-addr" id="walletAddr" title="Click to copy" onclick="copyAddr()">--</div>
    <div class="wallet-sub" id="nodeId"></div>
  </div>

  <div class="peers-card">
    <div class="peers-label">Recent Blocks</div>
    <table class="peers-table">
      <thead><tr><th>Height</th><th>Hash</th><th>Miner</th><th>Time</th><th>Source</th></tr></thead>
      <tbody id="blocksBody">
        <tr><td colspan="5" style="color: var(--text-muted); font-size: 12px;">Loading...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="peers-card">
    <div class="peers-label">Connected Peers</div>
    <table class="peers-table">
      <thead><tr><th>Peer ID</th><th>Status</th><th>Reputation</th></tr></thead>
      <tbody id="peersBody">
        <tr><td colspan="3" style="color: var(--text-muted); font-size: 12px;">Loading...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <a href="https://b0-x.com">b0-x.com</a>
    <span class="sep">/</span>
    <a href="https://path402.com">path402.com</a>
    <span class="sep">/</span>
    <a href="https://clawminer.store">clawminer.store</a>
  </div>

</div>

<div class="copy-toast" id="copyToast">Address copied!</div>

<script>
const $ = id => document.getElementById(id);

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

function formatHashRate(rate) {
  if (rate >= 1e6) return { val: (rate / 1e6).toFixed(1), unit: 'MH/s' };
  if (rate >= 1e3) return { val: (rate / 1e3).toFixed(1), unit: 'KH/s' };
  return { val: Math.round(rate).toString(), unit: 'H/s' };
}

let walletAddress = '';

function copyAddr() {
  if (!walletAddress) return;
  navigator.clipboard.writeText(walletAddress).then(() => {
    const toast = $('copyToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  });
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch { return null; }
}

async function poll() {
  const mining = await fetchJSON('/api/mining/status');
  if (mining) {
    $('blocksMined').textContent = mining.blocks_mined;
    const hr = formatHashRate(mining.hash_rate || 0);
    $('hashRate').textContent = hr.val;
    $('hashRateUnit').textContent = hr.unit;
    $('difficulty').textContent = mining.difficulty;
    $('mempoolSize').textContent = mining.mempool_size;

    // Network difficulty adjustment stats
    if (mining.network) {
      const net = mining.network;
      $('netBlocks').textContent = net.total_network_blocks || 0;
      $('blocksUntil').textContent = net.blocks_until_adjust || '--';
      const tbs = net.target_block_time_s;
      $('targetTime').textContent = tbs >= 60 ? Math.round(tbs / 60) + 'min' : tbs + 's';
      $('adjustPeriod').textContent = net.adjustment_period + ' blocks';
      $('diffSub').textContent = 'target: ' + (net.target || '').substring(0, 12) + '...';
    }
    walletAddress = mining.miner_address || '';
    $('walletAddr').textContent = walletAddress || '--';

    const pill = $('statusPill');
    const txt = $('statusText');
    if (mining.is_mining) {
      pill.className = 'status-pill';
      txt.textContent = 'Mining';
    } else {
      pill.className = 'status-pill offline';
      txt.textContent = 'Idle';
    }
  }

  const status = await fetchJSON('/status');
  if (status) {
    $('uptime').textContent = formatUptime(status.uptime_ms || 0);
    $('peerCount').textContent = status.peers ? status.peers.connected : '--';
    if (status.node_id) {
      $('nodeId').textContent = 'Node ' + status.node_id.substring(0, 16) + '...';
    }
  }

  const peers = await fetchJSON('/api/peers');
  const tbody = $('peersBody');
  if (peers && peers.length > 0) {
    tbody.innerHTML = peers.map(p =>
      '<tr>' +
        '<td>' + (p.peer_id || '').substring(0, 16) + '...</td>' +
        '<td><span class="badge">' + (p.status || 'active') + '</span></td>' +
        '<td>' + (p.reputation_score != null ? p.reputation_score : '--') + '</td>' +
      '</tr>'
    ).join('');
  } else if (peers && peers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); font-size: 12px;">No peers connected</td></tr>';
  }

  const blocks = await fetchJSON('/api/blocks?limit=5');
  const blocksBody = $('blocksBody');
  if (blocks && blocks.length > 0) {
    blocksBody.innerHTML = blocks.map(b => {
      const ago = Math.floor((Date.now() - b.timestamp) / 1000);
      let timeStr;
      if (ago < 60) timeStr = ago + 's ago';
      else if (ago < 3600) timeStr = Math.floor(ago / 60) + 'm ago';
      else if (ago < 86400) timeStr = Math.floor(ago / 3600) + 'h ago';
      else timeStr = Math.floor(ago / 86400) + 'd ago';
      const src = b.is_own ? 'own' : 'peer';
      const srcColor = b.is_own ? 'var(--orange)' : 'var(--text-muted)';
      const srcBg = b.is_own ? 'var(--orange-dim)' : 'rgba(255,255,255,0.05)';
      return '<tr>' +
        '<td>' + b.height + '</td>' +
        '<td>' + (b.hash || '').substring(0, 12) + '...</td>' +
        '<td>' + (b.miner_address || '').substring(0, 12) + '...</td>' +
        '<td>' + timeStr + '</td>' +
        '<td><span class="badge" style="color:' + srcColor + ';background:' + srcBg + '">' + src + '</span></td>' +
      '</tr>';
    }).join('');
  } else if (blocks && blocks.length === 0) {
    blocksBody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted); font-size: 12px;">No blocks yet</td></tr>';
  }

  if (!mining && !status) {
    $('statusPill').className = 'status-pill offline';
    $('statusText').textContent = 'Offline';
  }
}

poll();
setInterval(poll, 5000);
</script>
</body>
</html>`

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(dashboardHTML))
}
