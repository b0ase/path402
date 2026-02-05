'use client';

import { PageContainer } from '@/components/PageContainer';
import { Navigation } from '@/components/Navigation';
import { useState } from 'react';

// Mock data for the library
const MOCK_LIBRARY = [
    {
        id: 'VID_2026_001',
        title: 'Grok Demo Sequence',
        duration: '00:15',
        size: '12.4 MB',
        type: 'video/mp4',
        src: '/videos/demo.mp4',
        acquired_at: '2026-02-04 14:22',
        cost: 500
    },
    {
        id: 'VID_2026_002',
        title: 'Neural Network Visualization',
        duration: '04:20',
        size: '145 MB',
        type: 'video/mp4',
        src: null, // Placeholder
        acquired_at: '2026-02-03 09:15',
        cost: 1200
    },
    {
        id: 'VID_2026_003',
        title: 'Market Analysis Q1',
        duration: '12:00',
        size: '450 MB',
        type: 'video/mp4',
        src: null, // Placeholder
        acquired_at: '2026-02-01 18:30',
        cost: 2500
    }
];

export default function LibraryPage() {
    const [activeVideo, setActiveVideo] = useState<typeof MOCK_LIBRARY[0] | null>(null);

    return (
        <PageContainer>
            <Navigation />

            <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
                {/* Header - Industrial Style */}
                <header className="mb-16 border-b border-zinc-200 dark:border-zinc-900 pb-8 flex items-end justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-4 text-zinc-500 text-xs tracking-widest uppercase">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Local Content / Decrypted Archive
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-2">
                            LIBRARY<span className="text-zinc-300 dark:text-zinc-800">.SYS</span>
                        </h1>
                        <p className="text-zinc-500 max-w-lg">
                            <b>Secure Playback Terminal.</b> Your personal archive of locally acquired content. Decrypted on-the-fly.
                        </p>
                    </div>
                    <div className="hidden md:block text-6xl text-zinc-900 opacity-10 dark:opacity-50">
                        📹
                    </div>
                </header>

                <div className="grid lg:grid-cols-3 gap-12">
                    {/* Main Player Area */}
                    <div className="lg:col-span-2 space-y-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-900 pb-2 mb-4 text-zinc-500">
                            PLAYBACK TERMINAL
                        </h3>

                        <div className="aspect-video bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 relative group overflow-hidden">
                            {activeVideo ? (
                                activeVideo.src ? (
                                    <video
                                        src={activeVideo.src}
                                        controls
                                        autoPlay
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/5 dark:bg-zinc-900/20">
                                        <div className="w-16 h-16 border-2 border-dashed border-zinc-300 dark:border-zinc-800 flex items-center justify-center mb-4">
                                            <span className="text-2xl">⚠️</span>
                                        </div>
                                        <div className="text-xs font-bold uppercase tracking-widest">Content Not Found Locally</div>
                                        <div className="text-[10px] text-zinc-600 mt-2 font-mono">P2P SWARM SYNC REQUIRED</div>
                                    </div>
                                )
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-50 dark:bg-zinc-900/20">
                                    <div className="w-24 h-24 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mb-6 bg-white dark:bg-zinc-950">
                                        <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-zinc-300 dark:border-l-zinc-600 border-b-[10px] border-b-transparent ml-1" />
                                    </div>
                                    <div className="text-xs font-bold uppercase tracking-widest">Select Item From Index</div>
                                    <div className="text-[10px] text-zinc-400 dark:text-zinc-700 mt-2 font-mono">WAITING FOR INPUT...</div>
                                </div>
                            )}

                            {/* Overlay Info - Industrial Tag */}
                            {activeVideo && (
                                <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                                    <div className="bg-white dark:bg-black text-black dark:text-white border border-zinc-200 dark:border-zinc-800 px-3 py-1 text-[9px] font-bold uppercase tracking-widest">
                                        PLAYING: {activeVideo.id}
                                    </div>
                                    <div className="bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-500 border border-green-200 dark:border-green-900/30 px-3 py-1 text-[9px] font-bold uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                        DECRYPTED
                                    </div>
                                </div>
                            )}
                        </div>

                        {activeVideo && (
                            <div className="bg-zinc-50 dark:bg-zinc-900/30 p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold tracking-tight text-black dark:text-white mb-1">{activeVideo.title}</h2>
                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">{activeVideo.id}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-black dark:text-white">{activeVideo.cost} <span className="text-zinc-600 text-xs">SAT</span></div>
                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest">ACQUISITION COST</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">Duration</span>
                                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{activeVideo.duration}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">Size</span>
                                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{activeVideo.size}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">Type</span>
                                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300 uppercase">{activeVideo.type.split('/')[1]}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[9px] uppercase tracking-widest text-zinc-600 block">Acquired</span>
                                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{activeVideo.acquired_at.split(' ')[0]}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Playlist / Library List */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-900 pb-2 mb-4 text-zinc-500">
                            ARCHIVE INDEX
                        </h3>

                        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 h-[600px] overflow-y-auto scrollbar-hide">
                            {MOCK_LIBRARY.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveVideo(item)}
                                    className={`w-full text-left p-4 border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all group relative overflow-hidden ${activeVideo?.id === item.id ? 'bg-zinc-50 dark:bg-zinc-900 border-l-2 border-l-black dark:border-l-white' : 'border-l-2 border-l-transparent opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[9px] font-mono tracking-widest uppercase ${activeVideo?.id === item.id ? 'text-green-600 dark:text-green-500' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                                            {item.id}
                                        </span>
                                        <span className="text-[9px] font-mono text-zinc-600 bg-zinc-50 dark:bg-zinc-950 px-1 border border-zinc-200 dark:border-zinc-900">
                                            {item.duration}
                                        </span>
                                    </div>

                                    <h3 className={`font-bold text-sm mb-3 truncate ${activeVideo?.id === item.id ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-zinc-200'}`}>
                                        {item.title}
                                    </h3>

                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${item.src ? 'bg-green-600 dark:bg-green-900' : 'bg-red-600 dark:bg-red-900'}`}></div>
                                            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">{item.src ? 'LOCAL' : 'REMOTE'}</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-zinc-600 uppercase border-l border-zinc-200 dark:border-zinc-800 pl-3">
                                            {item.size}
                                        </span>
                                    </div>

                                    {activeVideo?.id === item.id && (
                                        <div className="absolute inset-0 border border-black/5 dark:border-white/10 pointer-events-none" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Storage Info */}
                        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Storage Usage</span>
                                <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400">12.4 GB / 1 TB</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-900 h-1">
                                <div className="bg-zinc-500 h-1 w-[1.2%]"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </PageContainer>
    );
}
