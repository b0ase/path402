/**
 * $402 Client - Electron Main Process
 *
 * Desktop application wrapper for the Path402 client.
 * Provides native window, system tray, and auto-updates.
 *
 * The agent runs embedded in Electron (not as child process)
 * to avoid native module ABI mismatches.
 *
 * UI is loaded from:
 * - Development: http://localhost:4023 (Next.js dev server)
 * - Production: file:// from out/ folder (static export)
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification } from 'electron';
import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { Path402Agent, AgentConfig } from '@path402/core';

// Set app name explicitly for single instance lock consistency
app.setName('Path402 Client');

// ── Single Instance Lock ───────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting...');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Focus existing window if someone tries to open a second one
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── Path Resolution (CJS) ──────────────────────────────────────────
// In CJS, __dirname is natively available and points to the folder containing this script (dist/)
// Whether in dev or packaged, we want to find files relative to this folder.
const preloadPath = join(__dirname, 'preload.js');

// appDir is used for finding resources OUTSIDE the ASAR in production
const appDir = app.isPackaged ? dirname(app.getAppPath()) : dirname(__dirname);

// ── Configuration ───────────────────────────────────────────────────
const API_PORT = 4021;      // Agent API server
const DEV_PORT = 4023;      // Next.js dev server
const GOSSIP_PORT = 4020;   // P2P gossip

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ── State ───────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: Path402Agent | null = null;
let isQuitting = false;

// ── Paths ───────────────────────────────────────────────────────────

// ── Paths ───────────────────────────────────────────────────────────

function getUIPath(): string {
  if (isDev) {
    return `http://localhost:${DEV_PORT}`;
  }
  return `http://localhost:${API_PORT}`;
}

// ── Config Helpers ───────────────────────────────────────────────────

function getConfigPath(): string {
  return join(homedir(), '.pathd', 'config.json');
}

function readDaemonConfig(): Record<string, any> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeDaemonConfig(config: Record<string, any>): void {
  const configPath = getConfigPath();
  const dataDir = dirname(configPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ── Agent Management (Embedded) ─────────────────────────────────────

async function startAgent(): Promise<void> {
  if (agent) {
    console.log('[Electron] Agent already running');
    return;
  }

  console.log('[Electron] Starting embedded agent...');

  // EXPLICIT SCHEMA DISCOVERY
  let schemaPath = join(__dirname, 'schema.sql'); // Common in dev
  if (!existsSync(schemaPath)) {
    // Try packaged location
    const packagedSchema = join(process.resourcesPath || '', 'db', 'schema.sql');
    if (existsSync(packagedSchema)) {
      schemaPath = packagedSchema;
    } else {
      // Try relative to appDir
      const relativeSchema = join(appDir, 'dist', 'schema.sql');
      if (existsSync(relativeSchema)) {
        schemaPath = relativeSchema;
      }
    }
  }

  // EXPLICIT UI DISCOVERY
  let uiPath: string | undefined = undefined;
  if (!isDev) {
    const possibleUIPaths = [
      join(app.getAppPath(), '..', 'web', 'out'),
      join(process.resourcesPath || '', 'web', 'out'),
      join(appDir, 'web', 'out'),
      join(dirname(app.getAppPath()), 'web', 'out')
    ];
    for (const p of possibleUIPaths) {
      if (existsSync(join(p, 'index.html'))) {
        uiPath = p;
        break;
      }
    }
  }

  console.log('[Electron] Using schema at:', schemaPath);
  if (uiPath) console.log('[Electron] Using static UI at:', uiPath);

  // Load daemon config (~/.pathd/config.json) for wallet/mining/peer settings
  const daemonConfig = readDaemonConfig();
  console.log('[Electron] Loaded daemon config:', {
    walletKeySet: !!daemonConfig.walletKey,
    tokenId: daemonConfig.tokenId || null,
    bootstrapPeers: daemonConfig.bootstrapPeers?.length || 0,
    powEnabled: daemonConfig.powEnabled || false,
  });

  const config: any = {
    gossipPort: GOSSIP_PORT,
    guiEnabled: true,
    guiPort: API_PORT,
    guiUiPath: uiPath,
    speculationEnabled: false,
    autoAcquire: false,
    schemaPath,
    // From daemon config
    walletKey: daemonConfig.walletKey,
    tokenId: daemonConfig.tokenId,
    dataDir: daemonConfig.dataDir,
    bootstrapPeers: daemonConfig.bootstrapPeers,
    marketplaceUrl: daemonConfig.marketplaceUrl,
  };

  agent = new Path402Agent(config);

  // Listen for restart requests from GUI API
  agent.on('restart_requested', async () => {
    console.log('[Electron] Restart requested via GUI');
    await stopAgent();
    await startAgent();
    mainWindow?.webContents.send('agent-ready', agent?.getStatus?.());
  });

  agent.on('ready', (status) => {
    console.log('[Electron] Agent ready');
    showNotification('$402 Client', 'Agent started successfully');
    // Notify renderer that API is ready
    mainWindow?.webContents.send('agent-ready', status);
  });

  agent.on('call:signal', (remotePeer: string, signal: any) => {
    console.log(`[Electron] Forwarding call signal from ${remotePeer}: ${signal.type}`);
    mainWindow?.webContents.send('call-incoming-signal', remotePeer, signal);
  });

  agent.on('error', (error) => {
    console.error('[Electron] Agent error:', error);
  });

  agent.on('status', (status) => {
    // Update tray with live status
    updateTrayMenu({
      peers: (status as any).peersConnected || 0,
      tokens: (status as any).tokensKnown || 0,
      pnl: (status as any).totalPnL || 0
    });
  });

  try {
    await agent.start();
  } catch (err) {
    console.error('[Electron] Failed to start agent:', err);
    agent = null;
    // Don't retry aggressively if it fails - let the user see the log or restart manually
  }
}

let isCreatingWindow = false;
function safeCreateWindow() {
  if (mainWindow || isCreatingWindow) return;
  isCreatingWindow = true;
  createWindow();
  createTray();
  isCreatingWindow = false;
}

async function stopAgent(): Promise<void> {
  if (agent) {
    console.log('[Electron] Stopping agent...');
    await agent.stop();
    agent = null;
  }
}

// ── Window Management ───────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b', // zinc-950
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      // Allow loading local files
      webSecurity: !isDev
    },
    icon: getAppIcon(),
    show: false
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Force show after timeout in case ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Electron] Force showing window after timeout');
      mainWindow.show();
    }
  }, 5000);

  const uiPath = getUIPath();
  console.log(`[Electron] Loading UI from: ${uiPath}`);

  // Handle load failures - retry with delay
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log(`[Electron] Page load failed: ${errorDescription}, retrying...`);
    setTimeout(() => {
      mainWindow?.loadURL(uiPath);
    }, 2000);
  });

  // Load the UI
  mainWindow.loadURL(uiPath);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();

      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── System Tray ─────────────────────────────────────────────────────

function createTray(): void {
  const icon = getTrayIcon();
  tray = new Tray(icon);

  updateTrayMenu();

  tray.setToolTip('$402 Client');

  // Click to show window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        if (process.platform === 'darwin') {
          app.dock?.show();
        }
      }
    }
  });
}

function updateTrayMenu(status?: { peers: number; tokens: number; pnl: number }): void {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '$402 Client',
      enabled: false
    },
    { type: 'separator' },
    {
      label: status
        ? `Peers: ${status.peers} | Tokens: ${status.tokens} | P&L: ${status.pnl} SAT`
        : 'Starting...',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open $402',
      click: () => {
        mainWindow?.show();
        if (process.platform === 'darwin') {
          app.dock?.show();
        }
      }
    },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal(`http://localhost:${API_PORT}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Speculation',
      submenu: [
        {
          label: 'Enable',
          click: () => agent?.setSpeculation?.(true)
        },
        {
          label: 'Disable',
          click: () => agent?.setSpeculation?.(false)
        }
      ]
    },
    {
      label: 'Auto-Acquire',
      submenu: [
        {
          label: 'Enable',
          click: () => agent?.setAutoAcquire?.(true)
        },
        {
          label: 'Disable',
          click: () => agent?.setAutoAcquire?.(false)
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Restart Agent',
      click: async () => {
        await stopAgent();
        await startAgent();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray?.setContextMenu(contextMenu);
}

// ── Icons ───────────────────────────────────────────────────────────

function getAppIcon(): Electron.NativeImage {
  // Try to load from build resources first
  const iconPath = join(appDir, '..', '..', '..', 'build', 'icon.png');
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  // Fallback to generated icon
  return nativeImage.createFromDataURL(getIconDataURL(256));
}

function getTrayIcon(): Electron.NativeImage {
  const size = process.platform === 'darwin' ? 22 : 16;
  return nativeImage.createFromDataURL(getIconDataURL(size));
}

function getIconDataURL(size: number): string {
  // Simple cyan circle with $ - replace with proper icon asset later
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#00d4ff"/>
      <text x="${size / 2}" y="${size / 2 + size / 6}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${size / 2}" fill="#09090b">$</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
}

// ── Notifications ───────────────────────────────────────────────────

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────

function setupIPC(): void {
  // Get agent status directly (no HTTP needed)
  ipcMain.handle('get-status', async () => {
    if (!agent) return null;
    return agent.getStatus?.() || null;
  });

  // Toggle speculation directly on agent
  ipcMain.handle('toggle-speculation', async (_, enabled: boolean) => {
    agent?.setSpeculation?.(enabled);
  });

  // Toggle auto-acquire directly on agent
  ipcMain.handle('toggle-auto-acquire', async (_, enabled: boolean) => {
    agent?.setAutoAcquire?.(enabled);
  });

  // Get API base URL for renderer
  ipcMain.handle('get-api-url', () => {
    return `http://localhost:${API_PORT}`;
  });

  // ── Wallet IPC Handlers ─────────────────────────────────────

  ipcMain.handle('connect-wallet', async (_, provider: string, opts?: any) => {
    const { getWalletManager } = require('@path402/core');
    const manager = getWalletManager();

    switch (provider) {
      case 'metanet': {
        manager.useMetanet();
        await manager.connectAll();
        const addresses = await manager.getAddresses();
        return { address: addresses['bsv'] || '', label: 'Metanet' };
      }
      case 'handcash': {
        // V1: store handle as address, real OAuth in v2
        const handle = opts?.handle || '';
        return { address: `$${handle}`, label: handle };
      }
      case 'yours': {
        // V1: address passed from renderer extension detection
        const address = opts?.address || '';
        return { address, label: 'Yours' };
      }
      case 'manual': {
        const bsvWallet = manager.getBSV();
        if (opts?.wif) {
          bsvWallet.importKey(opts.wif);
        }
        const address = await bsvWallet.getAddress();
        return { address, label: 'Manual Key' };
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  });

  ipcMain.handle('disconnect-wallet', async () => {
    // Wallet manager doesn't have a disconnect-all, but we can reset state
    // The renderer handles clearing its own persisted state
    return;
  });

  ipcMain.handle('get-wallet-balance', async () => {
    try {
      const { getWalletManager } = require('@path402/core');
      const manager = getWalletManager();
      const bsv = manager.getBSV();
      const balance = await bsv.getBalance();
      return Number(balance.native.amount);
    } catch {
      return 0;
    }
  });

  ipcMain.handle('get-wallet-address', async () => {
    try {
      const { getWalletManager } = require('@path402/core');
      const manager = getWalletManager();
      const addresses = await manager.getAddresses();
      return addresses['bsv'] || '';
    } catch {
      return '';
    }
  });

  ipcMain.handle('import-wallet-key', async (_, wif: string) => {
    const { getWalletManager } = require('@path402/core');
    const manager = getWalletManager();
    const bsv = manager.getBSV();
    bsv.importKey(wif);
    const address = await bsv.getAddress();
    return { address };
  });

  // ── Content IPC Handlers ─────────────────────────────────────

  ipcMain.handle('get-content-list', async () => {
    try {
      const store = agent?.getContentStore?.();
      if (!store) return [];
      return store.list();
    } catch {
      return [];
    }
  });

  ipcMain.handle('get-content-stats', async () => {
    try {
      const store = agent?.getContentStore?.();
      if (!store) return { totalItems: 0, totalBytes: 0, availableBytes: 0 };
      return store.getStats();
    } catch {
      return { totalItems: 0, totalBytes: 0, availableBytes: 0 };
    }
  });

  // ── Config IPC Handlers ─────────────────────────────────────

  ipcMain.handle('get-config', async () => {
    const config = readDaemonConfig();
    const walletKey = config.walletKey as string | undefined;
    return {
      walletKey: walletKey ? `***${walletKey.slice(-6)}` : undefined,
      walletKeySet: !!walletKey,
      tokenId: config.tokenId || null,
      bootstrapPeers: config.bootstrapPeers || [],
      powEnabled: config.powEnabled ?? false,
      powThreads: config.powThreads ?? 4,
    };
  });

  ipcMain.handle('set-config', async (_, updates: Record<string, any>) => {
    const existing = readDaemonConfig();
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
    writeDaemonConfig(existing);
    return { success: true, restart_required: true };
  });

  ipcMain.handle('restart-agent', async () => {
    await stopAgent();
    await startAgent();
    return { success: true };
  });

  // ── Identity IPC Handlers ─────────────────────────────────

  ipcMain.handle('identity-mint', async (_, symbol: string) => {
    if (!agent) throw new Error('Agent not running');
    return agent.mintIdentity(symbol);
  });

  ipcMain.handle('identity-get', async () => {
    if (!agent) return null;
    return agent.getIdentity();
  });

  ipcMain.handle('identity-get-balance', async () => {
    if (!agent) return '0';
    return agent.getIdentityBalance();
  });

  ipcMain.handle('identity-get-call-records', async (_, limit?: number) => {
    if (!agent) return [];
    return agent.getCallRecords(limit);
  });

  // ── Call IPC Handlers ─────────────────────────────────────

  ipcMain.handle('call-get-peers', async () => {
    if (!agent) return [];
    return agent.getCallPeers().map(id => ({ peerId: id, label: id.slice(0, 12) }));
  });

  ipcMain.handle('call-send-signal', async (_, peerId: string, signal: any) => {
    if (!agent) throw new Error('Agent not running');
    await agent.sendCallSignal(peerId, signal);
  });

  ipcMain.handle('call-get-peer-id', async () => {
    if (!agent) return null;
    return agent.getLibp2pPeerId();
  });
}

// ── Error Handling ──────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('[Electron] Uncaught Exception:', error);
  const { dialog } = require('electron');
  dialog.showErrorBox('Critical Error', error.stack || error.message);
});

// ── App Lifecycle ───────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Start the embedded agent
  try {
    await startAgent();
  } catch (err) {
    console.error('[Electron] Startup error:', err);
  }

  // Wait a moment for API server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create window
  console.log('[Electron] Creating window...');
  safeCreateWindow();
  setupIPC();
});

// Ensure clean exit
app.on('before-quit', async (e) => {
  if (isQuitting) return;

  console.log('[Electron] Performing final cleanup...');
  isQuitting = true;

  try {
    if (agent) {
      await agent.stop();
    }
  } catch (err) {
    console.error('[Electron] Cleanup error:', err);
  }

  // Force actual process termination to clear ports
  process.exit(0);
});

app.on('window-all-closed', () => {
  // On macOS it's common for applications to stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    safeCreateWindow();
  } else {
    mainWindow.show();
  }
});

// Handle certificate errors (for local dev devtools etc)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

console.log('[Electron] $402 Client starting...');
console.log(`[Electron] Mode: ${isDev ? 'development' : 'production'}`);
