'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export type VoiceRoomState = 'idle' | 'joining' | 'connected' | 'error';

export interface VoiceMember {
  peerId: string;
  stream: MediaStream | null;
  pc: RTCPeerConnection;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const MAX_MESH_PEERS = 6;

// ── Hook ──────────────────────────────────────────────────────────

export function useVoiceRoom() {
  const [state, setState] = useState<VoiceRoomState>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [members, setMembers] = useState<Map<string, VoiceMember>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const membersRef = useRef<Map<string, VoiceMember>>(new Map());
  const roomIdRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    membersRef.current = members;
  }, [members]);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const sendVoiceSignal = useCallback(async (peerId: string, signal: any) => {
    if (typeof window !== 'undefined' && window.path402?.sendRoomVoiceSignal) {
      await window.path402.sendRoomVoiceSignal(peerId, signal);
    }
  }, []);

  const createPeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        sendVoiceSignal(remotePeerId, {
          type: 'ROOM_ICE',
          payload: {
            room_id: roomIdRef.current,
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sender_peer_id: 'self',
          },
        });
      }
    };

    pc.ontrack = (event) => {
      setMembers(prev => {
        const next = new Map(prev);
        const existing = next.get(remotePeerId);
        if (existing) {
          next.set(remotePeerId, { ...existing, stream: event.streams[0] || null });
        }
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(remotePeerId);
      }
    };

    return pc;
  }, [sendVoiceSignal]);

  const removePeer = useCallback((peerId: string) => {
    setMembers(prev => {
      const next = new Map(prev);
      const member = next.get(peerId);
      if (member) {
        member.pc.close();
        next.delete(peerId);
      }
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    membersRef.current.forEach(member => {
      member.pc.close();
    });
    setMembers(new Map());
    membersRef.current = new Map();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setAudioEnabled(true);
  }, []);

  // ── Join Voice Room ──────────────────────────────────────────────

  const joinVoiceRoom = useCallback(async (targetRoomId: string, existingMembers: string[] = []) => {
    if (state !== 'idle') return;

    setState('joining');
    setRoomId(targetRoomId);
    roomIdRef.current = targetRoomId;

    try {
      // Acquire audio only (no video for voice rooms)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Create offer to each existing member (up to MAX_MESH_PEERS)
      const peersToConnect = existingMembers.slice(0, MAX_MESH_PEERS);

      for (const peerId of peersToConnect) {
        const pc = createPeerConnection(peerId);
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        setMembers(prev => {
          const next = new Map(prev);
          next.set(peerId, { peerId, stream: null, pc });
          return next;
        });

        await sendVoiceSignal(peerId, {
          type: 'ROOM_OFFER',
          payload: {
            room_id: targetRoomId,
            sdp: offer.sdp!,
            sender_peer_id: 'self',
          },
        });
      }

      setState('connected');
    } catch (err) {
      console.error('[useVoiceRoom] join error:', err);
      cleanup();
      setState('error');
    }
  }, [state, createPeerConnection, sendVoiceSignal, cleanup]);

  // ── Leave Voice Room ─────────────────────────────────────────────

  const leaveVoiceRoom = useCallback(() => {
    cleanup();
    setState('idle');
    setRoomId(null);
    roomIdRef.current = null;
  }, [cleanup]);

  // ── Handle Incoming Voice Signals ────────────────────────────────

  const handleVoiceSignal = useCallback(async (remotePeerId: string, signal: any) => {
    const { type, payload } = signal;

    // Only handle signals for our room
    if (payload.room_id !== roomIdRef.current) return;

    switch (type) {
      case 'ROOM_OFFER': {
        if (membersRef.current.size >= MAX_MESH_PEERS) break;

        const pc = createPeerConnection(remotePeerId);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
        }

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        setMembers(prev => {
          const next = new Map(prev);
          next.set(remotePeerId, { peerId: remotePeerId, stream: null, pc });
          return next;
        });

        await sendVoiceSignal(remotePeerId, {
          type: 'ROOM_ANSWER',
          payload: {
            room_id: roomIdRef.current,
            sdp: answer.sdp!,
            sender_peer_id: 'self',
          },
        });
        break;
      }

      case 'ROOM_ANSWER': {
        const member = membersRef.current.get(remotePeerId);
        if (member?.pc) {
          await member.pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: payload.sdp })
          );
        }
        break;
      }

      case 'ROOM_ICE': {
        const member = membersRef.current.get(remotePeerId);
        if (member?.pc && payload.candidate) {
          await member.pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: payload.candidate,
              sdpMid: payload.sdpMid,
              sdpMLineIndex: payload.sdpMLineIndex,
            })
          );
        }
        break;
      }
    }
  }, [createPeerConnection, sendVoiceSignal]);

  // ── Toggle Mute ──────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    roomId,
    audioEnabled,
    localStream,
    members,
    joinVoiceRoom,
    leaveVoiceRoom,
    handleVoiceSignal,
    toggleMute,
  };
}
