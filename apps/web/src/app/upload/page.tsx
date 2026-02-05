'use client';

import { Navigation } from '@/components/Navigation';
import { useState } from 'react';

export default function IssuePage() {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // TODO: Handle file upload
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      console.log('File dropped:', files[0].name);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navigation />

      <main className="w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
            <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-24 md:h-24 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start text-black dark:text-white">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex items-end gap-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none">
                ISSUE ASSET
              </h1>
              <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                NEW $TOKEN
              </div>
            </div>
          </div>
          <p className="text-gray-400 max-w-2xl text-lg leading-relaxed">
            Create a pricing market for your content and issue reusable access vouchers
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            {/* Configuration */}
            <section>
              <div className="section-label">Configuration</div>
              <div className="card space-y-6">
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2 font-bold">
                    Target Path
                  </label>
                  <div className="flex items-center">
                    <span className="px-4 py-3 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-black dark:text-white font-mono text-sm">
                      $yourname.com/
                    </span>
                    <input
                      type="text"
                      placeholder="asset-name"
                      className="flex-1 bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 border-l-0 px-4 py-3 text-black dark:text-white placeholder-zinc-700 focus:outline-none focus:border-white transition-colors font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2 font-bold">
                      Base Price (SAT)
                    </label>
                    <input
                      type="number"
                      placeholder="1000"
                      className="w-full bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 px-4 py-3 text-black dark:text-white placeholder-zinc-700 focus:outline-none focus:border-white transition-colors font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2 font-bold">
                      Initial Supply
                    </label>
                    <input
                      type="number"
                      placeholder="10000"
                      className="w-full bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 px-4 py-3 text-black dark:text-white placeholder-zinc-700 focus:outline-none focus:border-white transition-colors font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2 font-bold">
                    Pricing Dynamics
                  </label>
                  <select className="w-full bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 px-4 py-3 text-black dark:text-white focus:outline-none focus:border-white transition-colors font-mono text-sm appearance-none cursor-pointer">
                    <option value="sqrt_decay">SQRT_DECAY (Hyper-deflationary)</option>
                    <option value="fixed">FIXED (Stable access)</option>
                    <option value="linear_floor">LINEAR_FLOOR (Steady decline)</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Inscription Details */}
            <section>
              <div className="section-label">Inscription Metadata</div>
              <div className="card space-y-4">
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  BSV-21 Protocol Bridge Active
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Every $402 token is backed by a legal on-chain inscription. This ensures your content rights are cryptographically enforceable and tradable on global markets.
                </p>
              </div>
            </section>
          </div>

          <div className="space-y-8">
            {/* Content Payload */}
            <section className="h-full flex flex-col">
              <div className="section-label">Content Payload</div>
              <div
                className={`flex-1 card border-2 border-dashed flex flex-col items-center justify-center p-12 transition-all ${dragActive
                    ? 'border-white bg-white/5'
                    : 'border-gray-200 dark:border-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600'
                  }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="text-6xl mb-6">📦</div>
                <div className="text-sm font-bold uppercase tracking-widest mb-2">
                  Drop manifest or file
                </div>
                <div className="text-xs text-zinc-500 font-mono mb-6">
                  Maximum payload: 5GB (via P2P stream)
                </div>
                <input
                  type="file"
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="px-8 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all cursor-pointer"
                >
                  Browse Files
                </label>
              </div>
            </section>

            {/* Global Issue Button */}
            <button
              disabled
              className="w-full py-6 bg-black dark:bg-white text-white dark:text-black text-sm font-bold uppercase tracking-[0.3em] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98] btn-premium shadow-2xl"
            >
              INITIALIZE TOKEN ISSUANCE
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
