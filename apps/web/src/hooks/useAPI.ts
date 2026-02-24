'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// API base URL
const API_BASE = 'http://localhost:4021';

// Type definitions
export interface AgentStatus {
  nodeId: string;
  uptime: number;
  peersConnected: number;
  peersKnown: number;
  tokensKnown: number;
  portfolioValue: number;
  totalPnL: number;
  speculationEnabled: boolean;
  autoAcquireEnabled: boolean;
  mining?: {
    enabled: boolean;
    broadcasterConnected: boolean;
    tokenId: string;
  };
}

export interface Token {
  token_id: string;
  name: string;
  description: string;
  base_price_sats: number;
  pricing_model: string;
  current_supply: number;
  image?: string;
}

export interface Holding {
  token_id: string;
  name: string;
  balance: number;
  total_spent_sats: number;
  total_revenue_sats: number;
  pnl_sats: number;
}

export interface Peer {
  peer_id: string;
  host: string;
  port: number;
  status: string;
  last_seen_at: number;
  reputation_score: number;
}

export interface ChatMessage {
  channel: string;
  content: string;
  sender_handle?: string;
  sender_address: string;
  timestamp: number;
}

// Fetch helper
async function fetchAPI<T>(endpoint: string): Promise<T> {
  // Try Electron IPC first if available and if it's the status endpoint
  if (typeof window !== 'undefined' && (window as any).path402 && endpoint === '/api/status' && (window as any).path402.getStatus) {
    try {
      const ipcStatus = await (window as any).path402.getStatus();
      if (ipcStatus) return mapStatus(ipcStatus) as unknown as T;
    } catch (e) {
      console.warn('[API] IPC status failed, falling back to HTTP', e);
    }
  }

  // Fall back to HTTP
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();

  // If this is the status endpoint, map the nested v3.0.0 response to our flat interface
  if (endpoint === '/api/status' && data.nodeId) {
    return mapStatus(data) as unknown as T;
  }

  return data;
}

/**
 * Maps nested v3.0.0 AgentStatus to flat UI AgentStatus
 */
function mapStatus(data: any): AgentStatus {
  // If already flat (legacy support), return as is
  if (data.peersConnected !== undefined) return data;

  return {
    nodeId: data.nodeId,
    uptime: data.uptime,
    peersConnected: data.peers?.connected || 0,
    peersKnown: data.peers?.known || 0,
    tokensKnown: data.tokens?.known || 0,
    portfolioValue: data.portfolio?.totalValue || 0,
    totalPnL: data.portfolio?.pnl || 0,
    speculationEnabled: data.speculation?.enabled || false,
    autoAcquireEnabled: data.speculation?.autoAcquire || false,
    mining: data.mining ? {
      enabled: data.mining.enabled,
      broadcasterConnected: data.mining.broadcasterConnected,
      tokenId: data.mining.tokenId,
    } : undefined,
  };
}

// Hooks
export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => fetchAPI<AgentStatus>('/api/status'),
    refetchInterval: 5000, // Poll every 5s
    retry: 2,
    retryDelay: 3000
  });
}

export function useTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => fetchAPI<Token[]>('/api/tokens')
  });
}

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: () => fetchAPI<Holding[]>('/api/portfolio')
  });
}

export function usePeers() {
  return useQuery({
    queryKey: ['peers'],
    queryFn: () => fetchAPI<{ active: Peer[]; known: Peer[] }>('/api/peers')
  });
}

export function useOpportunities() {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: () => fetchAPI<any[]>('/api/opportunities')
  });
}

export function useChatStream(onMessage: (msg: ChatMessage) => void) {
  return useQuery({
    queryKey: ['chat-stream'],
    queryFn: () => {
      const eventSource = new EventSource(`${API_BASE}/api/chat/stream`);
      eventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        onMessage(msg);
      };
      return () => eventSource.close();
    },
    staleTime: Infinity,
    enabled: typeof window !== 'undefined'
  });
}

// Mutations
export function useToggleSpeculation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      // Try Electron IPC first
      if (typeof window !== 'undefined' && (window as any).path402) {
        return (window as any).path402.setSpeculation(enabled);
      }

      const res = await fetch(
        `${API_BASE}/api/speculation/${enabled ? 'enable' : 'disable'}`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to toggle speculation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
    }
  });
}

export function useToggleAutoAcquire() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      // Try Electron IPC first
      if (typeof window !== 'undefined' && (window as any).path402) {
        return (window as any).path402.setAutoAcquire(enabled);
      }

      const res = await fetch(
        `${API_BASE}/api/auto/${enabled ? 'enable' : 'disable'}`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to toggle auto-acquire');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
    }
  });
}

// Marketplace hooks
export interface MarketplaceData {
  tokens: MarketplaceToken[];
  stats: MarketplaceStats | null;
  bsvPrice: number | null;
  lastSyncedAt: number;
}

export interface MarketplaceToken {
  address: string;
  name: string;
  issuer_handle: string | null;
  current_supply: number;
  current_price_sats: number;
  base_price_sats: number;
  pricing_model: string;
  content_type: string | null;
  access_url: string | null;
}

/** Stats for the path402.com PLATFORM token (NOT $402 HTM PoW20).
 *  tokenLabel distinguishes the token type. */
export interface MarketplaceStats {
  tokenLabel: string;
  /** x402 facilitator inscription count */
  totalInscriptions: number;
  /** x402 facilitator fees */
  totalFees: number;
  /** Platform token current price in sats (sqrt_decay curve) */
  currentPrice: number;
  /** Platform tokens sold from treasury */
  supplySold: number;
  /** Platform tokens remaining in treasury (out of 500M) */
  treasuryRemaining: number;
}

export function useMarketplace() {
  return useQuery({
    queryKey: ['marketplace'],
    queryFn: () => fetchAPI<MarketplaceData>('/api/marketplace'),
    refetchInterval: 30_000, // Sync with bridge interval
    retry: 2,
  });
}

// Content hooks
export interface ContentItem {
  id: number;
  token_id: string;
  content_hash: string;
  content_type: string | null;
  content_size: number | null;
  content_path: string | null;
  acquired_at: number;
  price_paid_sats: number | null;
}

export interface ContentStats {
  totalItems: number;
  totalBytes: number;
}

export function useContent() {
  return useQuery({
    queryKey: ['content'],
    queryFn: () => fetchAPI<ContentItem[]>('/api/content')
  });
}

export function useContentStats() {
  return useQuery({
    queryKey: ['content-stats'],
    queryFn: () => fetchAPI<ContentStats>('/api/content/stats')
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channel, content, handle }: { channel: string; content: string; handle?: string }) => {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, content, handle })
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    }
  });
}

// ── Config hooks ────────────────────────────────────────────────

export interface NodeConfig {
  walletKey?: string;
  walletKeySet: boolean;
  tokenId?: string | null;
  bootstrapPeers?: string[];
  powEnabled?: boolean;
  powThreads?: number;
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async (): Promise<NodeConfig> => {
      if (typeof window !== 'undefined' && (window as any).path402?.getConfig) {
        return (window as any).path402.getConfig();
      }
      const res = await fetch(`${API_BASE}/api/config`);
      if (!res.ok) throw new Error('Failed to get config');
      return res.json();
    }
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<NodeConfig>) => {
      if (typeof window !== 'undefined' && (window as any).path402?.setConfig) {
        return (window as any).path402.setConfig(updates);
      }
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    }
  });
}

export function useRestartAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (typeof window !== 'undefined' && (window as any).path402?.restartAgent) {
        return (window as any).path402.restartAgent();
      }
      const res = await fetch(`${API_BASE}/api/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to restart');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    }
  });
}

// ── Chat History hooks ────────────────────────────────────────────

export function useChatHistory(channel: string, limit = 50) {
  return useQuery({
    queryKey: ['chat-history', channel, limit],
    queryFn: async () => {
      if (typeof window !== 'undefined' && (window as any).path402?.getChatHistory) {
        return (window as any).path402.getChatHistory(channel, limit);
      }
      return fetchAPI<any[]>(`/api/chat/history?channel=${encodeURIComponent(channel)}&limit=${limit}`);
    },
  });
}

// ── DM hooks ──────────────────────────────────────────────────────

export function useDMConversations() {
  return useQuery({
    queryKey: ['dm-conversations'],
    queryFn: async () => {
      if (typeof window !== 'undefined' && (window as any).path402?.getDMConversations) {
        return (window as any).path402.getDMConversations();
      }
      return fetchAPI<Array<{ peer_id: string; last_message: string; last_timestamp: number; unread_count: number }>>('/api/dm/conversations');
    },
    refetchInterval: 10_000,
  });
}

export function useDMMessages(peerId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['dm-messages', peerId, limit],
    queryFn: async () => {
      if (!peerId) return [];
      if (typeof window !== 'undefined' && (window as any).path402?.getDMMessages) {
        return (window as any).path402.getDMMessages(peerId, limit);
      }
      return fetchAPI<any[]>(`/api/dm/${encodeURIComponent(peerId)}/messages?limit=${limit}`);
    },
    enabled: !!peerId,
  });
}

export function useSendDM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ peerId, content }: { peerId: string; content: string }) => {
      if (typeof window !== 'undefined' && (window as any).path402?.sendDM) {
        return (window as any).path402.sendDM(peerId, content);
      }
      const res = await fetch(`${API_BASE}/api/dm/${encodeURIComponent(peerId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error('Failed to send DM');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dm-messages', variables.peerId] });
      queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
    }
  });
}

// ── Room hooks ────────────────────────────────────────────────────

export interface Room {
  room_id: string;
  name: string;
  room_type: 'text' | 'voice' | 'hybrid';
  access_type: 'public' | 'private' | 'token_gated';
  token_id: string | null;
  creator_peer_id: string;
  capacity: number;
  description: string | null;
  created_at: number;
  members?: Array<{ peer_id: string; role: string; active: number }>;
}

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      if (typeof window !== 'undefined' && (window as any).path402?.getRooms) {
        return (window as any).path402.getRooms();
      }
      return fetchAPI<Room[]>('/api/rooms');
    },
    refetchInterval: 15_000,
  });
}

export function useRoom(roomId: string | null) {
  return useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      if (!roomId) return null;
      if (typeof window !== 'undefined' && (window as any).path402?.getRoom) {
        return (window as any).path402.getRoom(roomId);
      }
      return fetchAPI<Room>(`/api/rooms/${encodeURIComponent(roomId)}`);
    },
    enabled: !!roomId,
  });
}

export function useRoomMessages(roomId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['room-messages', roomId, limit],
    queryFn: async () => {
      if (!roomId) return [];
      if (typeof window !== 'undefined' && (window as any).path402?.getRoomMessages) {
        return (window as any).path402.getRoomMessages(roomId, limit);
      }
      return fetchAPI<any[]>(`/api/rooms/${encodeURIComponent(roomId)}/messages?limit=${limit}`);
    },
    enabled: !!roomId,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, roomType, accessType, tokenSymbol }: {
      name: string;
      roomType?: string;
      accessType?: string;
      tokenSymbol?: string;
    }) => {
      if (typeof window !== 'undefined' && (window as any).path402?.createRoom) {
        return (window as any).path402.createRoom(name, roomType, accessType, tokenSymbol);
      }
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roomType, accessType, tokenSymbol })
      });
      if (!res.ok) throw new Error('Failed to create room');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    }
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roomId: string) => {
      if (typeof window !== 'undefined' && (window as any).path402?.joinRoom) {
        return (window as any).path402.joinRoom(roomId);
      }
      const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to join room');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    }
  });
}

export function useLeaveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roomId: string) => {
      if (typeof window !== 'undefined' && (window as any).path402?.leaveRoom) {
        return (window as any).path402.leaveRoom(roomId);
      }
      const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to leave room');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    }
  });
}

export function useSendRoomMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, content }: { roomId: string; content: string }) => {
      if (typeof window !== 'undefined' && (window as any).path402?.sendRoomMessage) {
        return (window as any).path402.sendRoomMessage(roomId, content);
      }
      const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error('Failed to send room message');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['room-messages', variables.roomId] });
    }
  });
}
