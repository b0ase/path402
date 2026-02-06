'use client';

import { Navigation } from '@/components/Navigation';
import { PageContainer, PageHeader } from '@/components/PageHeader';
import { StatusCard } from '@/components/StatusCard';
import { useWallet } from '@/hooks/useWallet';
import { useAppStore, CosmeticWallet } from '@/stores/app';

function truncateAddress(address: string, len = 16): string {
  if (address.length <= len) return address;
  const half = Math.floor((len - 3) / 2);
  return `${address.slice(0, half)}...${address.slice(-half)}`;
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => { });
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-zinc-400 hover:text-black dark:hover:text-white transition-colors uppercase tracking-wider"
      title="Copy to clipboard"
    >
      [COPY]
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
