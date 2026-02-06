import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

// ── Wallet Types ────────────────────────────────────────────────

export type BSVProvider = 'handcash' | 'yours' | 'metanet' | 'manual';
export type CosmeticChain = 'eth' | 'sol';

export interface PrimaryWallet {
  provider: BSVProvider;
  address: string;
  label?: string; // e.g. HandCash handle, Yours paymail
}

export interface CosmeticWallet {
  chain: CosmeticChain;
  address: string;
  label?: string;
}

// ── Store Interface ─────────────────────────────────────────────

interface AppState {
  // Theme
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Wallet
  primaryWallet: PrimaryWallet | null;
  cosmeticWallets: CosmeticWallet[];
  isConnecting: boolean;
  connectionError: string | null;
  showWalletModal: boolean;
  balanceSats: number;
  balanceFormatted: string;

  // Wallet actions
  setPrimaryWallet: (wallet: PrimaryWallet | null) => void;
  addCosmeticWallet: (wallet: CosmeticWallet) => void;
  removeCosmeticWallet: (chain: CosmeticChain) => void;
  setIsConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setShowWalletModal: (show: boolean) => void;
  setBalance: (sats: number) => void;
  disconnectAll: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatSats(sats: number): string {
  if (sats >= 100_000_000) {
    return `${(sats / 100_000_000).toFixed(4)} BSV`;
  }
  return `${sats.toLocaleString()} SAT`;
}

// ── Store ───────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),

      // Wallet state
      primaryWallet: null,
      cosmeticWallets: [],
      isConnecting: false,
      connectionError: null,
      showWalletModal: false,
      balanceSats: 0,
      balanceFormatted: '0 SAT',

      // Wallet actions
      setPrimaryWallet: (wallet) => set({ primaryWallet: wallet, connectionError: null }),
      addCosmeticWallet: (wallet) => set((state) => ({
        cosmeticWallets: [
          ...state.cosmeticWallets.filter((w) => w.chain !== wallet.chain),
          wallet
        ]
      })),
      removeCosmeticWallet: (chain) => set((state) => ({
        cosmeticWallets: state.cosmeticWallets.filter((w) => w.chain !== chain)
      })),
      setIsConnecting: (connecting) => set({ isConnecting: connecting }),
      setConnectionError: (error) => set({ connectionError: error, isConnecting: false }),
      setShowWalletModal: (show) => set({ showWalletModal: show }),
      setBalance: (sats) => set({ balanceSats: sats, balanceFormatted: formatSats(sats) }),
      disconnectAll: () => set({
        primaryWallet: null,
        cosmeticWallets: [],
        balanceSats: 0,
        balanceFormatted: '0 SAT',
        connectionError: null
      })
    }),
    {
      name: 'path402-app-store',
      partialize: (state) => ({
        theme: state.theme,
        primaryWallet: state.primaryWallet,
        cosmeticWallets: state.cosmeticWallets
      })
    }
  )
);
