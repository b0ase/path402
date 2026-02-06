'use client';

import { useCallback } from 'react';
import { useAppStore, BSVProvider } from '@/stores/app';

// ── Electron IPC bridge type ────────────────────────────────────

declare global {
  interface Window {
    path402?: {
      getStatus: () => Promise<any>;
      setSpeculation: (enabled: boolean) => Promise<void>;
      setAutoAcquire: (enabled: boolean) => Promise<void>;
      getApiUrl: () => Promise<string>;
      onAgentReady: (callback: (status: any) => void) => void;
      platform: string;
      version: string;
      isElectron: boolean;
      // Wallet IPC
      connectWallet?: (provider: string, opts?: any) => Promise<{ address: string; label?: string }>;
      disconnectWallet?: () => Promise<void>;
      getWalletBalance?: () => Promise<number>;
      getWalletAddress?: () => Promise<string>;
      importWalletKey?: (wif: string) => Promise<{ address: string }>;
    };
    // Browser extension wallets
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
    };
    yours?: {
      isReady: boolean;
      connect: () => Promise<{ address: string; paymail?: string }>;
    };
    panda?: {
      isReady: boolean;
      connect: () => Promise<{ address: string; paymail?: string }>;
    };
  }
}

// ── Helper: fetch balance via API ───────────────────────────────

async function fetchBalanceFromAPI(): Promise<number> {
  // Try Electron IPC first
  if (typeof window !== 'undefined' && window.path402?.getWalletBalance) {
    try {
      return await window.path402.getWalletBalance();
    } catch {
      // fall through to HTTP
    }
  }

  // Try HTTP API
  try {
    const baseUrl = typeof window !== 'undefined' && window.path402?.getApiUrl
      ? await window.path402.getApiUrl()
      : 'http://localhost:4021';
    const res = await fetch(`${baseUrl}/api/wallet/balance`);
    if (res.ok) {
      const data = await res.json();
      return data.balanceSats ?? 0;
    }
  } catch {
    // API not available
  }

  return 0;
}

// ── Hook ────────────────────────────────────────────────────────

export function useWallet() {
  const {
    primaryWallet,
    cosmeticWallets,
    isConnecting,
    connectionError,
    balanceSats,
    balanceFormatted,
    setPrimaryWallet,
    addCosmeticWallet,
    removeCosmeticWallet,
    setIsConnecting,
    setConnectionError,
    setShowWalletModal,
    setBalance,
    disconnectAll
  } = useAppStore();

  // ── BSV Provider: HandCash ──────────────────────────────────

  const connectHandCash = useCallback(async (handle: string) => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      // V1: Accept handle/paymail as address placeholder
      // Real OAuth will be added in v2
      const cleanHandle = handle.replace(/^[$@]/, '').trim();
      if (!cleanHandle) throw new Error('Invalid HandCash handle');

      const address = `$${cleanHandle}`;

      // Try to connect via IPC if available
      if (window.path402?.connectWallet) {
        await window.path402.connectWallet('handcash', { handle: cleanHandle });
      }

      setPrimaryWallet({ provider: 'handcash', address, label: cleanHandle });
      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'HandCash connection failed');
    }
  }, [setPrimaryWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── BSV Provider: Yours.org / Panda ─────────────────────────

  const connectYours = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const provider = window.yours || window.panda;
      if (!provider) {
        throw new Error('Yours / Panda wallet not detected. Install the browser extension.');
      }

      const result = await provider.connect();
      const address = result.address;
      const label = result.paymail || undefined;

      if (window.path402?.connectWallet) {
        await window.path402.connectWallet('yours', { address });
      }

      setPrimaryWallet({ provider: 'yours', address, label });
      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Yours wallet connection failed');
    }
  }, [setPrimaryWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── BSV Provider: Metanet / Babbage ─────────────────────────

  const connectMetanet = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      if (window.path402?.connectWallet) {
        const result = await window.path402.connectWallet('metanet');
        setPrimaryWallet({ provider: 'metanet', address: result.address, label: result.label });
      } else {
        throw new Error('Metanet requires the desktop client. Run via Electron.');
      }

      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Metanet connection failed');
    }
  }, [setPrimaryWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── BSV Provider: Manual Key ────────────────────────────────

  const connectManualKey = useCallback(async (wif: string) => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      if (!wif || wif.length < 50) {
        throw new Error('Invalid WIF key format');
      }

      let address: string;

      if (window.path402?.importWalletKey) {
        const result = await window.path402.importWalletKey(wif);
        address = result.address;
      } else {
        // Derive address client-side for display only (key NOT stored in browser)
        // In web-only mode, we just store that it's a manual connection
        address = `1${wif.slice(1, 8)}...${wif.slice(-4)}`;
      }

      setPrimaryWallet({ provider: 'manual', address, label: 'Manual Key' });
      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Key import failed');
    }
  }, [setPrimaryWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── Cosmetic: MetaMask (ETH) ────────────────────────────────

  const connectMetaMask = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      if (!window.ethereum?.isMetaMask) {
        throw new Error('MetaMask not detected');
      }

      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask');
      }

      addCosmeticWallet({ chain: 'eth', address: accounts[0] });
      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err: any) {
      // Suppress MetaMask user-rejected errors silently
      if (err?.code === 4001) {
        setIsConnecting(false);
        return;
      }
      setConnectionError(err instanceof Error ? err.message : 'MetaMask connection failed');
    }
  }, [addCosmeticWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── Cosmetic: Phantom (SOL) ─────────────────────────────────

  const connectPhantom = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      if (!window.solana?.isPhantom) {
        throw new Error('Phantom wallet not detected');
      }

      const resp = await window.solana.connect();
      const address = resp.publicKey.toString();

      addCosmeticWallet({ chain: 'sol', address });
      setIsConnecting(false);
      setShowWalletModal(false);
    } catch (err: any) {
      // Suppress user-rejected
      if (err?.code === 4001 || err?.message?.includes('User rejected')) {
        setIsConnecting(false);
        return;
      }
      setConnectionError(err instanceof Error ? err.message : 'Phantom connection failed');
    }
  }, [addCosmeticWallet, setIsConnecting, setConnectionError, setShowWalletModal]);

  // ── Disconnect ──────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    try {
      if (window.path402?.disconnectWallet) {
        await window.path402.disconnectWallet();
      }
    } catch {
      // ignore disconnect errors
    }
    disconnectAll();
  }, [disconnectAll]);

  // ── Refresh Balance ─────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    if (!primaryWallet) return;
    try {
      const sats = await fetchBalanceFromAPI();
      setBalance(sats);
    } catch {
      // silent fail on balance refresh
    }
  }, [primaryWallet, setBalance]);

  // ── Connect by provider name ────────────────────────────────

  const connectProvider = useCallback(async (provider: BSVProvider, opts?: { handle?: string; wif?: string }) => {
    switch (provider) {
      case 'handcash':
        return connectHandCash(opts?.handle || '');
      case 'yours':
        return connectYours();
      case 'metanet':
        return connectMetanet();
      case 'manual':
        return connectManualKey(opts?.wif || '');
    }
  }, [connectHandCash, connectYours, connectMetanet, connectManualKey]);

  return {
    // State
    primaryWallet,
    cosmeticWallets,
    isConnecting,
    connectionError,
    balanceSats,
    balanceFormatted,
    isConnected: !!primaryWallet,

    // BSV connections
    connectHandCash,
    connectYours,
    connectMetanet,
    connectManualKey,
    connectProvider,

    // Cosmetic connections
    connectMetaMask,
    connectPhantom,

    // Actions
    disconnect,
    refreshBalance,
    openModal: () => setShowWalletModal(true),
    closeModal: () => setShowWalletModal(false)
  };
}
