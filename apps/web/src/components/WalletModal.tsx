'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app';
import { useWallet } from '@/hooks/useWallet';

type ModalView = 'providers' | 'handcash' | 'manual';

export function WalletModal() {
  const showWalletModal = useAppStore((s) => s.showWalletModal);
  const {
    isConnecting,
    connectionError,
    connectHandCash,
    connectYours,
    connectMetanet,
    connectManualKey,
    connectMetaMask,
    connectPhantom,
    closeModal
  } = useWallet();

  const [view, setView] = useState<ModalView>('providers');
  const [handle, setHandle] = useState('');
  const [wif, setWif] = useState('');

  if (!showWalletModal) return null;

  const handleClose = () => {
    setView('providers');
    setHandle('');
    setWif('');
    closeModal();
  };

  const handleHandCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connectHandCash(handle);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connectManualKey(wif);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold">
            {view === 'providers' && 'Connect Wallet'}
            {view === 'handcash' && 'HandCash'}
            {view === 'manual' && 'Import Key'}
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors text-xs"
          >
            [ESC]
          </button>
        </div>

        {/* Error */}
        {connectionError && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
            {connectionError}
          </div>
        )}

        {/* Loading */}
        {isConnecting && (
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-3 h-3 border border-black dark:border-white border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Connecting...</span>
          </div>
        )}

        {/* Provider List */}
        {view === 'providers' && (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {/* BSV Section */}
            <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-950">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                BSV &mdash; Primary Settlement
              </div>
            </div>

            <button
              onClick={() => setView('handcash')}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">HandCash</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Enter $handle or paymail</div>
              </div>
              <span className="text-zinc-400 text-xs">&rarr;</span>
            </button>

            <button
              onClick={() => { connectYours(); }}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">Yours / Panda</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                  {(typeof window !== 'undefined' && (window.yours || window.panda))
                    ? 'Extension detected'
                    : 'Extension not detected'}
                </div>
              </div>
              <span className="text-zinc-400 text-xs">&rarr;</span>
            </button>

            <button
              onClick={() => { connectMetanet(); }}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">Babbage / Metanet</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                  {(typeof window !== 'undefined' && window.path402?.isElectron)
                    ? 'Desktop client detected'
                    : 'Requires desktop client'}
                </div>
              </div>
              <span className="text-zinc-400 text-xs">&rarr;</span>
            </button>

            <button
              onClick={() => setView('manual')}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">Manual Key</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Import WIF private key</div>
              </div>
              <span className="text-zinc-400 text-xs">&rarr;</span>
            </button>

            {/* Cosmetic Chains Section */}
            <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-950">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                Other Chains &mdash; Display Only
              </div>
            </div>

            <button
              onClick={() => { connectMetaMask(); }}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">MetaMask</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                  {(typeof window !== 'undefined' && window.ethereum?.isMetaMask)
                    ? 'Extension detected'
                    : 'Extension not detected'}
                </div>
              </div>
              <span className="text-zinc-400 text-xs">ETH</span>
            </button>

            <button
              onClick={() => { connectPhantom(); }}
              disabled={isConnecting}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors disabled:opacity-50 text-left"
            >
              <div>
                <div className="text-sm font-bold">Phantom</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                  {(typeof window !== 'undefined' && window.solana?.isPhantom)
                    ? 'Extension detected'
                    : 'Extension not detected'}
                </div>
              </div>
              <span className="text-zinc-400 text-xs">SOL</span>
            </button>

            {/* Footer note */}
            <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-950">
              <div className="text-[10px] text-zinc-500 leading-relaxed">
                All payments route through BSV. ETH/SOL connections are display-only.
              </div>
            </div>
          </div>
        )}

        {/* HandCash Entry */}
        {view === 'handcash' && (
          <form onSubmit={handleHandCashSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">
                $handle or paymail
              </label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="$myhandle or name@handcash.io"
                autoFocus
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm font-mono focus:border-black dark:focus:border-white focus:outline-none transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setView('providers')}
                className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!handle.trim() || isConnecting}
                className="flex-1 px-4 py-2 text-[10px] uppercase tracking-[0.2em] bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-80 transition-opacity disabled:opacity-30"
              >
                Connect
              </button>
            </div>
          </form>
        )}

        {/* Manual Key Entry */}
        {view === 'manual' && (
          <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
            <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-black dark:border-white text-[10px] text-zinc-500 leading-relaxed">
              Import a BSV WIF private key. The key will be sent to the backend only
              and never stored in the browser.
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">
                WIF Private Key
              </label>
              <input
                type="password"
                value={wif}
                onChange={(e) => setWif(e.target.value)}
                placeholder="L5EZftvrYaSudiozVRzTqL..."
                autoFocus
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm font-mono focus:border-black dark:focus:border-white focus:outline-none transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setView('providers'); setWif(''); }}
                className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!wif.trim() || isConnecting}
                className="flex-1 px-4 py-2 text-[10px] uppercase tracking-[0.2em] bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-80 transition-opacity disabled:opacity-30"
              >
                Import
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
