'use client';

import { Navigation } from '@/components/Navigation';
import { usePortfolio, useStatus } from '@/hooks/useAPI';

function formatSats(sats: number): string {
  if (Math.abs(sats) >= 1000000) {
    return `${(sats / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(sats) >= 1000) {
    return `${(sats / 1000).toFixed(1)}K`;
  }
  return sats.toLocaleString();
}

export default function PortfolioPage() {
  const { data: status } = useStatus();
  const { data: portfolio, isLoading } = usePortfolio();

  const totalValue = status?.portfolioValue || 0;
  const totalPnL = status?.totalPnL || 0;
  const totalCost = portfolio?.reduce((sum, h) => sum + h.total_spent_sats, 0) || 0;

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Portfolio</h1>
          <p className="text-zinc-500">
            Your token holdings and performance
          </p>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Total Value</div>
            <div className="text-2xl font-bold text-white">
              {formatSats(totalValue)} SAT
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Total Cost</div>
            <div className="text-2xl font-bold text-zinc-400">
              {formatSats(totalCost)} SAT
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Total P&L</div>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}{formatSats(totalPnL)} SAT
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Holdings</div>
            <div className="text-2xl font-bold text-cyan-400">
              {portfolio?.length || 0}
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase">Token</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Balance</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Cost</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Revenue</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">P&L</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    Loading portfolio...
                  </td>
                </tr>
              ) : portfolio && portfolio.length > 0 ? (
                portfolio.map((holding) => (
                  <tr
                    key={holding.token_id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    <td className="py-4 px-4">
                      <div className="font-medium text-white">{holding.name}</div>
                      <div className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">
                        {holding.token_id}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right text-white">
                      {holding.balance.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right text-zinc-400">
                      {formatSats(holding.total_spent_sats)} SAT
                    </td>
                    <td className="py-4 px-4 text-right text-cyan-400">
                      {formatSats(holding.total_revenue_sats)} SAT
                    </td>
                    <td className={`py-4 px-4 text-right ${holding.pnl_sats >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)} SAT
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button className="px-3 py-1 bg-zinc-800 text-white text-sm rounded hover:bg-zinc-700">
                        Serve
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No holdings yet. Visit the Market to acquire tokens.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
