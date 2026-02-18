'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export type CallEndReason = 'hangup' | 'declined' | 'timeout' | 'error' | 'no-answer';

export interface CallInfo {
  callId: string;
  remotePeerId: string;
  direction: 'outbound' | 'inbound';
}

interface CallSignal {
  type: string;
  payload: any;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CALL_TIMEOUT_MS = 30_000;

// ── Hook ──────────────────────────────────────────────────────────

export function useCall() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [endReason, setEndReason] = useState<CallEndReason | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callInfoRef = useRef<CallInfo | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    callInfoRef.current = callInfo;
  }, [callInfo]);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setAudioEnabled(true);
    setVideoEnabled(true);
  }, []);

  const sendSignal = useCallback(async (peerId: string, signal: CallSignal) => {
    if (typeof window !== 'undefined' && window.path402?.sendCallSignal) {
      await window.path402.sendCallSignal(peerId, signal);
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && callInfoRef.current) {
        sendSignal(callInfoRef.current.remotePeerId, {
          type: 'ICE_CANDIDATE',
          payload: {
            call_id: callInfoRef.current.callId,
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] || null);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        endCall('error');
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  const getMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Outbound Call ──────────────────────────────────────────────

  const startCall = useCallback(async (remotePeerId: string) => {
    if (callState !== 'idle') return;

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const info: CallInfo = { callId, remotePeerId, direction: 'outbound' };
    setCallInfo(info);
    callInfoRef.current = info;
    setCallState('calling');
    setEndReason(null);

    try {
      const stream = await getMedia();
      const pc = createPeerConnection();

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await sendSignal(remotePeerId, {
        type: 'CALL_OFFER',
        payload: {
          call_id: callId,
          caller_node_id: await window.path402?.getCallPeerId?.() || 'unknown',
          sdp: offer.sdp!,
        },
      });

      // Timeout if no answer
      timeoutRef.current = setTimeout(() => {
        if (callInfoRef.current?.callId === callId) {
          endCall('no-answer');
        }
      }, CALL_TIMEOUT_MS);
    } catch (err) {
      console.error('[useCall] startCall error:', err);
      cleanup();
      setCallState('ended');
      setEndReason('error');
    }
  }, [callState, getMedia, createPeerConnection, sendSignal, cleanup]);

  // ── Inbound Call (Accept) ──────────────────────────────────────

  const acceptCall = useCallback(async (callId: string, remotePeerId: string, remoteSdp: string) => {
    const info: CallInfo = { callId, remotePeerId, direction: 'inbound' };
    setCallInfo(info);
    callInfoRef.current = info;
    setCallState('connecting');
    setEndReason(null);

    try {
      const stream = await getMedia();
      const pc = createPeerConnection();

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: remoteSdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendSignal(remotePeerId, {
        type: 'CALL_ANSWER',
        payload: {
          call_id: callId,
          sdp: answer.sdp!,
        },
      });
    } catch (err) {
      console.error('[useCall] acceptCall error:', err);
      cleanup();
      setCallState('ended');
      setEndReason('error');
    }
  }, [getMedia, createPeerConnection, sendSignal, cleanup]);

  // ── Handle Incoming Signals ────────────────────────────────────

  const handleSignal = useCallback(async (remotePeer: string, signal: CallSignal) => {
    const { type, payload } = signal;

    switch (type) {
      case 'CALL_ANSWER': {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setCallState('connecting');
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: payload.sdp })
          );
        }
        break;
      }

      case 'ICE_CANDIDATE': {
        if (pcRef.current && payload.candidate) {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate({
              candidate: payload.candidate,
              sdpMid: payload.sdpMid,
              sdpMLineIndex: payload.sdpMLineIndex,
            })
          );
        }
        break;
      }

      case 'CALL_REJECT': {
        endCall('declined');
        break;
      }

      case 'CALL_HANGUP': {
        endCall('hangup');
        break;
      }
    }
  }, []);

  // ── End Call ────────────────────────────────────────────────────

  const endCall = useCallback((reason: CallEndReason = 'hangup') => {
    if (callInfoRef.current && reason === 'hangup') {
      sendSignal(callInfoRef.current.remotePeerId, {
        type: 'CALL_HANGUP',
        payload: { call_id: callInfoRef.current.callId },
      });
    }
    cleanup();
    setCallState('ended');
    setEndReason(reason);
    setCallInfo(null);
  }, [sendSignal, cleanup]);

  // ── Media Controls ─────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  // ── Reset ──────────────────────────────────────────────────────

  const resetCall = useCallback(() => {
    cleanup();
    setCallState('idle');
    setCallInfo(null);
    setEndReason(null);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
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
  };
}
