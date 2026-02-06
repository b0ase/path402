'use client';

import { useState, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Navigation } from '@/components/Navigation';
import { useTokens, Token } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';

// Extended token type with video
interface FNewsToken extends Token {
  video: string;
}

// Sample Data for Satire
const SAMPLE_SATIRE_TOKENS: FNewsToken[] = [
  {
    token_id: '402_BONES',
    name: 'ALEX BONES',
    description: 'THE JEPSTEIN FILES: GLOBALIST PLOT REVEALED. "THEY ARE TURNING THE FRIGGIN\' FROGS GAY!" EXCLUSIVE REVEAL OF INTERDIMENSIONAL VAMPIRE SECRETS.',
    base_price_sats: 420,
    pricing_model: 'bonding_curve',
    current_supply: 1,
    image: '/alex_bones.png',
    video: '/videos/demo.mp4'
  },
  {
    token_id: '402_CARLSEN',
    name: 'FUCKER CARLSEN',
    description: 'CONFUSION GRIPS THE NATION. WHY IS THE GREEN M&M NO LONGER SEXY? JUST ASKING QUESTIONS. THE WOKE MOB DOESN\'T WANT YOU TO KNOW.',
    base_price_sats: 69,
    pricing_model: 'fixed',
    current_supply: 1,
    image: '/fucker_carlsberg.png',
    video: '/videos/demo.mp4'
  },
  {
    token_id: '402_HOENS',
    name: 'CANDY HOENS',
    description: 'THE TRUTH HURTS. FACTS DON\'T CARE ABOUT YOUR FEELINGS, BUT I DO CARE ABOUT EXPOSING THE LIES OF THE MAINSTREAM NARRATIVE. DEBATE ME.',
    base_price_sats: 88,
    pricing_model: 'auction',
    current_supply: 1,
    image: '/candy_hoens.png',
    video: '/videos/demo.mp4'
  },
  {
    token_id: '402_FLUENZA',
    name: 'DICK FLUENZA',
    description: 'AMERICA FIRST... TO THE BASEMENT. CATCH THE FLU. YEAH, WE\'RE GOING THERE. UNFILTERED, UNHINGED, AND UNDERGROUND.',
    base_price_sats: 14,
    pricing_model: 'bonding_curve',
    current_supply: 1,
    image: '/dick_fluenza.png',
    video: '/videos/demo.mp4'
  },
  {
    token_id: '402_SMIRK',
    name: 'CHARLIE SMIRK',
    description: 'PROVE ME WRONG. IF SOCIALISM IS SO GOOD, WHY IS MY FACE SO SMALL? TURNING POINT USA? MORE LIKE TURNING POINT WHO CARES.',
    base_price_sats: 10,
    pricing_model: 'fixed',
    current_supply: 1,
    image: '/charlie_smirk.png',
    video: '/videos/demo.mp4'
  },
  {
    token_id: '402_FAYLOR',
    name: 'MICHAEL FAYLOR',
    description: 'THERE IS NO SECOND BEST. SELL YOUR HOUSE, SELL YOUR KIDNEY, BUY THE DIP. CYBER-HORNETS ARE COMING TO PROTECT YOUR ENERGY.',
    base_price_sats: 21000,
    pricing_model: 'fixed',
    current_supply: 21,
    image: '/micahel_faylor.png?v=3',
    video: '/videos/demo.mp4'
  }
];

// ── F.NEWS Video Card ───────────────────────────────────────────

function FNewsCard({ token }: { token: FNewsToken }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  const PREVIEW_LIMIT = 5; // seconds

  const handlePreview = useCallback(() => {
    setShowVideo(true);
    setIsPlaying(true);
    setPreviewTime(0);
    // video will autoplay once showVideo flips via onLoadedData
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setPreviewTime(vid.currentTime);
    if (!isUnlocked && vid.currentTime >= PREVIEW_LIMIT) {
      vid.pause();
      setIsPlaying(false);
    }
  }, [isUnlocked]);

  const handleVideoLoaded = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    vid.muted = !isUnlocked;
    vid.play().catch(() => {});
  }, [isUnlocked]);

  const handleUnlock = useCallback(() => {
    setStatus('DOWNLOADING...');
    setTimeout(() => {
      setIsUnlocked(true);
      setShowVideo(true);
      setStatus('SEEDING (RATIO 0.0)');
      // Reset and play full
      const vid = videoRef.current;
      if (vid) {
        vid.muted = false;
        vid.currentTime = 0;
        vid.play().catch(() => {});
        setIsPlaying(true);
      }
    }, 2000);
  }, []);

  const handlePlayFull = useCallback(() => {
    setShowVideo(true);
    setIsPlaying(true);
    const vid = videoRef.current;
    if (vid) {
      vid.muted = false;
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const previewPct = isUnlocked
    ? (videoRef.current ? (previewTime / (videoRef.current.duration || 1)) * 100 : 0)
    : (previewTime / PREVIEW_LIMIT) * 100;

  return (
    <div className="group border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:border-black dark:hover:border-white transition-colors relative">
      {/* Status Badge */}
      {status && (
        <div className="absolute top-0 left-0 z-20 bg-green-500 text-black px-2 py-0.5 text-[10px] font-bold font-mono uppercase tracking-widest">
          {status}
        </div>
      )}

      {/* Card Header - Video / Image */}
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative overflow-hidden">
        {/* Poster Image */}
        {token.image && !showVideo && (
          <img
            src={token.image}
            alt={token.name}
            className={`w-full h-full object-cover transition-all duration-500 ${isUnlocked ? 'grayscale-0' : 'grayscale group-hover:grayscale-0'}`}
          />
        )}

        {/* Video Element */}
        {showVideo && (
          <video
            ref={videoRef}
            src={token.video}
            poster={token.image}
            className="w-full h-full object-cover"
            playsInline
            onTimeUpdate={handleVideoTimeUpdate}
            onLoadedData={handleVideoLoaded}
            onEnded={handleVideoEnded}
          />
        )}

        {/* No image/video fallback */}
        {!token.image && !showVideo && (
          <span className="text-zinc-300 dark:text-zinc-800 font-mono text-4xl font-bold">?</span>
        )}

        {/* Preview Progress Bar */}
        {isPlaying && showVideo && (
          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="h-1 bg-zinc-800/50">
              <div
                className="h-full bg-red-500 transition-all duration-100 ease-linear"
                style={{ width: `${Math.min(previewPct, 100)}%` }}
              />
            </div>
            {!isUnlocked && (
              <div className="absolute bottom-2 left-0 right-0 text-center">
                <span className="bg-black/70 text-red-500 font-mono text-[9px] font-bold px-2 py-0.5">
                  PREVIEW {previewTime.toFixed(1)}s / {PREVIEW_LIMIT}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Preview ended overlay */}
        {!isPlaying && showVideo && !isUnlocked && previewTime >= PREVIEW_LIMIT && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
            <div className="text-red-500 font-mono text-[10px] font-bold uppercase tracking-widest mb-2">Preview ended</div>
            <div className="text-zinc-500 font-mono text-[9px]">Buy ticket to watch full clip</div>
          </div>
        )}

        {/* Locked Overlay (static, before any play) */}
        {!isUnlocked && !showVideo && (
          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
        )}

        {/* Price Tag */}
        <div className="absolute top-0 right-0 bg-black dark:bg-white text-white dark:text-black px-3 py-1 font-mono text-xs font-bold z-20">
          {token.base_price_sats} SAT
        </div>

        {/* F.NEWS badge */}
        <div className="absolute bottom-0 left-0 bg-red-600 text-white px-2 py-0.5 text-[8px] font-bold font-mono uppercase tracking-widest z-20">
          F.NEWS
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
        <p className="text-xs text-zinc-500 font-mono h-12 leading-relaxed line-clamp-3">
          {token.description}
        </p>
        <div className="pt-4 flex items-center gap-0 border-t border-zinc-100 dark:border-zinc-900">
          {!isUnlocked ? (
            <>
              <button
                onClick={handlePreview}
                disabled={isPlaying}
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-black dark:text-white text-[10px] font-bold uppercase tracking-widest transition-all border-r border-zinc-200 dark:border-zinc-800 disabled:opacity-50"
              >
                {isPlaying ? 'WATCHING...' : previewTime >= PREVIEW_LIMIT ? 'PREVIEW ENDED' : 'WATCH PREVIEW'}
              </button>
              <button
                onClick={handleUnlock}
                className="flex-1 py-3 bg-black text-white dark:bg-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                BUY TICKET
              </button>
            </>
          ) : (
            <button
              onClick={handlePlayFull}
              className="w-full py-3 bg-green-500 text-black font-bold uppercase tracking-widest text-[10px]"
            >
              {isPlaying ? 'NOW PLAYING' : 'PLAY FULL CLIP'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function MarketPage() {
  const { data: apiTokens, isLoading } = useTokens();
  const [activeTab, setActiveTab] = useState('All Assets');

  const isFNews = activeTab === 'F.NEWS';
  const isAllAssets = activeTab === 'All Assets';
  const showFNews = isFNews || isAllAssets;

  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title={isFNews ? "F.NEWS" : "MARKET"}
          extension={isFNews ? ".ONLINE" : ".SYS"}
          superTitle={
            <>
              <span className={`w-2 h-2 ${isFNews ? 'bg-red-600' : 'bg-green-500'} rounded-full animate-pulse`}></span>
              {isFNews ? "Unverified / Synthetic / Satire" : "Global Index / Gossip Network"}
            </>
          }
          description={
            <>
              {isFNews
                ? <b>Synthetic Media Marketplace.</b>
                : <b>Global Content Index.</b>
              }
              {isFNews
                ? " User-generated satirical deepfakes. Preview for free, buy ticket to unlock & seed."
                : " Discover and acquire access tokens propagated through the gossip protocol."
              }
            </>
          }
          icon={isFNews ? "📵" : "📡"}
          customRightElement={isFNews ? (
            <div className="relative w-48 h-48 border-4 border-red-600/50 rounded-full flex items-center justify-center -rotate-12 animate-in fade-in zoom-in duration-700">
              <div className="absolute inset-0 rounded-full border border-red-600/20 m-1"></div>
              <div className="text-center p-2">
                <div className="text-red-600 font-bold uppercase tracking-widest text-xs mb-1">Content Warning</div>
                <div className="text-red-800/60 dark:text-red-200/60 text-[8px] font-mono leading-tight px-4 uppercase">
                  All content in F.NEWS is AI-generated satire. No humans were harmed (or interviewed).
                </div>
                <div className="text-red-600 font-bold uppercase tracking-widest text-[8px] mt-2">Reality Check Required</div>
              </div>
            </div>
          ) : undefined}
        />

        {/* Categories - Industrial Tabs */}
        <section className="mb-12">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 border-b border-zinc-200 dark:border-zinc-900 pb-2">
            Asset Class
          </div>
          <div className="flex flex-wrap gap-0 bg-zinc-100 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800">
            {['All Assets', 'F.NEWS', 'Video Streams', 'API Endpoints', 'Knowledge Bases', 'Scientific Data'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-6 py-3 text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-all border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 hover:bg-white dark:hover:bg-zinc-900 hover:text-black dark:hover:text-white ${activeTab === cat
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'text-zinc-500'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Results Grid */}
        <section>
          {/* F.NEWS Video Cards */}
          {showFNews && (
            <>
              {isAllAssets && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                  F.NEWS &mdash; {SAMPLE_SATIRE_TOKENS.length} clips
                </div>
              )}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                {SAMPLE_SATIRE_TOKENS.map((token) => (
                  <FNewsCard key={token.token_id} token={token} />
                ))}
              </div>
            </>
          )}

          {/* Standard Market Assets (shown on All Assets + other non-F.NEWS tabs) */}
          {!isFNews && (
            <>
              {isAllAssets && apiTokens && (apiTokens as Token[]).length > 0 && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Network Assets &mdash; {(apiTokens as Token[]).length} indexed
                </div>
              )}
              {isLoading && (!apiTokens || (apiTokens as Token[]).length === 0) ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="aspect-video bg-zinc-100 dark:bg-zinc-900 animate-pulse border border-zinc-200 dark:border-zinc-800" />
                  ))}
                </div>
              ) : apiTokens && (apiTokens as Token[]).length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {apiTokens.map((token) => (
                    <div key={token.token_id} className="group border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:border-black dark:hover:border-white transition-colors">
                      <div className="aspect-video bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative overflow-hidden">
                        {token.image ? (
                          <img
                            src={token.image}
                            alt={token.name}
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                          />
                        ) : (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-800 font-mono text-4xl font-bold group-hover:scale-110 transition-transform duration-500">
                              $402
                            </span>
                            <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </>
                        )}
                        <div className="absolute top-0 right-0 bg-black dark:bg-white text-white dark:text-black px-3 py-1 font-mono text-xs font-bold">
                          {token.base_price_sats} SAT
                        </div>
                      </div>
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
              ) : !isAllAssets ? (
                <div className="border border-dashed border-zinc-300 dark:border-zinc-800 py-24 text-center bg-zinc-50 dark:bg-zinc-900/20">
                  <div className="text-4xl mb-6 opacity-20">📡</div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-2">No Tokens Indexed</h3>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto font-mono">
                    Connect to more peers or wait for gossip announcements to populate the index.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </PageContainer>
  );
}
