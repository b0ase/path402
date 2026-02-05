'use client';

import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';
import { motion } from 'framer-motion';

export default function ExchangePage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8 flex flex-col gap-12">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 pb-12">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">
                LIQUIDITY
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em] font-bold">
                HUB
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Trade and speculate on the momentum of P2P content channels. Global rankings by indexer verification.
          </p>
        </div>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-gray-200 dark:border-gray-800 glass">
          {[
            { label: 'Network Assets', value: tokens?.length || 0, accent: false },
            { label: 'Gossip Volume', value: '42.1M SAT', accent: true },
            { label: 'Active Indexers', value: '1,284', accent: false },
          ].map((stat, i) => (
            <div key={stat.label} className={`p-8 bg-zinc-50/50 dark:bg-zinc-900/10 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800' : ''}`}>
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] mb-2">{stat.label}</div>
              <div className={`text-3xl font-black tracking-tight ${stat.accent ? 'text-black dark:text-white' : ''}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Performance Table */}
        <section>
          <div className="section-label">Top Performance</div>
          <div className="card !p-0 overflow-hidden glass border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest">ASSET</th>
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">PRICE (SAT)</th>
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">SUPPLY</th>
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">MKT CAP</th>
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">GOSSIP</th>
                    <th className="p-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {isLoading ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={6} className="p-6 h-16 bg-zinc-100/10" />
                      </tr>
                    ))
                  ) : tokens && tokens.length > 0 ? (
                    tokens.map((token) => (
                      <tr key={token.token_id} className="hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors group">
                        <td className="p-6">
                          <div className="flex flex-col">
                            <span className="font-black text-lg group-hover:text-black dark:group-hover:text-white transition-colors">{token.name}</span>
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">{token.token_id}</span>
                          </div>
                        </td>
                        <td className="p-6 text-right font-mono font-bold text-zinc-400 group-hover:text-white transition-colors">
                          {token.base_price_sats.toLocaleString()}
                        </td>
                        <td className="p-6 text-right font-mono text-zinc-500">
                          {token.current_supply.toLocaleString()}
                        </td>
                        <td className="p-6 text-right font-mono font-bold">
                          {formatSats(token.base_price_sats * token.current_supply)}
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-green-500">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            HIGH
                          </div>
                        </td>
                        <td className="p-6 text-right">
                          <button className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 btn-premium">
                            TRADE
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">
                        Network Isolated • Discovering Pairs
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
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
