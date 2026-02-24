'use client';

import { useState, useEffect, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { useChatStream, useSendMessage, ChatMessage, useStatus, useChatHistory, useDMConversations, useDMMessages, useSendDM } from '@/hooks/useAPI';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

type ChatMode = 'channel' | 'dm';

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [channel, setChannel] = useState('global');
    const [mode, setMode] = useState<ChatMode>('channel');
    const [selectedDMPeer, setSelectedDMPeer] = useState<string | null>(null);
    const [dmInput, setDmInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const { data: status } = useStatus();
    const sendMessage = useSendMessage();
    const sendDM = useSendDM();

    // Load persisted messages for current channel
    const { data: history } = useChatHistory(channel);
    const { data: dmConversations } = useDMConversations();
    const { data: dmMessages, refetch: refetchDMs } = useDMMessages(selectedDMPeer);

    // Load history on mount / channel switch
    useEffect(() => {
        if (history && history.length > 0) {
            const mapped = history.map((h: any) => ({
                channel: h.channel || channel,
                content: h.content,
                sender_handle: h.sender_handle,
                sender_address: h.sender_peer_id || 'unknown',
                timestamp: h.timestamp,
            })).reverse(); // History returns DESC, we want ASC
            setMessages(mapped);
        }
    }, [history, channel]);

    // Initialize stream for live messages
    useChatStream((msg) => {
        setMessages((prev) => [...prev, msg].slice(-200));
    });

    // Listen for incoming DMs via IPC
    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).path402?.onDMReceived) {
            (window as any).path402.onDMReceived((_remotePeer: string, _payload: any) => {
                refetchDMs();
            });
            return () => {
                (window as any).path402?.removeDMListener?.();
            };
        }
    }, [refetchDMs]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, dmMessages]);

    const handleSend = () => {
        if (!input.trim()) return;

        sendMessage.mutate({
            channel,
            content: input,
            handle: status?.nodeId ? `@${status.nodeId.slice(0, 8)}` : 'Anonymous'
        });

        const optimisticMsg: ChatMessage = {
            channel,
            content: input,
            sender_handle: status?.nodeId ? `@${status.nodeId.slice(0, 8)}` : 'Anonymous',
            sender_address: 'Me',
            timestamp: Date.now()
        };
        setMessages((prev) => [...prev, optimisticMsg]);
        setInput('');
    };

    const handleDMSend = () => {
        if (!dmInput.trim() || !selectedDMPeer) return;

        sendDM.mutate({ peerId: selectedDMPeer, content: dmInput });
        setDmInput('');
        setTimeout(() => refetchDMs(), 200);
    };

    return (
        <PageContainer>
            <Navigation />

            <main className="flex-1 w-full px-4 md:px-8 py-8 flex flex-col gap-0 overflow-hidden max-w-[1920px] mx-auto h-[calc(100vh-64px)]">
                <PageHeader
                    title="GOSSIP"
                    extension=".NET"
                    superTitle={
                        <>
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Secure Uplink / {mode === 'channel' ? `#${channel}` : `DM`}
                        </>
                    }
                    description=""
                    icon="⚡"
                />

                {/* Chat Area */}
                <div className="flex-1 flex flex-col md:flex-row border border-zinc-200 dark:border-zinc-800 min-h-0 bg-white dark:bg-black">
                    {/* Sidebar */}
                    <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 shrink-0 flex flex-col">
                        {/* Mode Toggle */}
                        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                            <button
                                onClick={() => setMode('channel')}
                                className={`flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'channel'
                                    ? 'bg-white dark:bg-zinc-900 text-black dark:text-white border-b-2 border-black dark:border-white'
                                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                                    }`}
                            >
                                Channels
                            </button>
                            <button
                                onClick={() => setMode('dm')}
                                className={`flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'dm'
                                    ? 'bg-white dark:bg-zinc-900 text-black dark:text-white border-b-2 border-black dark:border-white'
                                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                                    }`}
                            >
                                Direct
                            </button>
                        </div>

                        {mode === 'channel' ? (
                            <div className="flex flex-col flex-1 overflow-y-auto">
                                {['global', 'dev-ops', 'market-talk', 'support'].map((ch) => (
                                    <button
                                        key={ch}
                                        onClick={() => setChannel(ch)}
                                        className={`w-full text-left px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-all border-l-2 ${channel === ch
                                            ? 'border-black dark:border-white bg-white dark:bg-zinc-900 text-black dark:text-white'
                                            : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                                            }`}
                                    >
                                        #{ch}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col flex-1 overflow-y-auto">
                                {(!dmConversations || dmConversations.length === 0) ? (
                                    <div className="p-4 text-xs text-zinc-500 text-center font-mono">
                                        No conversations yet
                                    </div>
                                ) : (
                                    dmConversations.map((conv: any) => (
                                        <button
                                            key={conv.peer_id}
                                            onClick={() => setSelectedDMPeer(conv.peer_id)}
                                            className={`w-full text-left px-4 py-3 transition-all border-l-2 ${selectedDMPeer === conv.peer_id
                                                ? 'border-black dark:border-white bg-white dark:bg-zinc-900'
                                                : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                                                }`}
                                        >
                                            <div className="text-xs font-mono font-bold text-black dark:text-white truncate">
                                                {conv.peer_id.slice(0, 12)}...
                                            </div>
                                            <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                                                {conv.last_message.slice(0, 30)}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Messages Window */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-6 space-y-6"
                        >
                            {mode === 'channel' ? (
                                <>
                                    {messages.filter(m => m.channel === channel || m.channel === 'global').map((msg, i) => (
                                        <div key={i} className="group flex flex-col gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 -mx-4 px-4 py-2 transition-colors">
                                            <div className="flex items-baseline gap-3">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${msg.sender_handle?.startsWith('@') ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                    {msg.sender_handle || msg.sender_address.slice(0, 8)}
                                                </span>
                                                <span className="text-[9px] text-zinc-400 font-mono">
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="text-sm text-zinc-600 dark:text-zinc-300 font-mono leading-relaxed pl-4 border-l border-zinc-200 dark:border-zinc-800">
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {messages.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-700">
                                            <div className="text-6xl mb-4 opacity-20">⚡</div>
                                            <div className="text-xs font-bold uppercase tracking-widest">Signal Silence</div>
                                            <div className="text-[10px] font-mono mt-1">Channel #{channel} is quiet</div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {!selectedDMPeer ? (
                                        <div className="h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-700">
                                            <div className="text-6xl mb-4 opacity-20">💬</div>
                                            <div className="text-xs font-bold uppercase tracking-widest">Select a conversation</div>
                                            <div className="text-[10px] font-mono mt-1">Or start a new DM from the peers page</div>
                                        </div>
                                    ) : (
                                        <>
                                            {dmMessages && dmMessages.length > 0 ? (
                                                [...dmMessages].reverse().map((msg: any, i: number) => (
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
                                                    <div className="text-xs font-bold uppercase tracking-widest">No messages yet</div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
                            <div className="flex">
                                <span className="px-4 py-4 bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono text-xs flex items-center">
                                    &gt;
                                </span>
                                {mode === 'channel' ? (
                                    <>
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder={`Broadcast to #${channel}...`}
                                            className="flex-1 bg-transparent px-4 py-4 text-sm font-mono focus:outline-none placeholder-zinc-400 text-black dark:text-white"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSend}
                                            className="px-8 border-l border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                        >
                                            Transmit
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            value={dmInput}
                                            onChange={(e) => setDmInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleDMSend()}
                                            placeholder={selectedDMPeer ? `Message ${selectedDMPeer.slice(0, 12)}...` : 'Select a peer...'}
                                            className="flex-1 bg-transparent px-4 py-4 text-sm font-mono focus:outline-none placeholder-zinc-400 text-black dark:text-white"
                                            disabled={!selectedDMPeer}
                                        />
                                        <button
                                            onClick={handleDMSend}
                                            disabled={!selectedDMPeer}
                                            className="px-8 border-l border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-30"
                                        >
                                            Send
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </PageContainer>
    );
}
