'use client';

import { Navigation } from '@/components/Navigation';
import { useStatus, usePortfolio, usePeers, useToggleSpeculation, useToggleAutoAcquire } from '@/hooks/useAPI';
import { motion } from 'framer-motion';

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function formatSats(sats: number): string {
  if (Math.abs(sats) >= 1000000) {
    return `${(sats / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(sats) >= 1000) {
    return `${(sats / 1000).toFixed(1)}K`;
  }
  return sats.toLocaleString();
}

export default function DashboardPage() {
  const { data: status, isLoading: statusLoading } = useStatus();
  const { data: portfolio } = usePortfolio();
  const { data: peers } = usePeers();
  const toggleSpeculation = useToggleSpeculation();
  const toggleAutoAcquire = useToggleAutoAcquire();

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black opacity-50" />
        <div className="text-white text-sm font-mono animate-pulse relative z-10">INITIALIZING NODE...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col selection:bg-white selection:text-black">
      <Navigation />

      <main className="flex-1 w-full px-4 md:px-8 py-8 flex flex-col gap-12">
        {/* Header - MISSION CONTROL STYLE */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-b border-gray-200 dark:border-gray-800 pb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-8"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="bg-black dark:bg-white text-white dark:text-black w-20 h-20 md:w-24 md:h-24 flex items-center justify-center border-4 border-zinc-200 dark:border-zinc-800 shadow-2xl relative group overflow-hidden">
                <span className="text-4xl md:text-6xl font-black font-mono relative z-10">$</span>
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              </div>
              <div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-2">
                  COMMAND
                </h1>
                <div className="text-[10px] text-gray-400 font-mono uppercase tracking-[0.4em] font-bold">
                  Node Operator Terminal v3.0.0
                </div>
              </div>
            </div>
            <p className="text-gray-400 max-w-xl text-lg leading-relaxed font-medium">
              Connected as <span className="text-black dark:text-white font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-1">{status?.nodeId?.slice(0, 12)}...</span>
              <br />
              Uptime: <span className="text-black dark:text-white font-mono">{formatUptime(status?.uptime || 0)}</span> • Location: <span className="text-zinc-500">Localhost Grid</span>
            </p>
          </div>

          <div className="flex gap-4 p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-inner">
            <div className="text-center px-4">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Status</div>
              <div className="flex items-center gap-2 justify-center">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                <span className="text-xs font-bold font-mono">ENCRYPTED</span>
              </div>
            </div>
            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 self-center" />
            <div className="text-center px-4">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Peers</div>
              <div className="text-xs font-bold font-mono">{status?.peersConnected || 0} ACTIVE</div>
            </div>
          </div>
        </motion.div>

        {/* METRICS GRID - High Contrast */}
        <section>
          <div className="section-label">Live Metrics</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden glass">
            {[
              { label: 'Gossip Reach', value: status?.peersKnown || 0, sub: 'Nodes Discovered' },
              { label: 'Asset Index', value: status?.tokensKnown || 0, sub: 'Global Paths' },
              { label: 'Net Liquidity', value: formatSats(status?.portfolioValue || 0), sub: 'SATOSHIS', primary: true },
              { label: 'Performance', value: `${status?.totalPnL && status.totalPnL >= 0 ? '+' : ''}${formatSats(status?.totalPnL || 0)}`, sub: 'SAT P&L', accent: true },
            ].map((metric, i) => (
              <div
                key={metric.label}
                className={`p-8 bg-gray-50/50 dark:bg-zinc-900/10 hover:bg-white dark:hover:bg-zinc-800/30 transition-all group ${i < 3 ? 'border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800' : ''}`}
              >
                <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-4 group-hover:text-black dark:group-hover:text-white transition-colors">
                  {metric.label}
                </div>
                <div className={`text-4xl md:text-5xl font-black tracking-tighter mb-2 ${metric.primary ? 'text-black dark:text-white' : metric.accent ? 'text-zinc-400' : ''}`}>
                  {metric.value}
                </div>
                <div className="text-[9px] text-gray-500 font-mono font-bold uppercase tracking-widest">
                  {metric.sub}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AGENT CONTROLS - Neon Glass Style */}
        <section>
          <div className="section-label">Agent Subsystems</div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="card group relative overflow-hidden bg-gradient-to-br from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-950 p-8 flex items-center justify-between border-gray-200 dark:border-zinc-800">
              <div className="space-y-2">
                <h3 className="font-black text-xl tracking-tight">AUTO-SPECULATE</h3>
                <p className="text-xs text-zinc-500 font-mono max-w-xs">
                  Agent will automatically discover and acquire tokens with high gossip momentum.
                </p>
              </div>
              <button
                onClick={() => toggleSpeculation.mutate(!status?.speculationEnabled)}
                className={`w-16 h-8 rounded-full transition-all relative ${status?.speculationEnabled ? 'bg-white dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                disabled={toggleSpeculation.isPending}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full transition-all ${status?.speculationEnabled ? 'left-9 bg-black dark:bg-black' : 'left-1 bg-zinc-500'}`} />
              </button>
            </div>

            <div className="card group relative overflow-hidden bg-gradient-to-br from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-950 p-8 flex items-center justify-between border-gray-200 dark:border-zinc-800">
              <div className="space-y-2">
                <h3 className="font-black text-xl tracking-tight">LIQUIDITY SWEEP</h3>
                <p className="text-xs text-zinc-500 font-mono max-w-xs">
                  Automatically consolidate small holdings into top-tier content assets.
                </p>
              </div>
              <button
                onClick={() => toggleAutoAcquire.mutate(!status?.autoAcquireEnabled)}
                className={`w-16 h-8 rounded-full transition-all relative ${status?.autoAcquireEnabled ? 'bg-white dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                disabled={toggleAutoAcquire.isPending}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full transition-all ${status?.autoAcquireEnabled ? 'left-9 bg-black dark:bg-black' : 'left-1 bg-zinc-500'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* ACTIVITY - Split View */}
        <div className="grid lg:grid-cols-3 gap-12">
          {/* Portfolio - Taking 2 cols */}
          <section className="lg:col-span-2">
            <div className="section-label font-black">Holdings Detail</div>
            <div className="border border-gray-200 dark:border-gray-800 glass shadow-2xl">
              {portfolio && portfolio.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {portfolio.slice(0, 8).map((holding) => (
                    <div
                      key={holding.token_id}
                      className="group flex items-center justify-between p-6 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-6">
                        <div className="text-2xl font-mono text-zinc-300 opacity-20 group-hover:opacity-100 transition-opacity">0x</div>
                        <div>
                          <div className="font-black text-lg tracking-tight">{holding.name}</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">
                            {holding.token_id} • {holding.balance.toLocaleString()} SHARES
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-black tracking-tighter ${holding.pnl_sats >= 0 ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                          {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)}
                        </div>
                        <div className="text-[9px] text-zinc-500 font-mono uppercase font-bold">
                          SAT TOTAL RETURN
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-zinc-600 text-xs font-mono p-12 text-center uppercase tracking-widest">Empty Wallet • Sweep the market</div>
              )}
            </div>
          </section>

          {/* Activity Feed - Taking 1 col */}
          <section>
            <div className="section-label">Gossip Feed</div>
            <div className="border border-gray-200 dark:border-gray-800 p-6 glass h-[400px] flex flex-col gap-4 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-zinc-500 to-transparent opacity-20" />
              <div className="space-y-6">
                {peers?.active && peers.active.slice(0, 6).map((peer) => (
                  <div key={peer.peer_id} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono font-bold text-white uppercase tracking-tighter">NODE_{peer.peer_id.slice(0, 6)}</span>
                      <span className="text-[9px] font-mono text-zinc-600">CONNECTED</span>
                    </div>
                    <div className="h-1 bg-zinc-900 overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.random() * 100}%` }}
                        transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
                        className="absolute h-full bg-white opacity-20"
                      />
                    </div>
                  </div>
                ))}
                {!peers?.active?.length && (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-700 font-mono text-center uppercase tracking-widest px-8">
                    NO INBOUND TRAFFIC • WAITING FOR PEERS
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
