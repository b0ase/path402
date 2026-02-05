'use client';

import { Navigation } from '@/components/Navigation';
import { useState } from 'react';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

type MintType = 'domain' | 'email' | 'paymail' | 'content';
type TimeUnit = 'seconds' | 'minutes' | 'hours';
type AccessMode = 'burn' | 'continuous' | 'returnable';

interface MintFormData {
    type: MintType;
    identifier: string;
    paymentAddress: string;
    dividendRate: number;
    supply: string;
    accessRate: number;
    timeUnit: TimeUnit;
    accessMode: AccessMode;
    description?: string;
}

export default function MintPage() {
    const [formData, setFormData] = useState<MintFormData>({
        type: 'domain',
        identifier: '',
        paymentAddress: '',
        dividendRate: 100,
        supply: '1000000000',
        accessRate: 1,
        timeUnit: 'seconds',
        accessMode: 'burn',
    });

    const [step, setStep] = useState<'form' | 'confirm' | 'minting' | 'success'>('form');
    const [txid, setTxid] = useState<string>('');

    const handleMint = async () => {
        setStep('minting');

        try {
            const response = await fetch('/api/mint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const result = await response.json();
            setTxid(result.txid);
            setStep('success');
        } catch (error) {
            console.error('Mint failed:', error);
            setStep('form');
        }
    };

    const getTokenSymbol = () => {
        if (!formData.identifier) return 'TOKEN';
        return formData.identifier.replace(/[@\.]/g, '_').split('/')[0].toUpperCase().slice(0, 10);
    };

    const getPlaceholder = () => {
        switch (formData.type) {
            case 'domain': return 'alice.com';
            case 'email': return 'alice@example.com';
            case 'paymail': return 'alice@handcash.io';
            case 'content': return 'https://alice.com/video.mp4';
        }
    };

    const getLabel = () => {
        switch (formData.type) {
            case 'domain': return 'Domain Name';
            case 'email': return 'Email Address';
            case 'paymail': return 'Paymail Handle';
            case 'content': return 'Content URL';
        }
    };

    return (
        <PageContainer>
            <Navigation />

            <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
                {/* Header */}
                <header className="mb-6 border-b border-zinc-200 dark:border-zinc-900 pb-8">
                    <div className="flex items-center gap-3 mb-4 text-zinc-500 text-xs tracking-widest uppercase">
                        <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                        Token Creation Protocol
                    </div>

                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-2">
                        MINT<span className="text-zinc-300 dark:text-zinc-800">.SYS</span>
                    </h1>

                    <div className="text-zinc-500 max-w-lg">
                        <b>Deploy BSV-21 Tokens.</b> Create tradable access tokens for domains, identities, and content.
                    </div>
                </header>

                {step === 'form' && (
                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Column 1: Asset Details */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                                Asset Details
                            </h3>
                            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
                                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                                    Define what you're tokenizing. This creates a tradable BSV-21 token that represents access rights to your asset. Token holders can access your content by burning tokens at the specified rate.
                                </p>
                            </div>
                            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 space-y-4">
                                <div>
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: 'domain', identifier: '' })}
                                            className={`px-2 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${formData.type === 'domain'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            Domain
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: 'email', identifier: '' })}
                                            className={`px-2 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${formData.type === 'email'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            Email
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: 'paymail', identifier: '' })}
                                            className={`px-2 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${formData.type === 'paymail'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            Paymail
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: 'content', identifier: '' })}
                                            className={`px-2 py-1.5 text-xs font-bold uppercase tracking-wider border transition-colors ${formData.type === 'content'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            Content
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.identifier}
                                        onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                                        placeholder={getPlaceholder()}
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                                    />
                                    <p className="text-xs text-zinc-500 mt-1">
                                        The {formData.type} you want to tokenize
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Token Symbol
                                    </label>
                                    <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono">
                                        ${getTokenSymbol()}
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Auto-generated from identifier
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Total Supply
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.supply}
                                        onChange={(e) => setFormData({ ...formData, supply: e.target.value })}
                                        placeholder="100"
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors font-mono"
                                    />
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Total tokens to create (immutable)
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={formData.description || ''}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="What does this token provide access to?"
                                        rows={4}
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Payment & Economics */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                                Payment & Economics
                            </h3>
                            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
                                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                                    Your payment address is permanently inscribed in the token. All token sales route payments here, and dividends are auto-distributed to stakers based on the rate you set. This creates a trustless revenue stream.
                                </p>
                            </div>
                            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Payment Address
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.paymentAddress}
                                        onChange={(e) => setFormData({ ...formData, paymentAddress: e.target.value })}
                                        placeholder="alice@handcash.io or 1AliceXYZ..."
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors font-mono text-sm"
                                    />
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Canonical address inscribed in token
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Dividend Rate
                                    </label>
                                    <div className="border border-zinc-200 dark:border-zinc-800 p-4 mb-2">
                                        <div className="flex items-baseline gap-2 mb-3">
                                            <span className="text-3xl font-bold text-black dark:text-white font-mono">
                                                {formData.dividendRate}%
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                                to stakers
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={formData.dividendRate}
                                            onChange={(e) => setFormData({ ...formData, dividendRate: parseInt(e.target.value) })}
                                            className="w-full h-1 bg-zinc-200 dark:bg-zinc-700 appearance-none cursor-pointer"
                                        />
                                        <div className="flex justify-between text-xs text-zinc-500 mt-2">
                                            <span>0%</span>
                                            <span>100%</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-zinc-500">
                                        Percentage auto-distributed to stakers on all payments
                                    </p>
                                </div>

                                <div className="border-l-2 border-black dark:border-white pl-3 py-2 bg-zinc-50 dark:bg-zinc-950">
                                    <p className="text-xs font-medium text-zinc-900 dark:text-white mb-1">
                                        How dividends work
                                    </p>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {formData.dividendRate === 100
                                            ? 'All payments to this address are automatically distributed to stakers proportionally.'
                                            : `${formData.dividendRate}% of all payments are distributed to stakers. ${100 - formData.dividendRate}% goes to the payment address.`
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Column 3: Access Settings */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                                Access Settings
                            </h3>
                            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
                                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                                    Control how fast tokens are consumed during access. Higher rates mean shorter access times but higher per-second value. This is how you monetize attention and bandwidth.
                                </p>
                            </div>
                            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                        Access Mode
                                    </label>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, accessMode: 'burn' })}
                                            className={`px-3 py-2 text-left border transition-colors ${formData.accessMode === 'burn'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            <div className="text-xs font-semibold mb-1">Burn on Use</div>
                                            <div className="text-xs opacity-70">Tokens are consumed and destroyed</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, accessMode: 'continuous' })}
                                            className={`px-3 py-2 text-left border transition-colors ${formData.accessMode === 'continuous'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            <div className="text-xs font-semibold mb-1">Continuous Auth</div>
                                            <div className="text-xs opacity-70">Verify ownership, don't burn tokens</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, accessMode: 'returnable' })}
                                            className={`px-3 py-2 text-left border transition-colors ${formData.accessMode === 'returnable'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-white dark:bg-black text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                                                }`}
                                        >
                                            <div className="text-xs font-semibold mb-1">Returnable</div>
                                            <div className="text-xs opacity-70">Unused tokens return to issuer on sign out</div>
                                        </button>
                                    </div>
                                </div>

                                {formData.accessMode === 'burn' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                                Burn Rate
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={formData.accessRate}
                                                    onChange={(e) => setFormData({ ...formData, accessRate: parseInt(e.target.value) || 1 })}
                                                    min="1"
                                                    max="1000000"
                                                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors font-mono"
                                                />
                                                <select
                                                    value={formData.timeUnit}
                                                    onChange={(e) => setFormData({ ...formData, timeUnit: e.target.value as TimeUnit })}
                                                    className="px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors font-mono text-xs"
                                                >
                                                    <option value="seconds">per second</option>
                                                    <option value="minutes">per minute</option>
                                                    <option value="hours">per hour</option>
                                                </select>
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                Tokens consumed per time unit
                                            </p>
                                        </div>

                                        <div className="border-l-2 border-black dark:border-white pl-3 py-2 bg-zinc-50 dark:bg-zinc-950">
                                            <p className="text-xs font-medium text-zinc-900 dark:text-white mb-1">
                                                Total access time
                                            </p>
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                                {(() => {
                                                    const totalTokens = parseInt(formData.supply);
                                                    const rate = formData.accessRate;
                                                    const baseUnits = Math.floor(totalTokens / rate);

                                                    if (formData.timeUnit === 'hours') {
                                                        return `${baseUnits.toLocaleString()} hours total`;
                                                    } else if (formData.timeUnit === 'minutes') {
                                                        const hours = Math.floor(baseUnits / 60);
                                                        const mins = baseUnits % 60;
                                                        return `${hours.toLocaleString()}h ${mins}m total`;
                                                    } else {
                                                        const hours = Math.floor(baseUnits / 3600);
                                                        const mins = Math.floor((baseUnits % 3600) / 60);
                                                        const secs = baseUnits % 60;
                                                        return `${hours.toLocaleString()}h ${mins}m ${secs}s total`;
                                                    }
                                                })()}
                                            </p>
                                        </div>
                                    </>
                                )}

                                {formData.accessMode === 'continuous' && (
                                    <div className="border-l-2 border-black dark:border-white pl-3 py-2 bg-zinc-50 dark:bg-zinc-950">
                                        <p className="text-xs font-medium text-zinc-900 dark:text-white mb-1">
                                            Continuous authentication
                                        </p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            Users must prove token ownership to access content. Tokens are never burned. Good for recurring subscriptions.
                                        </p>
                                    </div>
                                )}

                                {formData.accessMode === 'returnable' && (
                                    <div className="border-l-2 border-black dark:border-white pl-3 py-2 bg-zinc-50 dark:bg-zinc-950">
                                        <p className="text-xs font-medium text-zinc-900 dark:text-white mb-1">
                                            Returnable tokens
                                        </p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            Tokens are escrowed during access. When user signs out, unused tokens are returned to the issuer address. Perfect for pay-per-use models.
                                        </p>
                                    </div>
                                )}

                                <div className="pt-6 space-y-3">
                                    <button
                                        onClick={() => setStep('confirm')}
                                        disabled={!formData.identifier || !formData.paymentAddress}
                                        className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-500"
                                    >
                                        Review & Mint Token
                                    </button>

                                    <p className="text-xs text-center text-zinc-500">
                                        {formData.identifier && formData.paymentAddress
                                            ? 'Ready to mint'
                                            : 'Complete required fields to continue'
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'confirm' && (
                    <div className="max-w-3xl mx-auto">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                            Confirm Transaction
                        </h3>
                        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-8">
                            <div className="space-y-3 mb-8">
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Type</span>
                                    <span className="font-semibold capitalize">{formData.type}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Asset</span>
                                    <span className="font-mono font-semibold">{formData.identifier}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Symbol</span>
                                    <span className="font-mono font-semibold">${getTokenSymbol()}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Supply</span>
                                    <span className="font-mono font-semibold">{formData.supply}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Payment Address</span>
                                    <span className="font-mono text-sm font-semibold truncate ml-4">{formData.paymentAddress}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-zinc-800">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Dividend Rate</span>
                                    <span className="font-mono font-semibold">{formData.dividendRate}%</span>
                                </div>
                                <div className="flex justify-between py-2">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Access Rate</span>
                                    <span className="font-mono font-semibold">{formData.accessRate} tokens/sec</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setStep('form')}
                                    className="py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleMint}
                                    className="py-3 bg-black dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                >
                                    Confirm & Mint
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'minting' && (
                    <div className="max-w-md mx-auto border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-12 text-center">
                        <div className="inline-block w-12 h-12 border-2 border-zinc-200 dark:border-zinc-800 border-t-black dark:border-t-white rounded-full animate-spin mb-6" />
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Minting Token</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 font-mono">
                            Broadcasting to BSV network...
                        </p>
                    </div>
                )}

                {step === 'success' && (
                    <div className="max-w-3xl mx-auto">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                            Transaction Complete
                        </h3>
                        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-12 text-center">
                            <div className="w-16 h-16 border-2 border-black dark:border-white flex items-center justify-center mx-auto mb-6">
                                <span className="text-3xl">✓</span>
                            </div>
                            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                                Token Minted Successfully
                            </h3>
                            <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                                ${getTokenSymbol()} is now live on BSV
                            </p>

                            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 mb-8">
                                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Transaction ID</p>
                                <code className="text-sm font-mono text-zinc-900 dark:text-white break-all">{txid}</code>
                            </div>

                            <button
                                onClick={() => window.location.href = '/portfolio'}
                                className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                            >
                                View in Portfolio
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </PageContainer>
    );
}
