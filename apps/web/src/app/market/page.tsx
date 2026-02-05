'use client';

import { PageHeader } from '@/components/PageHeader';
import { Navigation } from '@/components/Navigation';
import { useTokens } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';

export default function MarketPage() {
  const { data: tokens, isLoading } = useTokens();

  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="MARKET"
          extension=".SYS"
          superTitle={
            <>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Global Index / Gossip Network
            </>
          }
          description={
            <>
              <b>Global Content Index.</b> Discover and acquire access tokens propagated through the gossip protocol.
            </>
          }
          icon="📡"
        />

        {/* Categories - Industrial Tabs */}
        <section className="mb-12">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
            Asset Class
          </div>
          <div className="flex flex-wrap gap-0 bg-zinc-100 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800">
            {['All Assets', 'Video Streams', 'API Endpoints', 'Knowledge Bases', 'Scientific Data'].map((cat, i) => (
              <button
                key={cat}
                className={`px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-all border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 hover:bg-white dark:hover:bg-zinc-900 hover:text-black dark:hover:text-white ${cat === 'All Assets'
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'text-zinc-500'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Results Grid - High Contrast */}
        <section>
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-video bg-zinc-100 dark:bg-zinc-900 animate-pulse border border-zinc-200 dark:border-zinc-800" />
              ))}
            </div>
          ) : tokens && tokens.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {tokens.map((token) => (
                <div key={token.token_id} className="group border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:border-black dark:hover:border-white transition-colors">
                  {/* Card Header - Image Placeholder */}
                  <div className="aspect-video bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative overflow-hidden">
                    <span className="text-zinc-300 dark:text-zinc-800 font-mono text-4xl font-bold group-hover:scale-110 transition-transform duration-500">
                      $402
                    </span>
                    <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Price Tag */}
                    <div className="absolute top-0 right-0 bg-black dark:bg-white text-white dark:text-black px-3 py-1 font-mono text-xs font-bold">
                      {token.base_price_sats} SAT
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg tracking-tight uppercase">{token.name}</h3>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{token.token_id}</div>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-500 font-mono h-8 leading-relaxed line-clamp-2">
                      {token.description || `Distributed content asset minted via the $402 protocol. Discovery via gossip peer.`}
                    </p>

                    <div className="pt-4 flex items-center gap-0 border-t border-zinc-100 dark:border-zinc-900">
                      <button className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[10px] font-bold uppercase tracking-widest transition-all">
                        ACQUIRE
                      </button>
                      <button className="w-12 py-3 border-l border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center">
                        <span className="text-xl">↗</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-zinc-300 dark:border-zinc-800 py-24 text-center bg-zinc-50 dark:bg-zinc-900/20">
              <div className="text-4xl mb-6 opacity-20">📡</div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-2">No Tokens Indexed</h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto font-mono">
                Connect to more peers or wait for gossip announcements to populate the index.
              </p>
            </div>
          )}
        </section>
      </main>
    </PageContainer>
  );
}
