/**
 * $402 Autonomous Agent — Implementation moved to private repo for security.
 * Type definitions and stub class remain for compilation.
 */

import { EventEmitter } from 'events';

const MOVED = 'Path402Agent implementation moved to private repo (Claw-Miner-App)';

export interface AgentConfig {
  dataDir?: string;
  gossipPort?: number;
  bootstrapPeers?: string[];
  maxPeers?: number;
  aiProvider?: 'claude' | 'openai' | 'ollama' | 'routing';
  aiApiKey?: string;
  aiModel?: string;
  localModel?: string;
  midModel?: string;
  frontierModel?: string;
  speculationEnabled?: boolean;
  autoAcquire?: boolean;
  speculationBudget?: number;
  speculationStrategy?: string;
  tokenId?: string;
  walletKey?: string;
  guiEnabled?: boolean;
  guiPort?: number;
  guiUiPath?: string;
  marketplaceUrl?: string;
  bhsUrl?: string;
  bhsApiKey?: string;
}

export interface AgentStatus {
  nodeId: string;
  uptime: number;
  peers: { connected: number; known: number };
  tokens: { known: number; held: number };
  portfolio: { totalValue: number; totalSpent: number; totalRevenue: number; pnl: number };
  speculation: { enabled: boolean; autoAcquire: boolean; budget: number; strategy: string; positions: number; exposure: number };
  content: { items: number; totalBytes: number };
  mining: { enabled: boolean; broadcasterConnected: boolean; tokenId?: string; minerAddress?: string };
  relay: { peer_count: number; cache_size: number; db_size: number; uptime_ms: number };
}

export class Path402Agent extends EventEmitter {
  constructor(_config?: AgentConfig) {
    super();
    throw new Error(MOVED);
  }
}

export async function runAgent(_config?: AgentConfig): Promise<Path402Agent> {
  throw new Error(MOVED);
}
