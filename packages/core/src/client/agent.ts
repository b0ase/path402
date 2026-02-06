/**
 * $402 Autonomous Agent
 *
 * The main client that ties everything together:
 * - Local SQLite database
 * - Gossip network participation
 * - AI-powered speculation
 * - Content serving
 *
 * This is a fully decentralized node - no central server dependency.
 */

import { EventEmitter } from 'events';
import { join } from 'path';
import { GossipNode, GossipNodeConfig } from '../gossip/node.js';
import { SpeculationEngine, SpeculationStrategy, STRATEGIES } from '../speculation/engine.js';
import { IntelligenceProvider } from '../intelligence/provider.js';
import { ClaudeIntelligenceProvider } from '../intelligence/claude.js';
import { GUIServer } from '../gui/server.js';
import {
  initLocalDb,
  closeDb,
  getNodeId,
  getConfig,
  setConfig,
  getAllTokens,
  getPortfolio,
  getPortfolioSummary,
  getActivePeers
} from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  // Database
  dataDir?: string;

  // Gossip
  gossipPort?: number;
  bootstrapPeers?: string[];
  maxPeers?: number;

  // Intelligence
  aiProvider?: 'claude' | 'openai' | 'ollama';
  aiApiKey?: string;
  aiModel?: string;

  // Speculation
  speculationEnabled?: boolean;
  autoAcquire?: boolean;
  speculationBudget?: number;
  speculationStrategy?: SpeculationStrategy | string;

  // GUI
  guiEnabled?: boolean;
  guiPort?: number;
  guiUiPath?: string;
}

export interface AgentStatus {
  nodeId: string;
  uptime: number;
  peers: {
    connected: number;
    known: number;
  };
  tokens: {
    known: number;
    held: number;
  };
  portfolio: {
    totalValue: number;
    totalSpent: number;
    totalRevenue: number;
    pnl: number;
  };
  speculation: {
    enabled: boolean;
    autoAcquire: boolean;
    budget: number;
    strategy: string;
    positions: number;
    exposure: number;
  };
}

// ── Autonomous Agent ───────────────────────────────────────────────

import { ProofOfIndexingService } from '../services/mining.js';

export class Path402Agent extends EventEmitter {
  private startTime: number = 0;
  private gossipNode: GossipNode | null = null;
  private speculationEngine: SpeculationEngine | null = null;
  private intelligenceProvider: IntelligenceProvider | null = null;
  private guiServer: GUIServer | null = null;
  private miningService: ProofOfIndexingService | null = null;
  private config: AgentConfig;
  private running = false;

  constructor(config: AgentConfig = {}) {
    super();
    this.config = config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Agent already running');
    }

    console.log('[Agent] Starting $402 autonomous agent...');
    this.startTime = Date.now();

    // Initialize database
    const dbPath = this.config.dataDir
      ? join(this.config.dataDir, 'pathd.db')
      : undefined;
    initLocalDb(dbPath, (this.config as any).schemaPath);

    const nodeId = getNodeId();
    console.log(`[Agent] Node ID: ${nodeId.slice(0, 16)}...`);

    // Initialize intelligence provider
    this.initIntelligence();

    // Initialize gossip node
    await this.initGossip();

    // Initialize Mining Service
    const minerAddr = process.env.MINER_ADDRESS || process.env.TREASURY_ADDRESS || '1minerAddressPLACEHOLDER';
    const minerKey = process.env.MINER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY;

    this.miningService = new ProofOfIndexingService(minerAddr, minerKey, this.gossipNode!);
    console.log(`[Agent] Mining Service initialized for ${minerAddr}`);

    // Initialize speculation engine
    this.initSpeculation();

    // Setup event handlers
    this.setupEventHandlers();

    // Start GUI if enabled
    if (this.config.guiEnabled !== false) {
      this.guiServer = new GUIServer(this, this.config.guiPort || 4021, this.config.guiUiPath);
      this.guiServer.start();
    }

    this.running = true;
    console.log('[Agent] Agent started successfully');

    this.emit('ready', this.getStatus());
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    console.log('[Agent] Stopping agent...');

    if (this.guiServer) {
      this.guiServer.stop();
      this.guiServer = null;
    }

    if (this.gossipNode) {
      this.gossipNode.stop();
      this.gossipNode = null;
    }

    closeDb();
    this.running = false;

    console.log('[Agent] Agent stopped');
    this.emit('stopped');
  }

  // ── Initialization ─────────────────────────────────────────────

  private initIntelligence(): void {
    const provider = this.config.aiProvider || 'claude';

    switch (provider) {
      case 'claude':
        this.intelligenceProvider = new ClaudeIntelligenceProvider(
          this.config.aiApiKey,
          this.config.aiModel
        );
        break;

      // TODO: Add OpenAI and Ollama providers
      case 'openai':
        throw new Error('OpenAI provider not yet implemented');

      case 'ollama':
        throw new Error('Ollama provider not yet implemented');

      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }

    console.log(`[Agent] Intelligence: ${this.intelligenceProvider.name} (${this.intelligenceProvider.model})`);
  }

  private async initGossip(): Promise<void> {
    const gossipConfig: GossipNodeConfig = {
      port: this.config.gossipPort,
      bootstrapPeers: this.config.bootstrapPeers,
      maxPeers: this.config.maxPeers
    };

    this.gossipNode = new GossipNode(gossipConfig);
    await this.gossipNode.start();

    console.log(`[Agent] Gossip: listening on port ${this.config.gossipPort || 4020}`);
  }

  private initSpeculation(): void {
    if (!this.intelligenceProvider) {
      throw new Error('Intelligence provider not initialized');
    }

    const strategy = typeof this.config.speculationStrategy === 'string'
      ? STRATEGIES[this.config.speculationStrategy] || STRATEGIES.early_adopter
      : this.config.speculationStrategy || STRATEGIES.early_adopter;

    this.speculationEngine = new SpeculationEngine({
      provider: this.intelligenceProvider,
      enabled: this.config.speculationEnabled ?? false,
      autoAcquire: this.config.autoAcquire ?? false,
      budgetSats: this.config.speculationBudget ?? 100000,
      strategy
    });

    console.log(`[Agent] Speculation: ${this.config.speculationEnabled ? 'enabled' : 'disabled'} (${strategy.name})`);
  }

  // ── Event Handlers ─────────────────────────────────────────────

  private setupEventHandlers(): void {
    if (this.gossipNode) {
      // When we discover a new token via gossip, queue for evaluation
      this.gossipNode.on('token:discovered', (tokenId, token) => {
        console.log(`[Agent] Token discovered: ${tokenId}`);
        this.emit('token:discovered', tokenId, token);

        // Queue for speculation evaluation
        if (this.speculationEngine) {
          this.speculationEngine.queueEvaluation(tokenId);
        }
      });

      this.gossipNode.on('transfer:received', (transfer) => {
        this.emit('transfer:received', transfer);
      });

      this.gossipNode.on('peer:count', (count) => {
        this.emit('peers:updated', count);
      });
    }

    if (this.speculationEngine) {
      this.speculationEngine.on('opportunity', (token, evaluation) => {
        console.log(`[Agent] Opportunity: ${token.token_id} (score: ${evaluation.score})`);
        this.emit('opportunity', token, evaluation);
      });

      this.speculationEngine.on('acquire', (tokenId, price, reason) => {
        console.log(`[Agent] Acquired: ${tokenId} at ${price} SAT`);
        this.emit('acquired', tokenId, price, reason);
      });

      this.speculationEngine.on('skip', (tokenId, reason) => {
        this.emit('skipped', tokenId, reason);
      });

      this.speculationEngine.on('error', (error) => {
        console.error('[Agent] Speculation error:', error);
        this.emit('error', error);
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    const summary = getPortfolioSummary();
    const tokens = getAllTokens();
    const portfolio = getPortfolio();
    const peers = getActivePeers();

    return {
      nodeId: getNodeId(),
      uptime: Date.now() - this.startTime,
      peers: {
        connected: this.gossipNode?.getPeerCount() || 0,
        known: peers.length
      },
      tokens: {
        known: tokens.length,
        held: portfolio.length
      },
      portfolio: {
        totalValue: summary.totalValue,
        totalSpent: summary.totalSpent,
        totalRevenue: summary.totalRevenue,
        pnl: summary.totalPnL
      },
      speculation: this.speculationEngine?.getStatus() || {
        enabled: false,
        autoAcquire: false,
        budget: 0,
        strategy: 'none',
        positions: 0,
        exposure: 0
      }
    };
  }

  /**
   * Connect to a specific peer
   */
  async connectToPeer(hostOrAddr: string, port = 4020): Promise<void> {
    if (!this.gossipNode) {
      throw new Error('Gossip not initialized');
    }

    // If it's a multiaddr, use it directly, otherwise format it
    const addr = hostOrAddr.startsWith('/')
      ? hostOrAddr
      : `/ip4/${hostOrAddr}/tcp/${port}`;

    await this.gossipNode.connectToPeer(addr);
  }

  /**
   * Announce a token we hold
   */
  announceToken(tokenId: string): void {
    if (!this.gossipNode) {
      throw new Error('Gossip not initialized');
    }
    this.gossipNode.announceToken(tokenId);
  }

  /**
   * Request data for a token
   */
  requestToken(tokenId: string): void {
    if (!this.gossipNode) {
      throw new Error('Gossip not initialized');
    }
    this.gossipNode.requestToken(tokenId);
  }

  /**
   * Evaluate a token for acquisition
   */
  async evaluateToken(tokenId: string) {
    if (!this.speculationEngine) {
      throw new Error('Speculation not initialized');
    }
    return this.speculationEngine.evaluateToken(tokenId);
  }

  /**
   * Scan for speculation opportunities
   */
  async scanOpportunities() {
    if (!this.speculationEngine) {
      throw new Error('Speculation not initialized');
    }
    return this.speculationEngine.evaluateOpportunities();
  }

  /**
   * Enable/disable speculation
   */
  setSpeculation(enabled: boolean): void {
    this.speculationEngine?.setEnabled(enabled);
  }

  /**
   * Enable/disable auto-acquisition
   */
  setAutoAcquire(enabled: boolean): void {
    this.speculationEngine?.setAutoAcquire(enabled);
  }

  /**
   * Set speculation budget
   */
  setBudget(sats: number): void {
    this.speculationEngine?.setBudget(sats);
  }

  /**
   * Set speculation strategy
   */
  setStrategy(strategy: string): void {
    this.speculationEngine?.setStrategy(strategy);
  }

  /**
   * Get available strategies
   */
  getStrategies(): string[] {
    return Object.keys(STRATEGIES);
  }

  /**
   * Check if agent is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ── CLI Entry Point ────────────────────────────────────────────────

export async function runAgent(config: AgentConfig = {}): Promise<Path402Agent> {
  const agent = new Path402Agent(config);

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\n[Agent] Shutting down...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();

  // Print status periodically
  setInterval(() => {
    if (agent.isRunning()) {
      const status = agent.getStatus();
      console.log(`[Agent] Peers: ${status.peers.connected} | Tokens: ${status.tokens.known} | Portfolio: ${status.portfolio.pnl} SAT`);
    }
  }, 60000);

  return agent;
}
