'use client';

import { Navigation } from '@/components/Navigation';

export default function LivePage() {
  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-zinc-200 dark:border-zinc-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-900 dark:text-white">
                LIVE
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                BROADCAST
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Token-gated livestreams with real-time payments
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Stream */}
          <div className="card">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Create a Stream
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Stream Title
                </label>
                <input
                  type="text"
                  placeholder="My Live Stream"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Token Required
                </label>
                <input
                  type="text"
                  placeholder="$yourname.com/$stream"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Minimum Tokens to Join
                </label>
                <input
                  type="number"
                  placeholder="1"
                  defaultValue={1}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="record"
                  className="w-4 h-4 bg-zinc-900 border border-zinc-700 rounded"
                  defaultChecked
                />
                <label htmlFor="record" className="text-sm text-zinc-400">
                  Record stream for replay sales
                </label>
              </div>

              <button
                disabled
                className="w-full py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔴 Go Live
              </button>
            </div>
          </div>

          {/* Active Streams */}
          <div className="card">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Active Streams
            </h2>

            <div className="text-center py-12 text-zinc-500">
              <div className="text-4xl mb-4">📡</div>
              <div>No active streams</div>
              <p className="text-sm mt-2">
                Create a stream or browse the market
              </p>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 card bg-zinc-900/30 border-dashed">
          <div className="flex items-start gap-4">
            <div className="text-2xl">ℹ️</div>
            <div>
              <h3 className="text-white font-medium mb-2">How Live Streaming Works</h3>
              <ul className="text-sm text-zinc-500 space-y-1">
                <li>• Viewers must hold your token to join the stream</li>
                <li>• Tokens are consumed per second of watch time</li>
                <li>• Recorded streams become purchasable video content</li>
                <li>• Uses LiveKit for low-latency WebRTC streaming</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
