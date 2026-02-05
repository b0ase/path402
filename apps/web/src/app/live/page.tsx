'use client';

import { Navigation } from '@/components/Navigation';
import { PageContainer } from '@/components/PageContainer';

import { PageHeader } from '@/components/PageHeader';

export default function LivePage() {
  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="LIVE"
          extension=".STREAM"
          superTitle={
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Real-time Ingestion / HLS
            </>
          }
          description={
            <>
              <b>Token-Gated Broadcasts.</b> Monetize live streams with BSV token payments per second of access.
            </>
          }
          icon="🔴"
        />

        <div className="grid md:grid-cols-2 gap-12">
          {/* Create Stream - Industrial Card */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
              Uplink Configuration
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-8 space-y-6">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Stream Designation
                </label>
                <input
                  type="text"
                  placeholder="ENTER_STREAM_TITLE"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-sm font-mono focus:outline-none focus:border-black dark:focus:border-white transition-colors placeholder-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Token Gate
                  </label>
                  <input
                    type="text"
                    placeholder="$TOKEN_ID"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-sm font-mono focus:outline-none focus:border-black dark:focus:border-white transition-colors placeholder-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Min. Entry
                  </label>
                  <input
                    type="number"
                    placeholder="1"
                    defaultValue={1}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-sm font-mono focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 border border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/50">
                <input
                  type="checkbox"
                  id="record"
                  className="w-4 h-4 rounded-none border-zinc-300 dark:border-zinc-700"
                  defaultChecked
                />
                <label htmlFor="record" className="text-xs font-mono text-zinc-500 uppercase tracking-wide cursor-pointer">
                  Archive stream for VOD resale
                </label>
              </div>

              <button
                disabled
                className="w-full py-4 bg-red-600 text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Initialize Uplink
              </button>
            </div>
          </div>

          {/* Active Streams - Industrial Status */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
              Network Activity
            </div>

            <div className="border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 py-24 text-center">
              <div className="text-4xl mb-6 opacity-20">📡</div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-900 dark:text-zinc-100 mb-2">
                Signal Lost
              </h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto font-mono">
                No active broadcast nodes detected in your gossip swarm.
              </p>
            </div>

            {/* Info Box */}
            <div className="mt-8 border-l-2 border-zinc-200 dark:border-zinc-800 pl-6 py-2">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-2 text-zinc-900 dark:text-zinc-100">Protocol Specs</h3>
              <ul className="text-[10px] font-mono text-zinc-500 space-y-2 uppercase tracking-wide">
                <li>• Viewers burn tokens per second</li>
                <li>• Zero-latency WebRTC transport</li>
                <li>• Content cryptographically signed</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </PageContainer>
  );
}
