'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { useRoom, useRoomMessages, useSendRoomMessage, useJoinRoom, useLeaveRoom, useStatus } from '@/hooks/useAPI';
import { useVoiceRoom } from '@/hooks/useVoiceRoom';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

export default function RoomDetailPage() {
    const params = useParams();
    const roomId = params.roomId as string;
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const { data: status } = useStatus();

    const { data: room, refetch: refetchRoom } = useRoom(roomId);
    const { data: messages, refetch: refetchMessages } = useRoomMessages(roomId);
    const sendMessage = useSendRoomMessage();
    const joinRoom = useJoinRoom();
    const leaveRoom = useLeaveRoom();

    const voice = useVoiceRoom();

    // Listen for incoming room messages via IPC
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).path402?.onRoomMessage) {
            (window as any).path402.onRoomMessage((payload: any) => {
                if (payload.room_id === roomId) {
                    refetchMessages();
                }
            });

            (window as any).path402?.onRoomMemberJoined?.((payload: any) => {
                if (payload.room_id === roomId) refetchRoom();
            });

            (window as any).path402?.onRoomMemberLeft?.((payload: any) => {
                if (payload.room_id === roomId) refetchRoom();
            });

            return () => {
                (window as any).path402?.removeRoomListeners?.();
            };
        }
    }, [roomId, refetchMessages, refetchRoom]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Listen for voice signals
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).path402?.onCallSignal) {
            (window as any).path402.onCallSignal((remotePeer: string, signal: any) => {
                if (signal.type?.startsWith('ROOM_')) {
                    voice.handleVoiceSignal(remotePeer, signal);
                }
            });
        }
    }, [voice.handleVoiceSignal]);

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage.mutate({ roomId, content: input });
        setInput('');
        setTimeout(() => refetchMessages(), 200);
    };

    const handleJoin = () => {
        joinRoom.mutate(roomId);
        setTimeout(() => refetchRoom(), 500);
    };

    const handleLeave = () => {
        leaveRoom.mutate(roomId);
        if (voice.state === 'connected') {
            voice.leaveVoiceRoom();
        }
        setTimeout(() => refetchRoom(), 500);
    };

    const handleVoiceToggle = () => {
        if (voice.state === 'connected') {
            voice.leaveVoiceRoom();
        } else {
            const memberPeerIds = room?.members?.filter((m: any) => m.active).map((m: any) => m.peer_id) || [];
            voice.joinVoiceRoom(roomId, memberPeerIds);
        }
    };

    if (!room) {
        return (
            <PageContainer>
                <Navigation />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Loading room...</div>
                </main>
            </PageContainer>
        );
    }

    const isVoiceCapable = room.room_type === 'voice' || room.room_type === 'hybrid';
    const activeMembers = room.members?.filter((m: any) => m.active) || [];

    return (
        <PageContainer>
            <Navigation />

            <main className="flex-1 w-full px-4 md:px-8 py-8 flex flex-col gap-0 overflow-hidden max-w-[1920px] mx-auto h-[calc(100vh-64px)]">
                <PageHeader
                    title={room.name.toUpperCase()}
                    extension={`.${room.room_type.toUpperCase()}`}
                    superTitle={
                        <>
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Room / {room.access_type} / {activeMembers.length} online
                        </>
                    }
                    description=""
                    icon={room.room_type === 'voice' ? '🎙' : room.room_type === 'hybrid' ? '📡' : '💬'}
                />

                {/* Room Content */}
                <div className="flex-1 flex flex-col md:flex-row border border-zinc-200 dark:border-zinc-800 min-h-0 bg-white dark:bg-black">
                    {/* Messages Area */}
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Voice Controls Bar */}
                        {isVoiceCapable && (
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleVoiceToggle}
                                        className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${voice.state === 'connected'
                                            ? 'bg-red-500 text-white border-red-500'
                                            : 'bg-green-500 text-white border-green-500 hover:opacity-80'
                                            }`}
                                    >
                                        {voice.state === 'connected' ? 'Leave Voice' : voice.state === 'joining' ? 'Connecting...' : 'Join Voice'}
                                    </button>
                                    {voice.state === 'connected' && (
                                        <button
                                            onClick={voice.toggleMute}
                                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${voice.audioEnabled
                                                ? 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                : 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                                                }`}
                                        >
                                            {voice.audioEnabled ? 'Mute' : 'Unmute'}
                                        </button>
                                    )}
                                </div>
                                {voice.state === 'connected' && (
                                    <div className="text-[10px] font-mono text-zinc-500">
                                        {voice.members.size} peer{voice.members.size !== 1 ? 's' : ''} connected
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-6 space-y-6"
                        >
                            {messages && messages.length > 0 ? (
                                [...messages].reverse().map((msg: any, i: number) => (
                                    <div key={i} className="group flex flex-col gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 -mx-4 px-4 py-2 transition-colors">
                                        <div className="flex items-baseline gap-3">
                                            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-blue-600 dark:text-blue-400">
                                                {msg.sender_handle || msg.sender_peer_id?.slice(0, 8) || 'unknown'}
                                            </span>
                                            <span className="text-[9px] text-zinc-400 font-mono">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <div className="text-sm text-zinc-600 dark:text-zinc-300 font-mono leading-relaxed pl-4 border-l border-zinc-200 dark:border-zinc-800">
                                            {msg.content}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-700">
                                    <div className="text-6xl mb-4 opacity-20">💬</div>
                                    <div className="text-xs font-bold uppercase tracking-widest">Room is quiet</div>
                                    <div className="text-[10px] font-mono mt-1">Be the first to send a message</div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
                            <div className="flex">
                                <span className="px-4 py-4 bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono text-xs flex items-center">
                                    &gt;
                                </span>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder={`Message ${room.name}...`}
                                    className="flex-1 bg-transparent px-4 py-4 text-sm font-mono focus:outline-none placeholder-zinc-400 text-black dark:text-white"
                                    autoFocus
                                />
                                <button
                                    onClick={handleSend}
                                    className="px-8 border-l border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Members Sidebar */}
                    <div className="w-full md:w-56 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 shrink-0">
                        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                Members ({activeMembers.length})
                            </div>
                        </div>
                        <div className="flex flex-col">
                            {activeMembers.length === 0 ? (
                                <div className="p-4 text-xs text-zinc-500 text-center font-mono">
                                    No active members
                                </div>
                            ) : (
                                activeMembers.map((member: any) => (
                                    <div
                                        key={member.peer_id}
                                        className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50"
                                    >
                                        <span className="w-2 h-2 bg-green-500 rounded-full shrink-0"></span>
                                        <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
                                            {member.peer_id.slice(0, 12)}...
                                        </span>
                                        {member.role === 'owner' && (
                                            <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                                OWNER
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Room Actions */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
                            <button
                                onClick={handleJoin}
                                className="w-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-green-500 text-green-600 hover:bg-green-500 hover:text-white transition-all"
                            >
                                Join Room
                            </button>
                            <button
                                onClick={handleLeave}
                                className="w-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-red-500 text-red-600 hover:bg-red-500 hover:text-white transition-all"
                            >
                                Leave Room
                            </button>
                        </div>

                        {/* Room Info */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Info</div>
                            <div className="text-[10px] font-mono text-zinc-400 space-y-1">
                                <div>Type: {room.room_type}</div>
                                <div>Access: {room.access_type}</div>
                                <div>Capacity: {room.capacity}</div>
                                {room.token_id && (
                                    <div className="truncate">Token: {room.token_id.slice(0, 16)}...</div>
                                )}
                                <div className="truncate">ID: {room.room_id.slice(0, 16)}...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </PageContainer>
    );
}
