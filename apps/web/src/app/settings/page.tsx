'use client';

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { PageContainer, PageHeader } from '@/components/PageHeader';
import { useConfig, useUpdateConfig, useRestartAgent, useStatus } from '@/hooks/useAPI';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-6">
      {children}
    </h2>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.15em] font-bold text-zinc-400 mb-2">
      {children}
    </label>
  );
}

function SaveButton({ onClick, disabled, label = 'SAVE' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-bold border border-zinc-300 dark:border-zinc-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: status } = useStatus();
  const updateConfig = useUpdateConfig();
  const restartAgent = useRestartAgent();

  // Local form state
  const [walletKey, setWalletKey] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [powEnabled, setPowEnabled] = useState(false);
  const [powThreads, setPowThreads] = useState(4);
  const [peers, setPeers] = useState<string[]>([]);
  const [newPeer, setNewPeer] = useState('');
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Sync form state from fetched config
  useEffect(() => {
    if (config) {
      setTokenId(config.tokenId || '');
      setPowEnabled(config.powEnabled ?? false);
      setPowThreads(config.powThreads ?? 4);
      setPeers(config.bootstrapPeers || []);
    }
  }, [config]);

  const showSaved = (msg = 'Saved') => {
    setSaveMessage(msg);
    setRestartNeeded(true);
    setTimeout(() => setSaveMessage(''), 2000);
  };

  const handleSaveWallet = () => {
    if (!walletKey.trim()) return;
    updateConfig.mutate({ walletKey: walletKey.trim() } as any, {
      onSuccess: () => {
        setWalletKey('');
        showSaved('Wallet key saved');
      }
    });
  };

  const handleClearWallet = () => {
    updateConfig.mutate({ walletKey: null } as any, {
      onSuccess: () => showSaved('Wallet key cleared')
    });
  };

  const handleSaveMining = () => {
    updateConfig.mutate({
      tokenId: tokenId.trim() || null,
      powEnabled,
      powThreads,
    } as any, {
      onSuccess: () => showSaved('Mining settings saved')
    });
  };

  const handleAddPeer = () => {
    const p = newPeer.trim();
    if (!p || peers.includes(p)) return;
    const updated = [...peers, p];
    setPeers(updated);
    setNewPeer('');
    updateConfig.mutate({ bootstrapPeers: updated } as any, {
      onSuccess: () => showSaved('Peer added')
    });
  };

  const handleRemovePeer = (peer: string) => {
    const updated = peers.filter(p => p !== peer);
    setPeers(updated);
    updateConfig.mutate({ bootstrapPeers: updated } as any, {
      onSuccess: () => showSaved('Peer removed')
    });
  };

  const handleRestart = () => {
    restartAgent.mutate(undefined, {
      onSuccess: () => {
        setRestartNeeded(false);
        setSaveMessage('Restarting...');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    });
  };

  return (
    <PageContainer>
      <Navigation />
      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="SETTINGS"
          extension=".CFG"
          superTitle="Node Configuration"
          description={
            <span className="text-xs">
              Configure wallet, mining, and network settings. Changes are written to ~/.pathd/config.json.
            </span>
          }
        />

        {/* Restart Banner */}
        {restartNeeded && (
          <div className="mb-8 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-4 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
              Config changed — restart agent to apply
            </span>
            <button
              onClick={handleRestart}
              disabled={restartAgent.isPending}
              className="px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-bold bg-black text-white dark:bg-white dark:text-black hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {restartAgent.isPending ? 'RESTARTING...' : 'RESTART NOW'}
            </button>
          </div>
        )}

        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-6 text-xs font-mono text-green-600 dark:text-green-400 uppercase tracking-wider">
            {saveMessage}
          </div>
        )}

        {configLoading ? (
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Loading config...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Left Column ──────────────────────────────────────── */}
            <div className="space-y-8">

              {/* ── Node Status ──────────────────────────────────────── */}
              <section>
                <SectionTitle>NODE STATUS</SectionTitle>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline py-2 border-b border-zinc-100 dark:border-zinc-900">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Node ID</span>
                    <span className="font-mono text-xs">{status?.nodeId ? `${status.nodeId.slice(0, 16)}...` : '—'}</span>
                  </div>
                  <div className="flex justify-between items-baseline py-2 border-b border-zinc-100 dark:border-zinc-900">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Uptime</span>
                    <span className="font-mono text-xs">
                      {status?.uptime ? `${Math.floor(status.uptime / 60000)}m` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline py-2 border-b border-zinc-100 dark:border-zinc-900">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Peers</span>
                    <span className="font-mono text-xs">{status?.peersConnected ?? 0} connected</span>
                  </div>
                </div>
              </section>

              {/* ── Wallet ───────────────────────────────────────────── */}
              <section>
                <SectionTitle>WALLET KEY</SectionTitle>
                <div className="space-y-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Status</span>
                    <span className={`font-mono text-xs ${config?.walletKeySet ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}`}>
                      {config?.walletKeySet ? `SET (${config.walletKey})` : 'NOT SET'}
                    </span>
                  </div>

                  <div>
                    <FieldLabel>WIF Private Key</FieldLabel>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={walletKey}
                        onChange={(e) => setWalletKey(e.target.value)}
                        placeholder="Enter WIF key..."
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                      />
                      <SaveButton onClick={handleSaveWallet} disabled={!walletKey.trim()} />
                    </div>
                  </div>

                  {config?.walletKeySet && (
                    <button
                      onClick={handleClearWallet}
                      className="text-[10px] uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors"
                    >
                      [CLEAR WALLET KEY]
                    </button>
                  )}
                </div>
              </section>

              {/* ── Restart ──────────────────────────────────────────── */}
              <section>
                <SectionTitle>AGENT CONTROL</SectionTitle>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Restart the agent to apply configuration changes.</div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Config file: ~/.pathd/config.json
                    </div>
                  </div>
                  <button
                    onClick={handleRestart}
                    disabled={restartAgent.isPending}
                    className="px-6 py-3 text-[10px] uppercase tracking-[0.15em] font-bold border border-zinc-300 dark:border-zinc-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors disabled:opacity-50"
                  >
                    {restartAgent.isPending ? 'RESTARTING...' : 'RESTART AGENT'}
                  </button>
                </div>
              </section>

            </div>

            {/* ── Right Column ──────────────────────────────────────── */}
            <div className="space-y-8">

              {/* ── Mining ───────────────────────────────────────────── */}
              <section>
                <SectionTitle>MINING</SectionTitle>
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Token ID</FieldLabel>
                    <input
                      type="text"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      placeholder="Token ID for mining rewards..."
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <FieldLabel>Proof of Work</FieldLabel>
                    <button
                      onClick={() => setPowEnabled(!powEnabled)}
                      className={`px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold border transition-colors ${
                        powEnabled
                          ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                      }`}
                    >
                      {powEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div>
                    <FieldLabel>POW Threads ({powThreads})</FieldLabel>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      value={powThreads}
                      onChange={(e) => setPowThreads(Number(e.target.value))}
                      className="w-full accent-zinc-500"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                      <span>1</span>
                      <span>16</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <SaveButton onClick={handleSaveMining} label="SAVE MINING SETTINGS" />
                  </div>
                </div>
              </section>

              {/* ── Network ──────────────────────────────────────────── */}
              <section>
                <SectionTitle>BOOTSTRAP PEERS</SectionTitle>
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Add Peer</FieldLabel>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPeer}
                        onChange={(e) => setNewPeer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPeer()}
                        placeholder="host:port"
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                      />
                      <SaveButton onClick={handleAddPeer} disabled={!newPeer.trim()} label="ADD" />
                    </div>
                  </div>

                  {peers.length === 0 ? (
                    <div className="text-xs font-mono text-zinc-400 py-4 text-center border border-dashed border-zinc-200 dark:border-zinc-800">
                      No bootstrap peers configured
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {peers.map((peer) => (
                        <div key={peer} className="flex items-center justify-between py-2 px-3 border border-zinc-100 dark:border-zinc-900">
                          <span className="font-mono text-xs">{peer}</span>
                          <button
                            onClick={() => handleRemovePeer(peer)}
                            className="text-[10px] text-zinc-400 hover:text-red-500 transition-colors uppercase tracking-wider"
                          >
                            [REMOVE]
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

            </div>

          </div>
        )}
      </main>
    </PageContainer>
  );
}
