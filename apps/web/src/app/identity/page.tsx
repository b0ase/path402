'use client';

import React, { useState } from 'react';
import { FiZap, FiLock, FiDatabase, FiCopy, FiCheck } from 'react-icons/fi';
import { PageHeader } from '@/components/PageHeader';
import { PageContainer } from '@/components/PageContainer';
import { Navigation } from '@/components/Navigation';
import { useIdentity } from '@/hooks/useIdentity';
import type { CallRecord } from '@/hooks/useIdentity';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    local: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    settled: 'bg-green-500/20 text-green-400 border-green-500/30',
    disputed: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border ${colors[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-zinc-600 hover:text-zinc-400 transition-colors"
    >
      {copied ? <FiCheck className="w-3 h-3" /> : <FiCopy className="w-3 h-3" />}
    </button>
  );
}

function formatSupply(raw: string, decimals: number): string {
  const n = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  return whole.toLocaleString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

// ── Pre-Mint UI ──────────────────────────────────────────────

function PreMintView({ onMint, isMinting, mintError }: {
  onMint: (symbol: string) => void;
  isMinting: boolean;
  mintError: string | null;
}) {
  const [symbolInput, setSymbolInput] = useState('');

  const rawName = symbolInput.replace(/^\$/, '').toUpperCase();
  const preview = rawName ? `$${rawName}` : '';
  const isValid = rawName.length >= 1 && rawName.length <= 20 && /^[A-Z0-9_]+$/.test(rawName);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
      {/* Minting Console */}
      <div className="bg-zinc-900/30 border border-zinc-800 p-8 flex flex-col justify-between min-h-[400px]">
        <div>
          <h3 className="text-xl font-mono font-bold text-white uppercase tracking-tight mb-1">
            Mint Digital DNA
          </h3>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-6">
            Deploy your identity token on BSV
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-[9px] text-zinc-600 uppercase tracking-widest block mb-2">
                Symbol
              </label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-mono font-bold text-zinc-600">$</span>
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20))}
                  placeholder="YOURNAME"
                  className="flex-1 bg-black border border-zinc-800 px-4 py-3 font-mono text-xl text-white placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
                  disabled={isMinting}
                />
              </div>
              {preview && (
                <div className="mt-2 text-sm font-mono text-indigo-400">
                  {preview}
                </div>
              )}
              {symbolInput && !isValid && (
                <div className="mt-2 text-xs font-mono text-red-400">
                  A-Z, 0-9, _ only. 1-20 characters.
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black border border-zinc-800 p-3">
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Supply</div>
                <div className="text-sm text-white font-mono font-bold">1,000,000,000</div>
              </div>
              <div className="bg-black border border-zinc-800 p-3">
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Decimals</div>
                <div className="text-sm text-white font-mono font-bold">8</div>
              </div>
              <div className="bg-black border border-zinc-800 p-3">
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Rate</div>
                <div className="text-sm text-white font-mono font-bold">1 tok/sec</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {mintError && (
            <div className="mb-3 text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 p-2">
              {mintError}
            </div>
          )}
          <button
            onClick={() => onMint(preview)}
            disabled={!isValid || isMinting}
            className={`w-full py-4 font-mono font-bold uppercase text-sm tracking-widest transition-all ${
              !isValid || isMinting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            {isMinting ? 'Inscribing Genesis...' : 'Mint Digital DNA'}
          </button>
          <p className="text-center text-[9px] text-zinc-600 mt-3 font-mono uppercase tracking-widest">
            BSV21 inscription stored locally &middot; broadcast when wallet ready
          </p>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="space-y-4">
        <div className="bg-black border border-zinc-900 p-6 flex items-start gap-4">
          <FiZap className="text-yellow-500 w-5 h-5 mt-1 shrink-0" />
          <div>
            <h4 className="text-white font-mono font-bold uppercase mb-2">Video P2P Fuel</h4>
            <p className="text-zinc-500 text-xs font-mono leading-relaxed">
              Tokens stream second-by-second during video calls.
              Both peers exchange tokens — 1 token/sec each direction.
            </p>
          </div>
        </div>

        <div className="bg-black border border-zinc-900 p-6 flex items-start gap-4">
          <FiLock className="text-zinc-500 w-5 h-5 mt-1 shrink-0" />
          <div>
            <h4 className="text-white font-mono font-bold uppercase mb-2">Access Control</h4>
            <p className="text-zinc-500 text-xs font-mono leading-relaxed">
              Set minimum token balance for peers to contact you.
              Raise your price to avoid spam.
            </p>
          </div>
        </div>

        <div className="bg-black border border-zinc-900 p-6 flex items-start gap-4">
          <FiDatabase className="text-zinc-500 w-5 h-5 mt-1 shrink-0" />
          <div>
            <h4 className="text-white font-mono font-bold uppercase mb-2">Local Custody</h4>
            <p className="text-zinc-500 text-xs font-mono leading-relaxed">
              Identity token lives in local SQLite.
              Private keys never leave your <code>.pathd</code> vault.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Post-Mint UI ──────────────────────────────────────────────

function PostMintView({ identity, balance, callRecords }: {
  identity: NonNullable<ReturnType<typeof useIdentity>['identity']>;
  balance: string;
  callRecords: CallRecord[];
}) {
  const [showSettlement, setShowSettlement] = useState<string | null>(null);

  return (
    <div className="mt-8 space-y-6">
      {/* Identity Header */}
      <div className="bg-zinc-900/30 border border-zinc-800 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl font-mono font-bold text-white">{identity.symbol}</h2>
              <StatusBadge status={identity.broadcast_status} />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span>Token ID: {identity.token_id.slice(0, 16)}...{identity.token_id.slice(-8)}</span>
              <CopyButton text={identity.token_id} />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 mt-1">
              <span>Issuer: {identity.issuer_address.slice(0, 16)}...</span>
              <CopyButton text={identity.issuer_address} />
            </div>
          </div>

          <div className="text-right">
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Total Supply</div>
            <div className="text-2xl font-mono font-bold text-white">
              {formatSupply(identity.total_supply, identity.decimals)}
            </div>
            <div className="text-[10px] font-mono text-zinc-500">
              {identity.decimals} decimals &middot; {identity.access_rate} tok/sec
            </div>
          </div>
        </div>
      </div>

      {/* Balance Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-black border border-zinc-900 p-4">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Balance</div>
          <div className="text-xl font-mono font-bold text-white">
            {formatSupply(balance, identity.decimals)}
          </div>
        </div>
        <div className="bg-black border border-zinc-900 p-4">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Broadcast</div>
          <div className="text-sm font-mono text-white mt-1">
            {identity.broadcast_txid ? (
              <span className="flex items-center gap-2">
                {identity.broadcast_txid.slice(0, 16)}...
                <CopyButton text={identity.broadcast_txid} />
              </span>
            ) : (
              <span className="text-zinc-600">Not broadcast yet</span>
            )}
          </div>
        </div>
        <div className="bg-black border border-zinc-900 p-4">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Created</div>
          <div className="text-sm font-mono text-white mt-1">
            {formatTime(identity.created_at)}
          </div>
        </div>
      </div>

      {/* Inscription Data */}
      {identity.inscription_data && (
        <div className="bg-black border border-zinc-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">BSV21 Inscription</div>
            <CopyButton text={identity.inscription_data} />
          </div>
          <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {JSON.stringify(JSON.parse(identity.inscription_data), null, 2)}
          </pre>
        </div>
      )}

      {/* Call History */}
      <div className="bg-zinc-900/30 border border-zinc-800 p-6">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-widest mb-4">
          Call History
        </h3>

        {callRecords.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-600 font-mono text-sm">No call records yet</p>
            <p className="text-zinc-700 font-mono text-xs mt-1">Records will appear when you make video calls</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-600 uppercase tracking-widest border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">Peer</th>
                  <th className="text-left py-2 pr-4">Duration</th>
                  <th className="text-right py-2 pr-4">Sent</th>
                  <th className="text-right py-2 pr-4">Received</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-center py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {callRecords.map((record) => (
                  <tr key={record.call_id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                    <td className="py-2 pr-4 text-zinc-400">
                      {record.callee_peer_id.slice(0, 12)}...
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">
                      {record.duration_seconds ? formatDuration(record.duration_seconds) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-400">
                      {record.caller_tokens_sent !== '0' ? record.caller_tokens_sent : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-400">
                      {record.callee_tokens_sent !== '0' ? record.callee_tokens_sent : '—'}
                    </td>
                    <td className="py-2 text-center">
                      <StatusBadge status={record.settlement_status} />
                    </td>
                    <td className="py-2 text-center">
                      {record.settlement_data ? (
                        <button
                          onClick={() => setShowSettlement(
                            showSettlement === record.call_id ? null : record.call_id
                          )}
                          className="text-indigo-400 hover:text-indigo-300 text-[9px] uppercase tracking-widest"
                        >
                          {showSettlement === record.call_id ? 'Hide' : 'View'}
                        </button>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Settlement Data Panel */}
            {showSettlement && (() => {
              const record = callRecords.find(r => r.call_id === showSettlement);
              if (!record?.settlement_data) return null;
              return (
                <div className="mt-4 bg-black border border-zinc-900 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[9px] text-zinc-600 uppercase tracking-widest">
                      Settlement Data — {showSettlement.slice(0, 16)}...
                    </div>
                    <CopyButton text={record.settlement_data} />
                  </div>
                  <pre className="text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(JSON.parse(record.settlement_data), null, 2)}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function IdentityPage() {
  const { identity, balance, callRecords, isMinting, mintError, mint } = useIdentity();

  const handleMint = async (symbol: string) => {
    try {
      await mint(symbol);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <PageContainer>
      <Navigation />
      <PageHeader
        title="DIGITAL DNA"
        extension=".ID"
        superTitle={<>Identity Token // Self-Sovereign Issuance</>}
        description="1B SUPPLY // 8 DECIMALS // 1 TOK/SEC // BSV21"
        customRightElement={
          identity ? (
            <div className="flex items-center gap-3">
              <StatusBadge status={identity.broadcast_status} />
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Identity</div>
                <div className="text-xl font-mono font-bold text-white leading-none">
                  {identity.symbol}
                </div>
              </div>
            </div>
          ) : undefined
        }
      />

      {identity ? (
        <PostMintView identity={identity} balance={balance} callRecords={callRecords} />
      ) : (
        <PreMintView onMint={handleMint} isMinting={isMinting} mintError={mintError} />
      )}
    </PageContainer>
  );
}
