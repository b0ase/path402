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
