'use client';

import { Navigation } from '@/components/Navigation';
import { useStatus, usePortfolio, usePeers, useToggleSpeculation, useToggleAutoAcquire } from '@/hooks/useAPI';

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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="text-gray-500 text-sm font-mono">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      {/* INDUSTRIAL: Full-width layout */}
      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start">
              <span className="text-4xl md:text-6xl font-bold font-mono">$</span>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                402 CLIENT
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                DASHBOARD
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Node: <span className="text-black dark:text-white font-mono">{status?.nodeId?.slice(0, 12)}...</span> • Uptime: <span className="text-black dark:text-white">{formatUptime(status?.uptime || 0)}</span>
          </p>
        </div>

        {/* Status Grid - INDUSTRIAL: Sharp borders, grid layout */}
        <section className="mb-12">
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Status</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-gray-200 dark:border-gray-800">
            <div className="border-r border-b md:border-b-0 border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Peers</div>
              <div className="text-3xl font-bold">{status?.peersConnected || 0}</div>
              <div className="text-xs text-gray-500 mt-1">{status?.peersKnown || 0} known</div>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Tokens</div>
              <div className="text-3xl font-bold">{status?.tokensKnown || 0}</div>
              <div className="text-xs text-gray-500 mt-1">known</div>
            </div>
            <div className="border-r border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Portfolio</div>
              <div className="text-3xl font-bold">{formatSats(status?.portfolioValue || 0)}</div>
              <div className="text-xs text-gray-500 mt-1">SAT</div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">P&L</div>
              <div className={`text-3xl font-bold ${status?.totalPnL && status.totalPnL >= 0 ? '' : 'text-gray-500'}`}>
                {status?.totalPnL && status.totalPnL >= 0 ? '+' : ''}{formatSats(status?.totalPnL || 0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">SAT</div>
            </div>
          </div>
        </section>

        {/* Controls - INDUSTRIAL: Sharp buttons */}
        <section className="mb-12">
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Agent Controls</div>
          <div className="border border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => toggleSpeculation.mutate(!status?.speculationEnabled)}
                className={`px-6 py-3 font-bold uppercase tracking-wider transition-colors ${status?.speculationEnabled
                  ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                  : 'bg-white dark:bg-zinc-900 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 hover:text-black dark:hover:text-white'
                  }`}
                disabled={toggleSpeculation.isPending}
              >
                {status?.speculationEnabled ? '● Speculation ON' : '○ Speculation OFF'}
              </button>

              <button
                onClick={() => toggleAutoAcquire.mutate(!status?.autoAcquireEnabled)}
                className={`px-6 py-3 font-bold uppercase tracking-wider transition-colors ${status?.autoAcquireEnabled
                  ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                  : 'bg-white dark:bg-zinc-900 text-gray-500 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 hover:text-black dark:hover:text-white'
                  }`}
                disabled={toggleAutoAcquire.isPending}
              >
                {status?.autoAcquireEnabled ? '● Auto-Acquire ON' : '○ Auto-Acquire OFF'}
              </button>
            </div>
          </div>
        </section>

        {/* Two Column Layout - INDUSTRIAL: Grid with borders */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Portfolio */}
          <section>
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Portfolio</div>
            <div className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900/30">
              {portfolio && portfolio.length > 0 ? (
                <div>
                  {portfolio.slice(0, 5).map((holding, i) => (
                    <div
                      key={holding.token_id}
                      className={`flex items-center justify-between p-4 ${i < portfolio.slice(0, 5).length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : ''}`}
                    >
                      <div>
                        <div className="font-bold">{holding.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                          {holding.balance.toLocaleString()} tokens
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${holding.pnl_sats >= 0 ? '' : 'text-gray-500'}`}>
                          {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)} SAT
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                          Cost: {formatSats(holding.total_spent_sats)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm p-6">No holdings yet</div>
              )}
            </div>
          </section>

          {/* Peers */}
          <section>
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Active Peers</div>
            <div className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900/30">
              {peers?.active && peers.active.length > 0 ? (
                <div>
                  {peers.active.slice(0, 5).map((peer, i) => (
                    <div
                      key={peer.peer_id}
                      className={`flex items-center justify-between p-4 ${i < peers.active.slice(0, 5).length - 1 ? 'border-b border-gray-200 dark:border-gray-800' : ''}`}
                    >
                      <div>
                        <div className="font-mono font-bold">
                          {peer.peer_id.slice(0, 16)}...
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                          {peer.host}:{peer.port}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-mono uppercase tracking-wider">{peer.status}</div>
                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                          Rep: {peer.reputation_score.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm p-6">No peers connected</div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
