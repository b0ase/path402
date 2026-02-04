'use client';

import { Navigation } from '@/components/Navigation';
import { useState } from 'react';

export default function UploadPage() {
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
    <div className="min-h-screen">
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Upload Content</h1>
          <p className="text-zinc-500">
            Upload a video and mint a $402 token
          </p>
        </div>

        {/* Drop Zone */}
        <div
          className={`card border-2 border-dashed mb-8 transition-colors ${
            dragActive
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-zinc-700 hover:border-zinc-600'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="py-16 text-center">
            <div className="text-5xl mb-4">📁</div>
            <div className="text-white mb-2">
              Drop your video here
            </div>
            <div className="text-zinc-500 text-sm mb-4">
              or click to browse
            </div>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-block px-4 py-2 bg-zinc-800 text-white rounded-lg cursor-pointer hover:bg-zinc-700"
            >
              Select File
            </label>
          </div>
        </div>

        {/* Token Settings */}
        <div className="card mb-8">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
            Token Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Token Path
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-l text-cyan-400">
                  $yourname.com/
                </span>
                <input
                  type="text"
                  placeholder="video-name"
                  className="flex-1 bg-zinc-900 border border-zinc-700 border-l-0 rounded-r px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Base Price (SAT)
              </label>
              <input
                type="number"
                placeholder="1000"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">
                Pricing Model
              </label>
              <select className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:border-zinc-600">
                <option value="sqrt_decay">sqrt_decay (recommended)</option>
                <option value="fixed">fixed</option>
                <option value="linear_floor">linear_floor</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="encrypt"
                className="w-4 h-4 bg-zinc-900 border border-zinc-700 rounded"
              />
              <label htmlFor="encrypt" className="text-sm text-zinc-400">
                Encrypt content (only token holders can decrypt)
              </label>
            </div>
          </div>
        </div>

        {/* Mint Button */}
        <button
          disabled
          className="w-full py-4 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Upload & Mint Token
        </button>

        <p className="text-center text-zinc-500 text-xs mt-4">
          Minting will create a BSV21 token inscription
        </p>
      </main>
    </div>
  );
}
