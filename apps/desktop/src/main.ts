/**
 * $402 Client - Electron Main Process
 *
 * Desktop application wrapper for the Path402 client.
 * Provides native window, system tray, and auto-updates.
 *
 * The agent runs embedded in Electron (not as child process)
 * to avoid native module ABI mismatches.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Path402Agent, AgentConfig } from '@path402/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ───────────────────────────────────────────────────

const GUI_PORT = 4021;
const GOSSIP_PORT = 4020;

// ── State ───────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: Path402Agent | null = null;
let isQuitting = false;

// ── Agent Management (Embedded) ─────────────────────────────────────

async function startAgent(): Promise<void> {
  if (agent) {
    console.log('[Electron] Agent already running');
    return;
  }

  console.log('[Electron] Starting embedded agent...');

  const config: AgentConfig = {
    gossipPort: GOSSIP_PORT,
    guiEnabled: true,
    guiPort: GUI_PORT,
    speculationEnabled: false,
    autoAcquire: false
  };

  agent = new Path402Agent(config);

  agent.on('ready', (status) => {
    console.log('[Electron] Agent ready');
    showNotification('$402 Client', 'Agent started successfully');
  });

  agent.on('error', (error) => {
    console.error('[Electron] Agent error:', error);
  });

  try {
    await agent.start();
  } catch (err) {
    console.error('[Electron] Failed to start agent:', err);
    agent = null;

    if (!isQuitting) {
      // Retry after delay
      setTimeout(() => startAgent(), 3000);
    }
  }
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
    backgroundColor: '#0a0e14',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
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

  // Handle load failures - retry with delay
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log(`[Electron] Page load failed: ${errorDescription}, retrying...`);
    setTimeout(() => {
      mainWindow?.loadURL(`http://localhost:${GUI_PORT}`);
    }, 2000);
  });

  // Load the GUI dashboard
  mainWindow.loadURL(`http://localhost:${GUI_PORT}`);

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
      label: 'Open Dashboard',
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
        shell.openExternal(`http://localhost:${GUI_PORT}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Speculation',
      submenu: [
        {
          label: 'Enable',
          click: () => fetch(`http://localhost:${GUI_PORT}/api/speculation/enable`, { method: 'POST' })
        },
        {
          label: 'Disable',
          click: () => fetch(`http://localhost:${GUI_PORT}/api/speculation/disable`, { method: 'POST' })
        }
      ]
    },
    {
      label: 'Auto-Acquire',
      submenu: [
        {
          label: 'Enable',
          click: () => fetch(`http://localhost:${GUI_PORT}/api/auto/enable`, { method: 'POST' })
        },
        {
          label: 'Disable',
          click: () => fetch(`http://localhost:${GUI_PORT}/api/auto/disable`, { method: 'POST' })
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
  // Create a simple $402 icon programmatically
  // In production, use a proper .icns/.ico file
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
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#00d4ff"/>
      <text x="${size/2}" y="${size/2 + size/6}" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="${size/2}" fill="#0a0e14">$</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
}

// ── Status Polling ──────────────────────────────────────────────────

async function pollStatus(): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${GUI_PORT}/api/status`);
    if (response.ok) {
      const status = await response.json();
      updateTrayMenu({
        peers: status.peers?.connected || 0,
        tokens: status.tokens?.known || 0,
        pnl: status.portfolio?.pnl || 0
      });
    }
  } catch {
    // Agent not ready yet
  }
}

// ── Notifications ───────────────────────────────────────────────────

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ── IPC Handlers ────────────────────────────────────────────────────

function setupIPC(): void {
  ipcMain.handle('get-status', async () => {
    try {
      const response = await fetch(`http://localhost:${GUI_PORT}/api/status`);
      return response.json();
    } catch {
      return null;
    }
  });

  ipcMain.handle('toggle-speculation', async (_, enabled: boolean) => {
    const endpoint = enabled ? 'enable' : 'disable';
    await fetch(`http://localhost:${GUI_PORT}/api/speculation/${endpoint}`, { method: 'POST' });
  });

  ipcMain.handle('toggle-auto-acquire', async (_, enabled: boolean) => {
    const endpoint = enabled ? 'enable' : 'disable';
    await fetch(`http://localhost:${GUI_PORT}/api/auto/${endpoint}`, { method: 'POST' });
  });
}

// ── App Lifecycle ───────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Start the embedded agent
  await startAgent();

  // Wait a moment for GUI server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create window
  console.log('[Electron] Creating window...');
  createWindow();
  createTray();
  setupIPC();

  // Poll status every 30 seconds
  setInterval(pollStatus, 30000);
  pollStatus();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS when window closes
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }

  if (process.platform === 'darwin') {
    app.dock?.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAgent();
});

// Handle certificate errors for localhost
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('http://localhost')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

console.log('[Electron] $402 Client starting...');
