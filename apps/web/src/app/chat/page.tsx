'use client';

import { useState, useEffect, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { useChatStream, useSendMessage, ChatMessage, useStatus } from '@/hooks/useAPI';

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [channel, setChannel] = useState('global');
    const scrollRef = useRef<HTMLDivElement>(null);
    const { data: status } = useStatus();
    const sendMessage = useSendMessage();

    // Initialize stream
    useChatStream((msg) => {
        setMessages((prev) => [...prev, msg].slice(-100)); // Keep last 100
    });

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;

        sendMessage.mutate({
            channel,
            content: input,
            handle: status?.nodeId ? `@${status.nodeId.slice(0, 8)}` : 'Anonymous'
        });

        // Optimistic UI
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

    return (
        <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col">
            <Navigation />

            <main className="flex-1 w-full px-4 md:px-8 py-8 flex flex-col gap-6 overflow-hidden">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-gray-800 pb-8 shrink-0">
                    <div className="flex flex-col md:flex-row md:items-end gap-6 mb-4">
                        <div className="bg-gray-100 dark:bg-zinc-900/50 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 self-start">
                            <span className="text-4xl md:text-5xl font-bold font-mono">#</span>
                        </div>
                        <div className="flex items-end gap-4">
                            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-none">
                                GOSSIP CHAT
                            </h1>
                            <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-[0.2em]">
                                {channel} channel
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
                    {/* Channels Sidebar */}
                    <div className="w-full md:w-64 border border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-zinc-900/10 shrink-0">
                        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Channels</div>
                        <div className="space-y-2">
                            {['global', '$alice', '$bob', 'dev-chat'].map((ch) => (
                                <button
                                    key={ch}
                                    onClick={() => setChannel(ch)}
                                    className={`w-full text-left px-4 py-2 text-xs font-mono border-l-2 transition-all ${channel === ch
                                            ? 'border-white bg-white/5 text-white'
                                            : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    #{ch}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Messages Window */}
                    <div className="flex-1 flex flex-col border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900/30 min-h-0 glass">
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
                        >
                            {messages.filter(m => m.channel === channel || m.channel === 'global').map((msg, i) => (
                                <div key={i} className="flex flex-col gap-1">
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider font-mono">
                                            {msg.sender_handle || msg.sender_address.slice(0, 8)}
                                        </span>
                                        <span className="text-[9px] text-zinc-600 font-mono">
                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {messages.length === 0 && (
                                <div className="h-full flex items-center justify-center text-zinc-600 text-xs font-mono uppercase tracking-widest">
                                    No movement on the gossip wire
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-black/20">
                            <div className="flex gap-4">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder={`Message #${channel}...`}
                                    className="flex-1 bg-zinc-900/50 border border-zinc-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors font-mono"
                                />
                                <button
                                    onClick={handleSend}
                                    className="px-8 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95"
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
