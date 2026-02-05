'use client';

import { Navigation } from '@/components/Navigation';
import { usePortfolio, useStatus } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';

import { PageHeader } from '@/components/PageHeader';

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
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="PORTFOLIO"
          extension=".SYS"
          superTitle={
            <>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Main Ledger / Holdings
            </>
          }
          description={
            <>
              <b>Asset Performance.</b> Real-time valuation of acquired content tokens.
            </>
          }
          icon="📊"
        />

        {/* Portfolio Summary - Sharp Grid */}
        <section className="mb-12">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
            Ledger Summary
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
            <div className="border-r border-b md:border-b-0 border-zinc-200 dark:border-zinc-800 p-8">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Total Value</div>
              <div className="text-3xl md:text-4xl font-black tracking-tighter">{formatSats(totalValue)} <span className="text-base text-zinc-500 font-normal">SAT</span></div>
            </div>
            <div className="border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 p-8">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Total Cost</div>
              <div className="text-3xl md:text-4xl font-black tracking-tighter text-zinc-400">{formatSats(totalCost)} <span className="text-base text-zinc-500 font-normal">SAT</span></div>
            </div>
            <div className="border-r border-zinc-200 dark:border-zinc-800 p-8">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Net P&L</div>
              <div className={`text-3xl md:text-4xl font-black tracking-tighter ${totalPnL >= 0 ? 'text-black dark:text-white' : 'text-red-500'}`}>
                {totalPnL >= 0 ? '+' : ''}{formatSats(totalPnL)} <span className="text-base text-zinc-500 font-normal">SAT</span>
              </div>
            </div>
            <div className="p-8">
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Asset Count</div>
              <div className="text-3xl md:text-4xl font-black tracking-tighter">{portfolio?.length || 0}</div>
            </div>
          </div>
        </section>

        {/* Holdings Table - Industrial */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
            Asset Inventory
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500">Token ID</th>
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500 text-right">Balance</th>
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500 text-right">Cost Basis</th>
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500 text-right">Revenue</th>
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500 text-right">P&L</th>
                  <th className="py-4 px-6 text-[9px] uppercase tracking-widest font-bold text-zinc-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500 text-xs font-mono uppercase tracking-widest">
                      Processing Ledger...
                    </td>
                  </tr>
                ) : portfolio && portfolio.length > 0 ? (
                  portfolio.map((holding) => (
                    <tr
                      key={holding.token_id}
                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-sm tracking-tight">{holding.name}</div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                          {holding.token_id}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm">
                        {holding.balance.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-zinc-500">
                        {formatSats(holding.total_spent_sats)}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-zinc-500">
                        {formatSats(holding.total_revenue_sats)}
                      </td>
                      <td className={`py-4 px-6 text-right font-mono text-sm font-bold ${holding.pnl_sats >= 0 ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                        {holding.pnl_sats >= 0 ? '+' : ''}{formatSats(holding.pnl_sats)}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
                          MANAGE
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="text-zinc-400 mb-2 text-2xl">∅</div>
                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Ledger Empty</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </PageContainer>
  );
}
