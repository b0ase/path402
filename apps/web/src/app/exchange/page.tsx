'use client';

import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';

import { PageHeader } from '@/components/PageHeader';

export default function ExchangePage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="LIQUIDITY"
          extension=".HUB"
          superTitle={
            <>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Live Order Book / Mainnet
            </>
          }
          description={
            <>
              <b>P2P Exchange Protocol.</b> Speculate on content channel momentum. Global rankings verified by gossip consensus.
            </>
          }
          icon="📈"
        />

        {/* Aggregate Stats - Sharp Grid */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
            {[
              { label: 'Network Assets', value: tokens?.length || 0, accent: false },
              { label: 'Gossip Volume', value: '42.1M SAT', accent: true },
              { label: 'Active Indexers', value: '1,284', accent: false },
            ].map((stat, i) => (
              <div key={stat.label} className={`p-8 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800' : ''}`}>
                <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-2">{stat.label}</div>
                <div className={`text-3xl font-black tracking-tighter ${stat.accent ? 'text-black dark:text-white' : 'text-zinc-400'}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Performance Table - High Contrast */}
        <section>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
            Market Depth
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">ASSET</th>
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">PRICE (SAT)</th>
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">SUPPLY</th>
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">MKT CAP</th>
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">STATUS</th>
                  <th className="p-6 text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="p-8 bg-zinc-50 dark:bg-zinc-900/10" />
                    </tr>
                  ))
                ) : tokens && tokens.length > 0 ? (
                  tokens.map((token) => (
                    <tr key={token.token_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group">
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="font-black text-lg tracking-tight group-hover:text-black dark:group-hover:text-white transition-colors">{token.name}</span>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{token.token_id}</span>
                        </div>
                      </td>
                      <td className="p-6 text-right font-mono font-bold text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
                        {token.base_price_sats.toLocaleString()}
                      </td>
                      <td className="p-6 text-right font-mono text-zinc-500 text-sm">
                        {token.current_supply.toLocaleString()}
                      </td>
                      <td className="p-6 text-right font-mono font-bold text-sm">
                        {formatSats(token.base_price_sats * token.current_supply)}
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex items-center justify-end gap-2 text-[9px] font-bold uppercase tracking-widest text-green-600 dark:text-green-500">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          LIQUID
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <button className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-95">
                          TRADE
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-16 text-center">
                      <div className="text-zinc-400 mb-2 text-2xl">⚡</div>
                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Order Book Empty
                      </div>
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

function formatSats(sats: number): string {
  if (Math.abs(sats) >= 1000000) {
    return `${(sats / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(sats) >= 1000) {
    return `${(sats / 1000).toFixed(1)}K`;
  }
  return sats.toLocaleString();
}
