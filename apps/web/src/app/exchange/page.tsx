'use client';

import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';

export default function ExchangePage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-zinc-200 dark:border-zinc-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-900 dark:text-white">
                EXCHANGE
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                GLOBAL RANKINGS
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            All $402 tokens ranked by market cap
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Total Tokens</div>
            <div className="text-2xl font-bold text-white">{tokens?.length || 0}</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">24h Volume</div>
            <div className="text-2xl font-bold text-cyan-400">-</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-500 uppercase">Market Cap</div>
            <div className="text-2xl font-bold text-green-400">-</div>
          </div>
        </div>

        {/* Token Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase">#</th>
                <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase">Token</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Price</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Supply</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Model</th>
                <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    Loading tokens...
                  </td>
                </tr>
              ) : tokens && tokens.length > 0 ? (
                tokens.map((token, i) => (
                  <tr
                    key={token.token_id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    <td className="py-4 px-4 text-zinc-500">{i + 1}</td>
                    <td className="py-4 px-4">
                      <div className="font-medium text-white">{token.name}</div>
                      <div className="text-xs text-zinc-500 truncate max-w-[200px]">
                        {token.description}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-cyan-400">
                      {token.base_price_sats.toLocaleString()} SAT
                    </td>
                    <td className="py-4 px-4 text-right text-zinc-400">
                      {token.current_supply.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                        {token.pricing_model}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button className="px-3 py-1 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700">
                        Trade
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No tokens discovered yet
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
