'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/app';
import { WalletModal } from '@/components/WalletModal';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return <>{children}</>;
}

function WalletProvider({ children }: { children: React.ReactNode }) {
  const primaryWallet = useAppStore((s) => s.primaryWallet);
  const setBalance = useAppStore((s) => s.setBalance);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-validate persisted connection + poll balance
  useEffect(() => {
    if (!primaryWallet) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const fetchBalance = async () => {
      try {
        // Try Electron IPC
        if (typeof window !== 'undefined' && window.path402?.getWalletBalance) {
          const sats = await window.path402.getWalletBalance();
          setBalance(sats);
          return;
        }

        // Try HTTP API
        const baseUrl = typeof window !== 'undefined' && window.path402?.getApiUrl
          ? await window.path402.getApiUrl()
          : 'http://localhost:4021';
        const res = await fetch(`${baseUrl}/api/wallet/balance`);
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balanceSats ?? 0);
        }
      } catch {
        // silent - API may not be ready
      }
    };

    // Initial fetch
    fetchBalance();

    // Poll every 30s
    intervalRef.current = setInterval(fetchBalance, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [primaryWallet, setBalance]);

  // Suppress MetaMask unhandled rejection crashes
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason?.message || event.reason || '');
      if (
        msg.includes('MetaMask') ||
        msg.includes('ethereum') ||
        msg.includes('User rejected') ||
        msg.includes('Already processing')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return (
    <>
      {children}
      <WalletModal />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000, // 5 seconds
            refetchInterval: 5 * 1000 // Poll every 5 seconds
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WalletProvider>
          {children}
        </WalletProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
