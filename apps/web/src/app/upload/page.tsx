'use client';

import { Navigation } from '@/components/Navigation';
import { useState } from 'react';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';

type StorageProvider = 'aws-s3' | 'google-drive' | 'supabase' | 'cloudflare-r2' | 'azure-blob' | 'backblaze-b2';

interface StorageConnection {
  provider: StorageProvider;
  name: string;
  credentials: Record<string, string>;
}

export default function UploadPage() {
  const [selectedProvider, setSelectedProvider] = useState<StorageProvider | null>(null);
  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const providers = [
    { id: 'aws-s3', name: 'Amazon S3', icon: '🪣', fields: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'] },
    { id: 'google-drive', name: 'Google Drive', icon: '📁', fields: ['clientId', 'clientSecret', 'refreshToken'] },
    { id: 'supabase', name: 'Supabase Storage', icon: '⚡', fields: ['projectUrl', 'apiKey', 'bucket'] },
    { id: 'cloudflare-r2', name: 'Cloudflare R2', icon: '☁️', fields: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'] },
    { id: 'azure-blob', name: 'Azure Blob Storage', icon: '🔷', fields: ['accountName', 'accountKey', 'containerName'] },
    { id: 'backblaze-b2', name: 'Backblaze B2', icon: '💾', fields: ['keyId', 'applicationKey', 'bucketName'] },
  ];

  const handleConnect = () => {
    if (!selectedProvider) return;

    const provider = providers.find(p => p.id === selectedProvider);
    if (!provider) return;

    const newConnection: StorageConnection = {
      provider: selectedProvider,
      name: credentials.name || provider.name,
      credentials,
    };

    setConnections([...connections, newConnection]);
    setSelectedProvider(null);
    setCredentials({});
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      accessKeyId: 'Access Key ID',
      secretAccessKey: 'Secret Access Key',
      region: 'Region',
      bucket: 'Bucket Name',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      refreshToken: 'Refresh Token',
      projectUrl: 'Project URL',
      apiKey: 'API Key',
      accountId: 'Account ID',
      accountName: 'Account Name',
      accountKey: 'Account Key',
      containerName: 'Container Name',
      keyId: 'Key ID',
      applicationKey: 'Application Key',
      bucketName: 'Bucket Name',
    };
    return labels[field] || field;
  };

  return (
    <PageContainer>
      <Navigation />

      <main className="w-full px-4 md:px-8 py-16 max-w-[1920px] mx-auto">
        <PageHeader
          title="UPLOAD"
          extension=".SYS"
          superTitle={
            <>
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              Storage Provider Connections
            </>
          }
          description={
            <>
              <b>Connect & Tokenize.</b> Link cloud storage providers to create tradable access tokens for your files and databases.
            </>
          }
          icon="📦"
        />

        <div className="grid md:grid-cols-3 gap-6">
          {/* Column 1: Provider Selection */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              Storage Providers
            </h3>
            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Connect to cloud storage providers. Your credentials are encrypted and stored locally. Files remain in your storage - only access is tokenized.
              </p>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-4 space-y-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProvider(provider.id as StorageProvider)}
                  className={`w-full px-3 py-2 text-left border transition-colors ${selectedProvider === provider.id
                      ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                      : 'bg-white dark:bg-black text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{provider.icon}</span>
                    <span className="text-xs font-semibold">{provider.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Configuration */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              Connection Setup
            </h3>
            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Enter your provider credentials. These are used to generate temporary signed URLs for token holders. Never shared publicly.
              </p>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 space-y-4">
              {selectedProvider ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Connection Name
                    </label>
                    <input
                      type="text"
                      value={credentials.name || ''}
                      onChange={(e) => setCredentials({ ...credentials, name: e.target.value })}
                      placeholder="My Production Bucket"
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    />
                  </div>

                  {providers
                    .find(p => p.id === selectedProvider)
                    ?.fields.map((field) => (
                      <div key={field}>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          {getFieldLabel(field)}
                        </label>
                        <input
                          type={field.includes('Secret') || field.includes('Key') ? 'password' : 'text'}
                          value={credentials[field] || ''}
                          onChange={(e) => setCredentials({ ...credentials, [field]: e.target.value })}
                          placeholder={`Enter ${getFieldLabel(field).toLowerCase()}`}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors font-mono text-sm"
                        />
                      </div>
                    ))}

                  <button
                    onClick={handleConnect}
                    className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                  >
                    Connect Provider
                  </button>
                </>
              ) : (
                <div className="py-12 text-center text-zinc-500">
                  <p className="text-sm mb-2">No provider selected</p>
                  <p className="text-xs">Choose a storage provider to begin</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Active Connections */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              Active Connections
            </h3>
            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950 border-l-2 border-zinc-900 dark:border-white">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Connected storage providers. Create tokens for files in these buckets to enable on-chain access control and trading.
              </p>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-4 space-y-3">
              {connections.length > 0 ? (
                connections.map((connection, idx) => {
                  const provider = providers.find(p => p.id === connection.provider);
                  return (
                    <div
                      key={idx}
                      className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-950"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{provider?.icon}</span>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {connection.name}
                          </span>
                        </div>
                        <button
                          onClick={() => setConnections(connections.filter((_, i) => i !== idx))}
                          className="text-xs text-zinc-500 hover:text-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="text-xs text-zinc-500 font-mono">
                        {provider?.name}
                      </div>
                      <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                        <button className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors font-semibold">
                          Browse Files →
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-zinc-500">
                  <p className="text-sm mb-2">No connections yet</p>
                  <p className="text-xs">Connect a provider to get started</p>
                </div>
              )}
            </div>

            {connections.length > 0 && (
              <div className="mt-4">
                <button className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black font-semibold hover:bg-black dark:hover:bg-white transition-colors text-sm">
                  Create Tokens from Files
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {connections.length > 0 && (
          <div className="mt-12 border-t border-zinc-200 dark:border-zinc-900 pt-8">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="border border-zinc-200 dark:border-zinc-800 p-6 text-center">
                <div className="text-3xl font-bold text-black dark:text-white mb-2">
                  {connections.length}
                </div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">
                  Connected Providers
                </div>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-800 p-6 text-center">
                <div className="text-3xl font-bold text-black dark:text-white mb-2">
                  0
                </div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">
                  Tokenized Files
                </div>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-800 p-6 text-center">
                <div className="text-3xl font-bold text-black dark:text-white mb-2">
                  0 GB
                </div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">
                  Total Storage
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </PageContainer>
  );
}
