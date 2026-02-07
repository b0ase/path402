/**
 * $402 Client - Electron Preload Script
 *
 * Exposes safe IPC methods to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer
contextBridge.exposeInMainWorld('path402', {
  // Get agent status
  getStatus: () => ipcRenderer.invoke('get-status'),

  // Toggle speculation
  setSpeculation: (enabled: boolean) => ipcRenderer.invoke('toggle-speculation', enabled),

  // Toggle auto-acquire
  setAutoAcquire: (enabled: boolean) => ipcRenderer.invoke('toggle-auto-acquire', enabled),

  // Get API URL for HTTP calls
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),

  // Listen for agent ready event
  onAgentReady: (callback: (status: any) => void) => {
    ipcRenderer.on('agent-ready', (_, status) => callback(status));
  },

  // ── Wallet IPC ──────────────────────────────────────────────

  connectWallet: (provider: string, opts?: any) =>
    ipcRenderer.invoke('connect-wallet', provider, opts),

  disconnectWallet: () =>
    ipcRenderer.invoke('disconnect-wallet'),

  getWalletBalance: () =>
    ipcRenderer.invoke('get-wallet-balance'),

  getWalletAddress: () =>
    ipcRenderer.invoke('get-wallet-address'),

  importWalletKey: (wif: string) =>
    ipcRenderer.invoke('import-wallet-key', wif),

  // ── Config IPC ──────────────────────────────────────────────

  getConfig: () =>
    ipcRenderer.invoke('get-config'),

  setConfig: (updates: Record<string, any>) =>
    ipcRenderer.invoke('set-config', updates),

  restartAgent: () =>
    ipcRenderer.invoke('restart-agent'),

  // Platform info
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
  isElectron: true
});

// Type definitions for the renderer
declare global {
  interface Window {
    path402: {
      getStatus: () => Promise<any>;
      setSpeculation: (enabled: boolean) => Promise<void>;
      setAutoAcquire: (enabled: boolean) => Promise<void>;
      getApiUrl: () => Promise<string>;
      onAgentReady: (callback: (status: any) => void) => void;
      // Wallet
      connectWallet: (provider: string, opts?: any) => Promise<{ address: string; label?: string }>;
      disconnectWallet: () => Promise<void>;
      getWalletBalance: () => Promise<number>;
      getWalletAddress: () => Promise<string>;
      importWalletKey: (wif: string) => Promise<{ address: string }>;
      // Config
      getConfig: () => Promise<any>;
      setConfig: (updates: Record<string, any>) => Promise<{ success: boolean; restart_required: boolean }>;
      restartAgent: () => Promise<{ success: boolean }>;
      platform: string;
      version: string;
      isElectron: boolean;
    };
  }
}
