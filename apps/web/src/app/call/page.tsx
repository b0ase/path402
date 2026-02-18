'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { useCall, CallState } from '@/hooks/useCall';

interface CallPeer {
  peerId: string;
  label: string;
}

export default function CallPage() {
  const [peers, setPeers] = useState<CallPeer[]>([]);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    callState,
    callInfo,
    endReason,
    localStream,
    remoteStream,
    audioEnabled,
    videoEnabled,
    startCall,
    acceptCall,
    handleSignal,
    endCall,
    toggleAudio,
    toggleVideo,
    resetCall,
  } = useCall();

  // Check for Electron
  useEffect(() => {
    const electron = typeof window !== 'undefined' && !!window.path402?.isElectron;
    setIsElectron(electron);
  }, []);

  // Fetch peers periodically
  useEffect(() => {
    if (!isElectron) return;

    const fetchPeers = async () => {
      try {
        const result = await window.path402?.getCallPeers?.();
        if (result) setPeers(result);
        const id = await window.path402?.getCallPeerId?.();
        if (id) setMyPeerId(id);
      } catch {}
    };

    fetchPeers();
    const interval = setInterval(fetchPeers, 5000);
    return () => clearInterval(interval);
  }, [isElectron]);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Listen for incoming signals during active call
  useEffect(() => {
    if (!isElectron || callState === 'idle') return;

    const handler = (remotePeer: string, signal: any) => {
      // Only handle ICE candidates, answers, hangups — offers are handled by IncomingCallProvider
      if (signal.type !== 'CALL_OFFER') {
        handleSignal(remotePeer, signal);
      }
    };

    window.path402?.onCallSignal?.(handler);
    return () => {
      window.path402?.removeCallSignalListener?.();
    };
  }, [isElectron, callState, handleSignal]);

  // Check for pending inbound call from IncomingCallProvider
  useEffect(() => {
    const pending = sessionStorage.getItem('pending-call');
    if (pending) {
      sessionStorage.removeItem('pending-call');
      try {
        const data = JSON.parse(pending);
        acceptCall(data.callId, data.callerPeerId, data.sdp);
      } catch (err) {
        console.error('[CallPage] Failed to accept pending call:', err);
      }
    }
  }, [acceptCall]);

  const isInCall = callState !== 'idle' && callState !== 'ended';

  if (!isElectron) {
    return (
      <PageContainer>
        <Navigation />
        <main className="flex-1 w-full px-4 md:px-8 py-8 max-w-[1920px] mx-auto">
          <PageHeader
            title="COMMS"
            extension=".LINK"
            superTitle={<>Encrypted P2P Video</>}
            description="Desktop app required for video calling."
          />
          <div className="border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <div className="text-6xl mb-4 opacity-20">&#9743;</div>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Desktop App Required
            </div>
            <div className="text-xs font-mono text-zinc-400">
              P2P video calling requires the $402 desktop app for libp2p signaling.
            </div>
          </div>
        </main>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Navigation />

      <main className="flex-1 w-full px-4 md:px-8 py-8 max-w-[1920px] mx-auto">
        <PageHeader
          title="COMMS"
          extension=".LINK"
          superTitle={
            <>
              <span className={`w-2 h-2 rounded-full ${isInCall ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
              {isInCall ? `Active Call / ${callState}` : 'Encrypted P2P Video'}
            </>
          }
          description={isInCall ? '' : 'End-to-end encrypted video calls over libp2p.'}
        />

        {/* Active Call View */}
        {isInCall && (
          <div className="border border-zinc-200 dark:border-zinc-800 bg-black relative" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
            {/* Remote Video (Full) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Connection Status */}
            {callState !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center">
                  <div className="w-4 h-4 mx-auto mb-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-bold uppercase tracking-widest text-white">
                    {callState === 'calling' ? 'Calling...' : callState === 'ringing' ? 'Ringing...' : 'Connecting...'}
                  </div>
                  {callInfo && (
                    <div className="text-[10px] font-mono text-zinc-400 mt-2">
                      {callInfo.remotePeerId.slice(0, 20)}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Local Video PiP */}
            <div className="absolute bottom-20 right-4 w-48 h-36 border border-zinc-600 bg-zinc-900 overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
              {!videoEnabled && (
                <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Camera Off</div>
                </div>
              )}
            </div>

            {/* Control Bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <button
                onClick={toggleAudio}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                  audioEnabled
                    ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
              >
                {audioEnabled ? 'Mute' : 'Unmute'}
              </button>
              <button
                onClick={toggleVideo}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                  videoEnabled
                    ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
              >
                {videoEnabled ? 'Cam Off' : 'Cam On'}
              </button>
              <button
                onClick={() => endCall('hangup')}
                className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Hang Up
              </button>
            </div>
          </div>
        )}

        {/* Ended State */}
        {callState === 'ended' && (
          <div className="border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Call Ended
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mb-6">
              {endReason === 'declined' ? 'Call was declined' :
               endReason === 'no-answer' ? 'No answer (timed out)' :
               endReason === 'error' ? 'Connection error' :
               'Call ended'}
            </div>
            <button
              onClick={resetCall}
              className="px-8 py-3 border border-zinc-300 dark:border-zinc-700 text-xs font-bold uppercase tracking-widest hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              Back to Peers
            </button>
          </div>
        )}

        {/* Idle: Peer List */}
        {callState === 'idle' && (
          <div className="border border-zinc-200 dark:border-zinc-800">
            {/* My ID */}
            {myPeerId && (
              <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Your Peer ID</div>
                <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">{myPeerId}</div>
              </div>
            )}

            {/* Peer Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Connected Peers ({peers.length})
              </div>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </div>

            {/* Peer List */}
            {peers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl mb-4 opacity-20">&#9743;</div>
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  No Peers Connected
                </div>
                <div className="text-[10px] font-mono text-zinc-400">
                  Connect to peers via bootstrap nodes in Settings
                </div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {peers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      </div>
                      <div>
                        <div className="text-xs font-mono font-bold text-black dark:text-white">
                          {peer.label}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 break-all max-w-xs truncate">
                          {peer.peerId}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => startCall(peer.peerId)}
                      className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    >
                      Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </PageContainer>
  );
}
