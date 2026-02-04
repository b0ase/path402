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
      platform: string;
      version: string;
      isElectron: boolean;
    };
  }
}
