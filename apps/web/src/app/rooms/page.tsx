'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { useRooms, useCreateRoom, useJoinRoom, useStatus, Room } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import Link from 'next/link';

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
    text: { label: 'TEXT', color: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' },
    voice: { label: 'VOICE', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
    hybrid: { label: 'HYBRID', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
};

const ACCESS_BADGES: Record<string, { label: string; color: string }> = {
    public: { label: 'PUBLIC', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
    private: { label: 'PRIVATE', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
    token_gated: { label: 'TOKEN', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
};

export default function RoomsPage() {
    const { data: rooms, isLoading } = useRooms();
    const { data: status } = useStatus();
    const createRoom = useCreateRoom();
    const joinRoom = useJoinRoom();

    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<'text' | 'voice' | 'hybrid'>('text');
    const [newAccess, setNewAccess] = useState<'public' | 'private' | 'token_gated'>('public');
    const [newTokenSymbol, setNewTokenSymbol] = useState('');

    const handleCreate = () => {
        if (!newName.trim()) return;
        createRoom.mutate({
            name: newName,
            roomType: newType,
            accessType: newAccess,
            tokenSymbol: newAccess === 'token_gated' ? newTokenSymbol : undefined,
        });
        setNewName('');
        setNewTokenSymbol('');
        setShowCreate(false);
    };

    return (
        <PageContainer>
            <Navigation />

            <main className="flex-1 w-full px-4 md:px-8 py-8 flex flex-col gap-6 max-w-[1920px] mx-auto">
                <PageHeader
                    title="ROOMS"
                    extension=".MESH"
                    superTitle={
                        <>
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Chat Rooms / Voice Channels
                        </>
                    }
                    description="Create and join rooms for group chat and voice communication."
                    icon="🏠"
                />

                {/* Create Room Button */}
                <div className="flex justify-end">
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
                    >
                        {showCreate ? 'Cancel' : '+ Create Room'}
                    </button>
                </div>

                {/* Create Room Form */}
                {showCreate && (
                    <div className="border border-zinc-200 dark:border-zinc-800 p-6 bg-zinc-50 dark:bg-zinc-900/20">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">New Room</div>
                        <div className="flex flex-col gap-4">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Room name..."
                                className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-mono focus:outline-none text-black dark:text-white"
                            />
                            <div className="flex gap-2">
                                {(['text', 'voice', 'hybrid'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setNewType(t)}
                                        className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${newType === t
                                            ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'
                                            }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                {(['public', 'private', 'token_gated'] as const).map((a) => (
                                    <button
                                        key={a}
                                        onClick={() => setNewAccess(a)}
                                        className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all ${newAccess === a
                                            ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'
                                            }`}
                                    >
                                        {a.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                            {newAccess === 'token_gated' && (
                                <input
                                    type="text"
                                    value={newTokenSymbol}
                                    onChange={(e) => setNewTokenSymbol(e.target.value)}
                                    placeholder="Token symbol (e.g. $ROOM)..."
                                    className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-mono focus:outline-none text-black dark:text-white"
                                />
                            )}
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || createRoom.isPending}
                                className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity disabled:opacity-30"
                            >
                                {createRoom.isPending ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Rooms List */}
                <div className="border border-zinc-200 dark:border-zinc-800">
                    {isLoading ? (
                        <div className="p-8 text-center text-zinc-500 text-xs font-mono uppercase tracking-widest">
                            Loading rooms...
                        </div>
                    ) : !rooms || rooms.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="text-4xl mb-4 opacity-20">🏠</div>
                            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">No rooms yet</div>
                            <div className="text-[10px] font-mono text-zinc-400 mt-1">Create a room to get started</div>
                        </div>
                    ) : (
                        rooms.map((room: Room) => {
                            const typeBadge = TYPE_BADGES[room.room_type] || TYPE_BADGES.text;
                            const accessBadge = ACCESS_BADGES[room.access_type] || ACCESS_BADGES.public;

                            return (
                                <Link
                                    key={room.room_id}
                                    href={`/rooms/${room.room_id}`}
                                    className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-black dark:text-white truncate">
                                                {room.name}
                                            </span>
                                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${typeBadge.color}`}>
                                                {typeBadge.label}
                                            </span>
                                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${accessBadge.color}`}>
                                                {accessBadge.label}
                                            </span>
                                            {room.token_id && (
                                                <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                                    GATED
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-zinc-500 font-mono mt-1">
                                            Created by {room.creator_peer_id.slice(0, 12)}... | Cap: {room.capacity}
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-400 font-mono group-hover:text-black dark:group-hover:text-white transition-colors">
                                        →
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </main>
        </PageContainer>
    );
}
