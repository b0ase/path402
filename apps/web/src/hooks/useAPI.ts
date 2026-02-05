'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// API base URL - uses Electron IPC if available, otherwise HTTP
const API_BASE = typeof window !== 'undefined' && (window as any).path402
  ? null // Use IPC
  : 'http://localhost:4021';

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
  // Try Electron IPC first
  if (typeof window !== 'undefined' && (window as any).path402) {
    const ipc = (window as any).path402;
    if (endpoint === '/api/status') {
      return ipc.getStatus();
    }
  }

  // Fall back to HTTP
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// Hooks
export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => fetchAPI<AgentStatus>('/api/status')
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
