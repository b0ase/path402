'use client';

import { Navigation } from '@/components/Navigation';

export default function LivePage() {
  return (
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Live Streaming</h1>
          <p className="text-zinc-500">
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
