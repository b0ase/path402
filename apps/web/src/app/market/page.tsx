'use client';

import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';

export default function MarketPage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                EXPLORER
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                GLOBAL INDEX
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Discover $tokens discovered via the gossip network. Every entry is a P2P content manifest.
          </p>
        </div>

        {/* Categories */}
        <section className="mb-12">
          <div className="section-label">Categories</div>
          <div className="flex flex-wrap gap-2">
            {['All Assets', 'Video Streams', 'API Endpoints', 'Knowledge Bases', 'Scientific Data'].map((cat) => (
              <button
                key={cat}
                className={`px-6 py-2 text-[10px] uppercase tracking-[0.2em] font-mono font-bold border transition-all ${cat === 'All Assets'
                    ? 'bg-black dark:bg-white text-white dark:text-black border-transparent'
                    : 'bg-transparent border-gray-200 dark:border-zinc-800 text-gray-500 hover:border-gray-400 dark:hover:border-zinc-600'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Results Grid */}
        <section className="mb-12">
          <div className="section-label">Discovered Tokens</div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="card h-64 border-dashed animate-pulse" />
              ))}
            </div>
          ) : tokens && tokens.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tokens.map((token) => (
                <div key={token.token_id} className="card group">
                  <div className="aspect-video bg-gray-100 dark:bg-zinc-900 mb-6 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center group-hover:bg-zinc-800 transition-colors relative overflow-hidden">
                    <span className="text-zinc-600 dark:text-zinc-700 font-mono text-4xl font-bold opacity-30 group-hover:opacity-100 transition-opacity">$402</span>
                    <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg tracking-tight">{token.name}</h3>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{token.token_id}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-white leading-none">{token.base_price_sats} SAT</div>
                        <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-tighter">Current Price</div>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed h-8">
                      {token.description || `Distributed content asset minted via the $402 protocol. Discovery via gossip peer.`}
                    </p>

                    <div className="pt-4 flex items-center gap-3">
                      <button className="flex-1 py-3 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all btn-premium">
                        ACQUIRE ACCESS
                      </button>
                      <button className="p-3 border border-gray-200 dark:border-zinc-800 hover:border-white transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card border-dashed py-24 text-center">
              <div className="text-4xl mb-6">📡</div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-2">No Tokens Indexed</h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto font-mono">
                Connect to more peers or wait for gossip announcements to populate the index.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
