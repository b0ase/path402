'use client';

import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';

export default function ExchangePage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Exchange</h1>
          <p className="text-zinc-500">
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
