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
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 5-5" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                PORTFOLIO
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                HOLDINGS
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Your token holdings and performance
          </p>
        </div>

        {/* Portfolio Summary - INDUSTRIAL Grid */}
        <section className="mb-12">
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Summary</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-gray-200 dark:border-gray-800">
            <div className="border-r border-b md:border-b-0 border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Total Value</div>
              <div className="text-3xl font-bold">{formatSats(totalValue)} SAT</div>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Total Cost</div>
              <div className="text-3xl font-bold text-gray-500">{formatSats(totalCost)} SAT</div>
            </div>
            <div className="border-r border-gray-200 dark:border-gray-800 p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Total P&L</div>
              <div className={`text-3xl font-bold ${totalPnL >= 0 ? '' : 'text-gray-500'}`}>
                {totalPnL >= 0 ? '+' : ''}{formatSats(totalPnL)} SAT
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-zinc-900/30">
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">Holdings</div>
              <div className="text-3xl font-bold">{portfolio?.length || 0}</div>
            </div>
          </div>
        </section>

        {/* Holdings Table - INDUSTRIAL */}
        <section>
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Holdings</div>
          <div className="border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900/30">
                  <th className="text-left py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Token</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Balance</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Cost</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Revenue</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">P&L</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading portfolio...
                    </td>
                  </tr>
                ) : portfolio && portfolio.length > 0 ? (
                  portfolio.map((holding) => (
                    <tr
                      key={holding.token_id}
                      className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold">{holding.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]">
                          {holding.token_id}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right font-mono">
                        {holding.balance.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right text-gray-500">
                        {formatSats(holding.total_spent_sats)} SAT
                      </td>
                      <td className="py-4 px-4 text-right">
                        {formatSats(holding.total_revenue_sats)} SAT
                      </td>
                      <td className={`py-4 px-4 text-right font-bold ${holding.pnl_sats >= 0 ? '' : 'text-gray-500'}`}>
                        {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)} SAT
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider hover:bg-gray-800 dark:hover:bg-gray-200">
                          Serve
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No holdings yet. Visit the Market to acquire tokens.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
