'use client';

import { Navigation } from '@/components/Navigation';

export default function MarketPage() {
  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Market</h1>
          <p className="text-zinc-500">
            Browse and discover tokenized content
          </p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            placeholder="Search tokens..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {['All', 'Video', 'API', 'Content', 'Calls'].map((cat) => (
            <button
              key={cat}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-400 hover:text-white hover:border-zinc-700 whitespace-nowrap"
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Featured */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
            Featured
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card hover:glow-cyan cursor-pointer">
                <div className="aspect-video bg-zinc-800 rounded-lg mb-4 flex items-center justify-center">
                  <span className="text-zinc-600 text-4xl">▶</span>
                </div>
                <div className="font-medium text-white mb-1">
                  Example Token #{i}
                </div>
                <div className="text-sm text-zinc-500 mb-3">
                  Sample description for this token
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-mono">500 SAT</span>
                  <button className="px-3 py-1 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700">
                    Acquire
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon Notice */}
        <div className="card bg-zinc-900/30 border-dashed">
          <div className="text-center py-8">
            <div className="text-zinc-500 mb-2">🚧 Market Coming Soon</div>
            <p className="text-zinc-600 text-sm max-w-md mx-auto">
              The marketplace will display all available tokenized content.
              Upload your own content on the Upload page.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
