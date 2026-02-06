'use client';

import { useWallet } from '@/hooks/useWallet';

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { primaryWallet, isConnected, openModal } = useWallet();

  if (!isConnected || !primaryWallet) {
    return (
      <button
        onClick={openModal}
        className="px-6 h-full flex items-center text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-colors whitespace-nowrap bg-zinc-50 dark:bg-zinc-900/10 text-zinc-500 hover:text-black dark:hover:text-white border-l border-zinc-200 dark:border-zinc-800"
      >
        Connect
      </button>
    );
  }

  return (
    <button
      onClick={openModal}
      className="px-6 h-full flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-colors whitespace-nowrap bg-zinc-50 dark:bg-zinc-900/10 text-zinc-500 hover:text-black dark:hover:text-white border-l border-zinc-200 dark:border-zinc-800"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
      {truncateAddress(primaryWallet.address)}
    </button>
  );
}
