'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = 'http://localhost:4021';

export interface Identity401Data {
  handle: string;
  identity: {
    symbol: string;
    tokenId: string;
    broadcastStatus: string;
  } | null;
  strength: {
    level: string;
    levelNumber: number;
    label: string;
    score: number;
  };
  strandCount: number;
  strands: Array<{
    provider: string;
    strandType: string;
    strandSubtype: string | null;
    label: string | null;
    source: string;
    onChain: boolean;
  }>;
}

export interface IdentityToken {
  id: number;
  symbol: string;
  token_id: string;
  issuer_address: string;
  total_supply: string;
  decimals: number;
  access_rate: number;
  inscription_data: string | null;
  broadcast_txid: string | null;
  broadcast_status: 'local' | 'pending' | 'confirmed' | 'failed';
  metadata: string | null;
  created_at: number;
}

export interface CallRecord {
  id: number;
  call_id: string;
  caller_peer_id: string;
  callee_peer_id: string;
  caller_token_symbol: string | null;
  callee_token_symbol: string | null;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  caller_tokens_sent: string;
  callee_tokens_sent: string;
  settlement_status: 'pending' | 'settled' | 'disputed';
  settlement_txid: string | null;
  settlement_data: string | null;
  created_at: number;
}

function getIPC(): any | null {
  if (typeof window !== 'undefined' && (window as any).path402) {
    return (window as any).path402;
  }
  return null;
}

export function useIdentity() {
  const queryClient = useQueryClient();
  const ipc = getIPC();

  const identityQuery = useQuery({
    queryKey: ['identity'],
    queryFn: async (): Promise<IdentityToken | null> => {
      if (ipc?.getIdentity) {
        return ipc.getIdentity();
      }
      try {
        const res = await fetch(`${API_BASE}/api/identity`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 5000,
  });

  const balanceQuery = useQuery({
    queryKey: ['identity-balance'],
    queryFn: async (): Promise<string> => {
      if (ipc?.getIdentityBalance) {
        return ipc.getIdentityBalance();
      }
      try {
        const res = await fetch(`${API_BASE}/api/identity/balance`);
        if (!res.ok) return '0';
        const data = await res.json();
        return data.balance || '0';
      } catch {
        return '0';
      }
    },
    refetchInterval: 5000,
    enabled: !!identityQuery.data,
  });

  const callRecordsQuery = useQuery({
    queryKey: ['call-records'],
    queryFn: async (): Promise<CallRecord[]> => {
      if (ipc?.getCallRecords) {
        return ipc.getCallRecords(50);
      }
      try {
        const res = await fetch(`${API_BASE}/api/identity/calls`);
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    refetchInterval: 10000,
  });

  const identity401Query = useQuery({
    queryKey: ['identity-401'],
    queryFn: async (): Promise<Identity401Data | null> => {
      if (ipc?.getIdentity401) {
        return ipc.getIdentity401();
      }
      try {
        const res = await fetch(`${API_BASE}/api/identity/401`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
    enabled: !!identityQuery.data,
  });

  const mintMutation = useMutation({
    mutationFn: async (symbol: string) => {
      if (ipc?.mintIdentity) {
        return ipc.mintIdentity(symbol);
      }
      const res = await fetch(`${API_BASE}/api/identity/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Mint failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity'] });
      queryClient.invalidateQueries({ queryKey: ['identity-balance'] });
    },
  });

  return {
    identity: identityQuery.data ?? null,
    balance: balanceQuery.data ?? '0',
    callRecords: callRecordsQuery.data ?? [],
    identity401: identity401Query.data ?? null,
    isLoading: identityQuery.isLoading,
    isMinting: mintMutation.isPending,
    mintError: mintMutation.error?.message ?? null,
    mint: mintMutation.mutateAsync,
  };
}
