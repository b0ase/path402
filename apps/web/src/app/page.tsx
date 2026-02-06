'use client';

import { Navigation } from '@/components/Navigation';
import { useStatus, usePortfolio, usePeers, useToggleSpeculation, useToggleAutoAcquire } from '@/hooks/useAPI';
import { motion } from 'framer-motion';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { useAppStore } from '@/stores/app';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatSats(sats: number): string {
  if (Math.abs(sats) >= 1000000) return `${(sats / 1000000).toFixed(2)}M`;
  if (Math.abs(sats) >= 1000) return `${(sats / 1000).toFixed(1)}K`;
  return sats.toLocaleString();
}

// ── Status Helpers ───────────────────────────────────────────────

type StatusLevel = 'good' | 'warn' | 'error' | 'off';

function StatusDot({ level }: { level: StatusLevel }) {
  const c = { good: 'bg-green-500', warn: 'bg-yellow-500', error: 'bg-red-500', off: 'bg-zinc-600' };
  const ping = level === 'good' || level === 'warn';
  return (
    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
      {ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c[level]} opacity-75`} />}
      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${c[level]}`} />
    </span>
  );
}

function SystemRow({ level, label, value, detail }: { level: StatusLevel; label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <StatusDot level={level} />
      <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-500 font-bold w-20 flex-shrink-0">{label}</span>
      <span className="text-[10px] font-mono font-bold truncate">{value}</span>
      {detail && <span className="text-[9px] text-zinc-500 truncate hidden md:inline">&mdash; {detail}</span>}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function HomePage() {
  const { data: status, isError: statusError, isFetching: statusFetching } = useStatus();
  const { data: portfolio } = usePortfolio();
  const { data: peers } = usePeers();
  const toggleSpeculation = useToggleSpeculation();
  const toggleAutoAcquire = useToggleAutoAcquire();

  const primaryWallet = useAppStore((s) => s.primaryWallet);
  const balanceFormatted = useAppStore((s) => s.balanceFormatted);

  const backendOnline = !!status;
  const walletConnected = !!primaryWallet;
  const peerCount = status?.peersConnected ?? 0;
  const knownPeers = status?.peersKnown ?? 0;
  const speculationOn = status?.speculationEnabled ?? false;
  const autoAcquireOn = status?.autoAcquireEnabled ?? false;

  const issues: string[] = [];
  if (!backendOnline) issues.push('Backend offline');
  if (!walletConnected) issues.push('No wallet');
  if (backendOnline && peerCount === 0) issues.push('No peers');
  const overallLevel: StatusLevel = !backendOnline ? 'error' : issues.length > 1 ? 'warn' : issues.length === 1 && !walletConnected ? 'warn' : 'good';

  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-6 max-w-[1920px] mx-auto">
        <PageHeader
          title="$402_CLIENT"
          extension=""
          superTitle={
            <>
              <StatusDot level={overallLevel} />
              {backendOnline
                ? `Node Online \u2022 Up ${formatUptime(status.uptime)}`
                : statusFetching ? 'Connecting...' : 'Backend not responding'}
            </>
          }
          description={
            backendOnline ? (
              <>Node <span className="text-black dark:text-white font-mono bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 text-xs">{status.nodeId?.slice(0, 12)}...</span></>
            ) : (
              <span className="text-zinc-500 text-xs">Backend not responding. Will reconnect automatically.</span>
            )
          }
          icon="$"
        />

        {/* ── SYSTEM STATUS ──────────────────────────────────────── */}
        <section className="mb-8">
          <div className="border border-zinc-200 dark:border-zinc-800">
            <div className={`px-4 py-2 flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 ${
              overallLevel === 'good' ? 'bg-green-50 dark:bg-green-950/20' :
              overallLevel === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950/20' :
              'bg-red-50 dark:bg-red-950/20'
            }`}>
              <StatusDot level={overallLevel} />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                {overallLevel === 'good' && 'All systems operational'}
                {overallLevel === 'warn' && `Attention: ${issues.join(', ')}`}
                {overallLevel === 'error' && `Offline: ${issues.join(', ')}`}
              </span>
            </div>
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
              <div className="px-4 py-2">
                <SystemRow
                  level={backendOnline ? 'good' : statusFetching ? 'warn' : 'error'}
                  label="Backend"
                  value={backendOnline ? 'Online' : statusFetching ? 'Connecting...' : 'Offline'}
                  detail={backendOnline ? `Up ${formatUptime(status.uptime)}` : statusError ? 'Cannot reach localhost:4021' : undefined}
                />
                <SystemRow
                  level={walletConnected ? 'good' : 'off'}
                  label="Wallet"
                  value={walletConnected ? `${primaryWallet.provider} \u2022 ${balanceFormatted}` : 'Not connected'}
                  detail={walletConnected ? primaryWallet.address : 'Click CONNECT in nav'}
                />
                <SystemRow
                  level={peerCount > 0 ? 'good' : backendOnline ? 'warn' : 'off'}
                  label="P2P"
                  value={backendOnline ? `${peerCount} peers, ${knownPeers} known` : 'Waiting'}
                  detail={peerCount > 0 ? 'Gossip active' : backendOnline ? 'Listening...' : undefined}
                />
              </div>
              <div className="px-4 py-2">
                <SystemRow
                  level={backendOnline ? 'good' : 'off'}
                  label="Encryption"
                  value={backendOnline ? 'Noise Protocol' : 'Inactive'}
                  detail={backendOnline ? 'E2E encrypted' : undefined}
                />
                <SystemRow
                  level={speculationOn ? 'good' : 'off'}
                  label="Speculate"
                  value={speculationOn ? 'On' : 'Off'}
                  detail={speculationOn ? 'Auto-buying high-momentum tokens' : 'Idle'}
                />
                <SystemRow
                  level={autoAcquireOn ? 'good' : 'off'}
                  label="Sweep"
                  value={autoAcquireOn ? 'On' : 'Off'}
                  detail={autoAcquireOn ? 'Consolidating holdings' : 'Idle'}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── METRICS GRID ───────────────────────────────────────── */}
        <section className="mb-8">
          <div className="section-label">Live Metrics</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {[
              { label: 'Gossip Reach', value: backendOnline ? String(status.peersKnown || 0) : '--', sub: 'Nodes discovered', primary: false, accent: false },
              { label: 'Asset Index', value: backendOnline ? String(status.tokensKnown || 0) : '--', sub: 'Content paths', primary: false, accent: false },
              { label: 'Net Liquidity', value: backendOnline ? formatSats(status.portfolioValue || 0) : '--', sub: 'Portfolio (SAT)', primary: true, accent: false },
              { label: 'Performance', value: backendOnline ? `${status.totalPnL && status.totalPnL >= 0 ? '+' : ''}${formatSats(status.totalPnL || 0)}` : '--', sub: 'P&L (SAT)', primary: false, accent: true },
            ].map((metric, i) => (
              <div
                key={metric.label}
                className={`p-5 bg-zinc-50/50 dark:bg-zinc-900/10 hover:bg-white dark:hover:bg-zinc-800/30 transition-all group ${i < 3 ? 'border-r border-zinc-200 dark:border-zinc-800' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''}`}
              >
                <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.2em] mb-2">{metric.label}</div>
                <div className={`text-2xl md:text-3xl font-black tracking-tighter mb-1 ${
                  !backendOnline ? 'text-zinc-300 dark:text-zinc-800' : metric.primary ? 'text-black dark:text-white' : metric.accent ? 'text-zinc-400' : ''
                }`}>{metric.value}</div>
                <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest">{metric.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── AGENT CONTROLS ─────────────────────────────────────── */}
        <section className="mb-8">
          <div className="section-label">Agent Subsystems</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-zinc-200 dark:border-zinc-800 p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-black text-sm tracking-tight">AUTO-SPECULATE</h3>
                  <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 border ${speculationOn ? 'text-green-500 border-green-500/30' : 'text-zinc-500 border-zinc-300 dark:border-zinc-700'}`}>
                    {speculationOn ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                  {speculationOn ? 'Watching gossip, auto-buying high-momentum tokens.' : 'Auto-buys promising tokens from network activity. Currently idle.'}
                </p>
                {!backendOnline && <p className="text-[9px] text-red-500 font-mono mt-1">Backend offline</p>}
              </div>
              <button
                onClick={() => toggleSpeculation.mutate(!speculationOn)}
                className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${speculationOn ? 'bg-white dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                disabled={toggleSpeculation.isPending || !backendOnline}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${speculationOn ? 'left-6 bg-black' : 'left-0.5 bg-zinc-500'}`} />
              </button>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-black text-sm tracking-tight">LIQUIDITY SWEEP</h3>
                  <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 border ${autoAcquireOn ? 'text-green-500 border-green-500/30' : 'text-zinc-500 border-zinc-300 dark:border-zinc-700'}`}>
                    {autoAcquireOn ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                  {autoAcquireOn ? 'Consolidating small holdings into top assets.' : 'Rebalances portfolio by merging small positions. Currently idle.'}
                </p>
                {!backendOnline && <p className="text-[9px] text-red-500 font-mono mt-1">Backend offline</p>}
              </div>
              <button
                onClick={() => toggleAutoAcquire.mutate(!autoAcquireOn)}
                className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${autoAcquireOn ? 'bg-white dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                disabled={toggleAutoAcquire.isPending || !backendOnline}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${autoAcquireOn ? 'left-6 bg-black' : 'left-0.5 bg-zinc-500'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* ── ACTIVITY ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2">
            <div className="section-label font-black">Holdings</div>
            <div className="border border-zinc-200 dark:border-zinc-800">
              {!backendOnline ? (
                <div className="px-6 py-6 text-center text-[10px] text-zinc-500 font-mono">Waiting for backend to show holdings.</div>
              ) : portfolio && portfolio.length > 0 ? (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {portfolio.slice(0, 8).map((holding) => (
                    <div key={holding.token_id} className="group flex items-center justify-between px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="text-lg font-mono text-zinc-300 opacity-20 group-hover:opacity-100 transition-opacity">0x</div>
                        <div className="min-w-0">
                          <div className="font-black text-sm tracking-tight truncate">{holding.name}</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">{holding.balance.toLocaleString()} shares</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-black tracking-tighter ${holding.pnl_sats >= 0 ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                          {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)} SAT
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-6 text-center text-[10px] text-zinc-500 font-mono">No tokens. Visit MARKET or enable Auto-Speculate.</div>
              )}
            </div>
          </section>

          <section>
            <div className="section-label">Gossip Feed</div>
            <div className="border border-zinc-200 dark:border-zinc-800 p-4 h-[300px] flex flex-col overflow-hidden relative">
              {!backendOnline ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-500 font-mono text-center px-4">
                  Gossip feed activates when backend is online.
                </div>
              ) : peers?.active?.length ? (
                <div className="space-y-4">
                  {peers.active.slice(0, 6).map((peer) => (
                    <div key={peer.peer_id} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono font-bold uppercase tracking-tighter">NODE_{peer.peer_id.slice(0, 6)}</span>
                        <span className="text-[8px] font-mono text-zinc-600">CONNECTED</span>
                      </div>
                      <div className="h-px bg-zinc-200 dark:bg-zinc-900 overflow-hidden relative">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.random() * 100}%` }} transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }} className="absolute h-full bg-zinc-400 dark:bg-white opacity-30" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-500 font-mono text-center px-4">
                  Listening for peers...
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </PageContainer>
  );
}
