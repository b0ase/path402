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
    autoAcquireEnabled: data.speculation?.autoAcquire || false
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
