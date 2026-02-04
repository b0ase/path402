'use client';

import { Navigation } from '@/components/Navigation';

export default function MarketPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                MARKET
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                BROWSE
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Browse and discover tokenized content
          </p>
        </div>

        {/* Search - INDUSTRIAL */}
        <section className="mb-8">
          <input
            type="text"
            placeholder="Search tokens..."
            className="w-full bg-gray-50 dark:bg-zinc-900/30 border border-gray-200 dark:border-gray-800 px-4 py-3 font-mono placeholder-gray-500 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
          />
        </section>

        {/* Categories - INDUSTRIAL */}
        <section className="mb-8">
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Categories</div>
          <div className="flex gap-0 border border-gray-200 dark:border-gray-800">
            {['All', 'Video', 'API', 'Content', 'Calls'].map((cat, i, arr) => (
              <button
                key={cat}
                className={`px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-colors ${cat === 'All'
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'bg-gray-50 dark:bg-zinc-900/30 text-gray-500 hover:text-black dark:hover:text-white'
                  } ${i < arr.length - 1 ? 'border-r border-gray-200 dark:border-gray-800' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Featured - INDUSTRIAL Grid */}
        <section className="mb-12">
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Featured</div>
          <div className="grid md:grid-cols-3 gap-0 border border-gray-200 dark:border-gray-800">
            {[1, 2, 3].map((i, idx, arr) => (
              <div
                key={i}
                className={`p-6 bg-gray-50 dark:bg-zinc-900/30 ${idx < arr.length - 1 ? 'border-r border-gray-200 dark:border-gray-800' : ''
                  }`}
              >
                <div className="aspect-video bg-gray-200 dark:bg-zinc-800 mb-4 flex items-center justify-center border border-gray-200 dark:border-gray-800">
                  <span className="text-gray-400 text-4xl">▶</span>
                </div>
                <div className="font-bold mb-1">
                  Example Token #{i}
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  Sample description for this token
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold">500 SAT</span>
                  <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider hover:bg-gray-800 dark:hover:bg-gray-200">
                    Acquire
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Coming Soon Notice - INDUSTRIAL */}
        <section>
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 p-8 bg-gray-50 dark:bg-zinc-900/20">
            <div className="text-center">
              <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Coming Soon</div>
              <p className="text-gray-500 max-w-md mx-auto">
                The marketplace will display all available tokenized content.
                Upload your own content on the Upload page.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
