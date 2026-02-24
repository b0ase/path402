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

  // ── Identity IPC ──────────────────────────────────────────

  mintIdentity: (symbol: string) =>
    ipcRenderer.invoke('identity-mint', symbol),

  getIdentity: () =>
    ipcRenderer.invoke('identity-get'),

  getIdentityBalance: () =>
    ipcRenderer.invoke('identity-get-balance'),

  getCallRecords: (limit?: number) =>
    ipcRenderer.invoke('identity-get-call-records', limit),

  // ── Call IPC ──────────────────────────────────────────────

  getCallPeers: () =>
    ipcRenderer.invoke('call-get-peers'),

  sendCallSignal: (peerId: string, signal: any) =>
    ipcRenderer.invoke('call-send-signal', peerId, signal),

  getCallPeerId: () =>
    ipcRenderer.invoke('call-get-peer-id'),

  onCallSignal: (callback: (remotePeer: string, signal: any) => void) => {
    ipcRenderer.on('call-incoming-signal', (_, remotePeer, signal) => callback(remotePeer, signal));
  },

  removeCallSignalListener: () => {
    ipcRenderer.removeAllListeners('call-incoming-signal');
  },

  // ── DM IPC ──────────────────────────────────────────────

  sendDM: (peerId: string, content: string) =>
    ipcRenderer.invoke('dm-send', peerId, content),

  getDMMessages: (peerId: string, limit?: number, before?: number) =>
    ipcRenderer.invoke('dm-get-messages', peerId, limit, before),

  getDMConversations: () =>
    ipcRenderer.invoke('dm-get-conversations'),

  onDMReceived: (callback: (remotePeer: string, payload: any) => void) => {
    ipcRenderer.on('dm-incoming', (_, remotePeer, payload) => callback(remotePeer, payload));
  },

  removeDMListener: () => {
    ipcRenderer.removeAllListeners('dm-incoming');
  },

  // ── Room IPC ──────────────────────────────────────────────

  createRoom: (name: string, roomType?: string, accessType?: string, tokenSymbol?: string) =>
    ipcRenderer.invoke('room-create', name, roomType, accessType, tokenSymbol),

  joinRoom: (roomId: string) =>
    ipcRenderer.invoke('room-join', roomId),

  leaveRoom: (roomId: string) =>
    ipcRenderer.invoke('room-leave', roomId),

  sendRoomMessage: (roomId: string, content: string) =>
    ipcRenderer.invoke('room-send', roomId, content),

  getRooms: () =>
    ipcRenderer.invoke('room-list'),

  getRoom: (roomId: string) =>
    ipcRenderer.invoke('room-get', roomId),

  getRoomMessages: (roomId: string, limit?: number, before?: number) =>
    ipcRenderer.invoke('room-get-messages', roomId, limit, before),

  sendRoomVoiceSignal: (peerId: string, signal: any) =>
    ipcRenderer.invoke('room-voice-signal', peerId, signal),

  onRoomMessage: (callback: (payload: any) => void) => {
    ipcRenderer.on('room-message', (_, payload) => callback(payload));
  },

  onRoomAnnounced: (callback: (payload: any) => void) => {
    ipcRenderer.on('room-announced', (_, payload) => callback(payload));
  },

  onRoomMemberJoined: (callback: (payload: any) => void) => {
    ipcRenderer.on('room-member-joined', (_, payload) => callback(payload));
  },

  onRoomMemberLeft: (callback: (payload: any) => void) => {
    ipcRenderer.on('room-member-left', (_, payload) => callback(payload));
  },

  removeRoomListeners: () => {
    ipcRenderer.removeAllListeners('room-message');
    ipcRenderer.removeAllListeners('room-announced');
    ipcRenderer.removeAllListeners('room-member-joined');
    ipcRenderer.removeAllListeners('room-member-left');
  },

  // ── Chat History IPC ──────────────────────────────────────

  getChatHistory: (channel?: string, limit?: number, before?: number) =>
    ipcRenderer.invoke('chat-get-history', channel, limit, before),

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
      // Identity
      mintIdentity: (symbol: string) => Promise<any>;
      getIdentity: () => Promise<any>;
      getIdentityBalance: () => Promise<string>;
      getCallRecords: (limit?: number) => Promise<any[]>;
      // Call
      getCallPeers: () => Promise<Array<{ peerId: string; label: string }>>;
      sendCallSignal: (peerId: string, signal: any) => Promise<void>;
      getCallPeerId: () => Promise<string | null>;
      onCallSignal: (callback: (remotePeer: string, signal: any) => void) => void;
      removeCallSignalListener: () => void;
      // DM
      sendDM: (peerId: string, content: string) => Promise<{ success: boolean }>;
      getDMMessages: (peerId: string, limit?: number, before?: number) => Promise<any[]>;
      getDMConversations: () => Promise<Array<{ peer_id: string; last_message: string; last_timestamp: number; unread_count: number }>>;
      onDMReceived: (callback: (remotePeer: string, payload: any) => void) => void;
      removeDMListener: () => void;
      // Room
      createRoom: (name: string, roomType?: string, accessType?: string, tokenSymbol?: string) => Promise<any>;
      joinRoom: (roomId: string) => Promise<{ success: boolean }>;
      leaveRoom: (roomId: string) => Promise<{ success: boolean }>;
      sendRoomMessage: (roomId: string, content: string) => Promise<{ success: boolean }>;
      getRooms: () => Promise<any[]>;
      getRoom: (roomId: string) => Promise<any>;
      getRoomMessages: (roomId: string, limit?: number, before?: number) => Promise<any[]>;
      sendRoomVoiceSignal: (peerId: string, signal: any) => Promise<void>;
      onRoomMessage: (callback: (payload: any) => void) => void;
      onRoomAnnounced: (callback: (payload: any) => void) => void;
      onRoomMemberJoined: (callback: (payload: any) => void) => void;
      onRoomMemberLeft: (callback: (payload: any) => void) => void;
      removeRoomListeners: () => void;
      // Chat History
      getChatHistory: (channel?: string, limit?: number, before?: number) => Promise<any[]>;
      platform: string;
      version: string;
      isElectron: boolean;
    };
  }
}
