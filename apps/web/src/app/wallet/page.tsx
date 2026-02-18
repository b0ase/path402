'use client';

import { Navigation } from '@/components/Navigation';
import { PageContainer, PageHeader } from '@/components/PageHeader';
import { StatusCard } from '@/components/StatusCard';
import { useWallet } from '@/hooks/useWallet';
import { useAppStore, CosmeticWallet } from '@/stores/app';
import { useState, useEffect, useCallback } from 'react';

function truncateAddress(address: string, len = 16): string {
  if (address.length <= len) return address;
  const half = Math.floor((len - 3) / 2);
  return `${address.slice(0, half)}...${address.slice(-half)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { });
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-zinc-400 hover:text-black dark:hover:text-white transition-colors uppercase tracking-wider"
      title="Copy to clipboard"
    >
      {copied ? '[COPIED]' : '[COPY]'}
    </button>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider border border-zinc-200 dark:border-zinc-800 text-zinc-500">
      {provider}
    </span>
  );
}

// ── Node Wallet Section ─────────────────────────────────────────

interface NodeWalletData {
  address: string;
  balanceSats: number;
  balanceBsv: string;
  funded: boolean;
  isNew: boolean;
}

function NodeWalletSection() {
  const [data, setData] = useState<NodeWalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNodeWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/node');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load node wallet');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodeWallet(); }, [fetchNodeWallet]);

  // Auto-refresh balance every 30s when unfunded
  useEffect(() => {
    if (!data || data.funded) return;
    const interval = setInterval(fetchNodeWallet, 30_000);
    return () => clearInterval(interval);
  }, [data, fetchNodeWallet]);

  if (loading) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center">
        <div className="inline-block w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-black dark:border-t-white rounded-full animate-spin mb-4" />
        <div className="text-zinc-500 text-xs">Initializing node wallet...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 dark:border-red-900 px-6 py-8 text-center">
        <div className="text-red-500 text-xs mb-4">{error}</div>
        <button
          onClick={fetchNodeWallet}
          className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.address)}&bgcolor=ffffff&color=000000`;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800">
      {/* Status bar */}
      <div className={`px-6 py-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold ${data.funded
        ? 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400 border-b border-green-200 dark:border-green-900'
        : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900'
        }`}>
        <span className={`w-2 h-2 rounded-full ${data.funded ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
        {data.funded ? 'Funded & Ready' : 'Awaiting Funding'}
        {data.isNew && <span className="ml-2 text-zinc-400">(New Key Generated)</span>}
      </div>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
        {/* Left: QR + Address */}
        <div className="px-6 py-8 flex flex-col items-center gap-4">
          <div className="bg-white p-3 border border-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`QR code for ${data.address}`}
              width={200}
              height={200}
              className="block"
            />
          </div>

          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">BSV Address</div>
            <div className="font-mono text-xs break-all max-w-[280px] leading-relaxed">
              {data.address}
            </div>
            <div className="mt-2">
              <CopyButton text={data.address} />
            </div>
          </div>
        </div>

        {/* Right: Balance + Instructions */}
        <div className="px-6 py-8 flex flex-col justify-between">
          <div>
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Balance</div>
              <div className="text-3xl font-bold font-mono">
                {data.balanceBsv} <span className="text-sm text-zinc-400">BSV</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {data.balanceSats.toLocaleString()} satoshis
              </div>
            </div>

            {!data.funded && (
              <div className="border-l-2 border-amber-500 pl-4 py-2 mb-6">
                <div className="text-xs font-bold text-zinc-900 dark:text-white mb-1">
                  Fund this address to mint tokens
                </div>
                <div className="text-xs text-zinc-500 leading-relaxed">
                  Scan the QR code with any BSV wallet (HandCash, Yours, RelayX)
                  and send any amount. Even $0.10 is enough for hundreds of mints.
                </div>
              </div>
            )}

            {data.funded && (
              <div className="border-l-2 border-green-500 pl-4 py-2 mb-6">
                <div className="text-xs font-bold text-zinc-900 dark:text-white mb-1">
                  Ready to mint
                </div>
                <div className="text-xs text-zinc-500 leading-relaxed">
                  Your node wallet is funded. Go to <a href="/mint" className="underline hover:text-black dark:hover:text-white">/mint</a> to
                  create BSV-21 tokens.
                </div>
              </div>
            )}
          </div>

          <button
            onClick={fetchNodeWallet}
            className="w-full py-2 text-[10px] uppercase tracking-[0.2em] border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-black dark:hover:text-white hover:border-black dark:hover:border-white transition-colors"
          >
            Refresh Balance
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function WalletPage() {
  const {
    primaryWallet,
    cosmeticWallets,
    balanceSats,
    balanceFormatted,
    isConnected,
    disconnect,
    openModal,
    refreshBalance
  } = useWallet();

  const removeCosmeticWallet = useAppStore((s) => s.removeCosmeticWallet);

  return (
    <PageContainer>
      <Navigation />
      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="WALLET"
          extension=".SYS"
          superTitle={
            <>
              {isConnected && (
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
              Multi-Chain Wallet Manager
            </>
          }
          description={
            <span className="text-xs">
              BRC-100 compatible. BSV is the primary settlement layer.
              ETH/SOL are display-only &quot;captured&quot; chains.
            </span>
          }
        />

        {/* ── Node Wallet (server-side key) ───────────────────────────── */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            Node Wallet
          </div>
          <div className="mb-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-black dark:border-white">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Your node&apos;s signing key. Auto-generated on first visit, stored in <code className="text-zinc-900 dark:text-zinc-100">~/.pathd/config.json</code>.
              Fund it to enable minting and on-chain operations.
            </p>
          </div>
          <NodeWalletSection />
        </section>

        {/* ── Balance Overview ──────────────────────────────────────── */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            Balance Overview
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-zinc-200 dark:border-zinc-800">
            <div className="border-r border-b border-zinc-200 dark:border-zinc-800 md:border-b-0">
              <StatusCard
                title="BSV Balance"
                value={isConnected ? balanceFormatted : '--'}
                subtitle={isConnected && balanceSats > 0 ? `${balanceSats.toLocaleString()} satoshis` : undefined}
                color="cyan"
              />
            </div>
            <div className="border-b border-zinc-200 dark:border-zinc-800 md:border-r md:border-b-0">
              <StatusCard
                title="ETH (Cosmetic)"
                value={cosmeticWallets.find((w: CosmeticWallet) => w.chain === 'eth') ? 'Connected' : '--'}
                subtitle={cosmeticWallets.find((w: CosmeticWallet) => w.chain === 'eth')?.address.slice(0, 10) + '...' || undefined}
                color="purple"
              />
            </div>
            <div className="border-r border-zinc-200 dark:border-zinc-800">
              <StatusCard
                title="SOL (Cosmetic)"
                value={cosmeticWallets.find((w: CosmeticWallet) => w.chain === 'sol') ? 'Connected' : '--'}
                subtitle={cosmeticWallets.find((w: CosmeticWallet) => w.chain === 'sol')?.address.slice(0, 10) + '...' || undefined}
                color="purple"
              />
            </div>
            <div>
              <StatusCard
                title="Status"
                value={isConnected ? 'Active' : 'Disconnected'}
                subtitle={primaryWallet?.provider ? `via ${primaryWallet.provider}` : undefined}
                color={isConnected ? 'green' : 'white'}
              />
            </div>
          </div>
        </section>

        {/* ── Primary Wallet ───────────────────────────────────────── */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            Primary Wallet (BSV)
          </div>

          {isConnected && primaryWallet ? (
            <div className="border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Provider</div>
                <ProviderBadge provider={primaryWallet.provider} />
              </div>
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Address</div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">{truncateAddress(primaryWallet.address, 24)}</span>
                  <CopyButton text={primaryWallet.address} />
                </div>
              </div>
              {primaryWallet.label && (
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Label</div>
                  <span className="text-sm">{primaryWallet.label}</span>
                </div>
              )}
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Balance</div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{balanceFormatted}</span>
                  <button
                    onClick={refreshBalance}
                    className="text-[10px] text-zinc-400 hover:text-black dark:hover:text-white transition-colors uppercase tracking-wider"
                  >
                    [REFRESH]
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 flex justify-end">
                <button
                  onClick={disconnect}
                  className="px-4 py-2 text-[10px] uppercase tracking-[0.2em] border border-red-300 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center">
              <div className="text-4xl mb-4 opacity-20">&#x2205;</div>
              <div className="text-zinc-500 text-xs mb-6">No wallet connected</div>
              <button
                onClick={openModal}
                className="px-6 py-2 text-[10px] uppercase tracking-[0.2em] bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-80 transition-opacity"
              >
                Connect Wallet
              </button>
            </div>
          )}
        </section>

        {/* ── Connected Providers ───────────────────────────────────── */}
        {(isConnected || cosmeticWallets.length > 0) && (
          <section className="mb-12">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              Connected Providers
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="text-left px-6 py-3 font-bold">Chain</th>
                    <th className="text-left px-6 py-3 font-bold">Provider</th>
                    <th className="text-left px-6 py-3 font-bold">Address</th>
                    <th className="text-left px-6 py-3 font-bold">Role</th>
                    <th className="text-right px-6 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {primaryWallet && (
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-3 font-bold">BSV</td>
                      <td className="px-6 py-3"><ProviderBadge provider={primaryWallet.provider} /></td>
                      <td className="px-6 py-3 font-mono text-xs">{truncateAddress(primaryWallet.address, 20)}</td>
                      <td className="px-6 py-3 text-green-500 text-[10px] uppercase tracking-wider font-bold">Primary</td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={disconnect}
                          className="text-[10px] text-red-500 hover:text-red-400 uppercase tracking-wider"
                        >
                          [DISCONNECT]
                        </button>
                      </td>
                    </tr>
                  )}
                  {cosmeticWallets.map((w: CosmeticWallet) => (
                    <tr key={w.chain} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-3 font-bold">{w.chain.toUpperCase()}</td>
                      <td className="px-6 py-3"><ProviderBadge provider={w.chain === 'eth' ? 'MetaMask' : 'Phantom'} /></td>
                      <td className="px-6 py-3 font-mono text-xs">{truncateAddress(w.address, 20)}</td>
                      <td className="px-6 py-3 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">Cosmetic</td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => removeCosmeticWallet(w.chain)}
                          className="text-[10px] text-red-500 hover:text-red-400 uppercase tracking-wider"
                        >
                          [REMOVE]
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── BSV Primacy Notice ────────────────────────────────────── */}
        <section className="mb-12">
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-black dark:border-white">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2">BSV Settlement Primacy</div>
            <div className="text-xs text-zinc-500 leading-relaxed space-y-1">
              <p>
                All $402 protocol payments are settled on Bitcoin SV. ETH and SOL connections
                are display-only &mdash; they show balances but cannot be used for content acquisition.
              </p>
              <p>
                Cross-chain bridging and send/receive functionality will be available in a future release.
              </p>
            </div>
          </div>
        </section>

        {/* ── Transaction History Placeholder ───────────────────────── */}
        <section className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            Transaction History
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center">
            <div className="text-zinc-500 text-xs">
              Transaction history will be available in v2.
            </div>
          </div>
        </section>
      </main>
    </PageContainer>
  );
}
