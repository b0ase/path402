'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface IncomingCall {
  callId: string;
  callerPeerId: string;
  callerNodeId: string;
  sdp: string;
}

interface IncomingCallContextValue {
  incomingCall: IncomingCall | null;
  acceptIncoming: () => void;
  declineIncoming: () => void;
}

const IncomingCallContext = createContext<IncomingCallContextValue>({
  incomingCall: null,
  acceptIncoming: () => {},
  declineIncoming: () => {},
});

export function useIncomingCall() {
  return useContext(IncomingCallContext);
}

export function IncomingCallProvider({ children }: { children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.path402?.onCallSignal) return;

    const handler = (remotePeer: string, signal: any) => {
      if (signal.type === 'CALL_OFFER') {
        setIncomingCall({
          callId: signal.payload.call_id,
          callerPeerId: remotePeer,
          callerNodeId: signal.payload.caller_node_id || remotePeer,
          sdp: signal.payload.sdp,
        });
      }
    };

    window.path402.onCallSignal(handler);
    return () => {
      window.path402?.removeCallSignalListener?.();
    };
  }, []);

  const acceptIncoming = useCallback(() => {
    if (!incomingCall) return;
    // Store pending call data for the call page to pick up
    sessionStorage.setItem('pending-call', JSON.stringify(incomingCall));
    setIncomingCall(null);
    router.push('/call/');
  }, [incomingCall, router]);

  const declineIncoming = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await window.path402?.sendCallSignal?.(incomingCall.callerPeerId, {
        type: 'CALL_REJECT',
        payload: { call_id: incomingCall.callId, reason: 'declined' },
      });
    } catch (err) {
      console.error('[IncomingCallProvider] Failed to send reject:', err);
    }
    setIncomingCall(null);
  }, [incomingCall]);

  return (
    <IncomingCallContext.Provider value={{ incomingCall, acceptIncoming, declineIncoming }}>
      {children}

      {/* Ring Modal Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="border border-zinc-700 bg-zinc-900 p-8 max-w-md w-full mx-4">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-4">
                Incoming Call
              </div>
              <div className="w-20 h-20 mx-auto mb-4 border border-zinc-600 flex items-center justify-center">
                <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div className="text-lg font-mono font-bold text-white">
                {incomingCall.callerNodeId.slice(0, 16)}...
              </div>
              <div className="text-xs font-mono text-zinc-500 mt-1">
                Peer: {incomingCall.callerPeerId.slice(0, 20)}...
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={declineIncoming}
                className="flex-1 px-6 py-4 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Decline
              </button>
              <button
                onClick={acceptIncoming}
                className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-500 text-white text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </IncomingCallContext.Provider>
  );
}
