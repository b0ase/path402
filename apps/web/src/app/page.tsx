'use client';

import { Navigation } from '@/components/Navigation';
import { StatusCard } from '@/components/StatusCard';
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-zinc-500">
            Node: {status?.nodeId?.slice(0, 12)}... • Uptime: {formatUptime(status?.uptime || 0)}
          </p>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatusCard
            title="Peers Connected"
            value={status?.peersConnected || 0}
            subtitle={`${status?.peersKnown || 0} known`}
            color="cyan"
          />
          <StatusCard
            title="Tokens Known"
            value={status?.tokensKnown || 0}
            color="purple"
          />
          <StatusCard
            title="Portfolio Value"
            value={`${formatSats(status?.portfolioValue || 0)} SAT`}
            color="white"
          />
          <StatusCard
            title="Total P&L"
            value={`${status?.totalPnL && status.totalPnL >= 0 ? '+' : ''}${formatSats(status?.totalPnL || 0)} SAT`}
            color={status?.totalPnL && status.totalPnL >= 0 ? 'green' : 'cyan'}
          />
        </div>

        {/* Controls */}
        <div className="card mb-8">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
            Agent Controls
          </h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => toggleSpeculation.mutate(!status?.speculationEnabled)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                status?.speculationEnabled
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
              disabled={toggleSpeculation.isPending}
            >
              {status?.speculationEnabled ? '● Speculation ON' : '○ Speculation OFF'}
            </button>

            <button
              onClick={() => toggleAutoAcquire.mutate(!status?.autoAcquireEnabled)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                status?.autoAcquireEnabled
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
              disabled={toggleAutoAcquire.isPending}
            >
              {status?.autoAcquireEnabled ? '● Auto-Acquire ON' : '○ Auto-Acquire OFF'}
            </button>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Portfolio */}
          <div className="card">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Portfolio
            </h2>
            {portfolio && portfolio.length > 0 ? (
              <div className="space-y-3">
                {portfolio.slice(0, 5).map((holding) => (
                  <div
                    key={holding.token_id}
                    className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-white">{holding.name}</div>
                      <div className="text-xs text-zinc-500">
                        {holding.balance.toLocaleString()} tokens
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={holding.pnl_sats >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)} SAT
                      </div>
                      <div className="text-xs text-zinc-500">
                        Cost: {formatSats(holding.total_spent_sats)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-500 text-sm">No holdings yet</div>
            )}
          </div>

          {/* Peers */}
          <div className="card">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Active Peers
            </h2>
            {peers?.active && peers.active.length > 0 ? (
              <div className="space-y-3">
                {peers.active.slice(0, 5).map((peer) => (
                  <div
                    key={peer.peer_id}
                    className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div>
                      <div className="font-mono text-sm text-white">
                        {peer.peer_id.slice(0, 16)}...
                      </div>
                      <div className="text-xs text-zinc-500">
                        {peer.host}:{peer.port}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-green-400">{peer.status}</div>
                      <div className="text-xs text-zinc-500">
                        Rep: {peer.reputation_score.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-500 text-sm">No peers connected</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
