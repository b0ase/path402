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
import { createRequire } from 'module';
import { GossipNode, GossipNodeConfig } from '../gossip/node.js';
import type { CallSignalMessage, DMSignalMessage, DMMessagePayload, RoomVoiceSignalMessage } from '../gossip/protocol.js';
import { DMSignalType as DMSignalTypeEnum } from '../gossip/protocol.js';
import { randomBytes } from 'crypto';
import { SpeculationEngine, SpeculationStrategy, STRATEGIES } from '../speculation/engine.js';
import { IntelligenceProvider } from '../intelligence/provider.js';
import { ClaudeIntelligenceProvider } from '../intelligence/claude.js';
import { OllamaIntelligenceProvider } from '../intelligence/ollama.js';
import { RoutingIntelligenceProvider } from '../intelligence/routing.js';
import { GUIServer } from '../gui/server.js';
import { MarketplaceBridge } from '../services/marketplace-bridge.js';
import { FsContentStore } from '../content/fs-store.js';
import { loadDemoContent } from '../content/demo-loader.js';
import type { ContentStore } from '../content/store.js';
import {
  initLocalDb,
  closeDb,
  getNodeId,
  getConfig,
  setConfig,
  getAllTokens,
  getPortfolio,
  getPortfolioSummary,
  getActivePeers,
  getContentCacheStats,
  createIdentityToken,
  getIdentityToken,
  getIdentityTokenBySymbol,
  createCallRecord,
  updateCallRecord,
  getCallRecords,
  getCallRecord,
  saveChatMessage,
  getChannelMessages,
  getDMMessages,
  getRoomMessages,
  getDMConversations,
  createChatRoom,
  getChatRoom,
  getAllChatRooms,
  addRoomMember,
  removeRoomMember,
  getRoomMembers,
  getHolding,
} from '../db/index.js';
import type { IdentityToken, CallRecord, ChatMessage, ChatRoom, RoomMember } from '../db/index.js';
import { validateSymbol, prepareMint, generateTokenId } from '../token/mint.js';

// ── Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  // Database
  dataDir?: string;

  // Gossip
  gossipPort?: number;
  bootstrapPeers?: string[];
  maxPeers?: number;

  // Intelligence
  aiProvider?: 'claude' | 'openai' | 'ollama' | 'routing';
  aiApiKey?: string;
  aiModel?: string;
  localModel?: string;
  midModel?: string;
  frontierModel?: string;

  // Speculation
  speculationEnabled?: boolean;
  autoAcquire?: boolean;
  speculationBudget?: number;
  speculationStrategy?: SpeculationStrategy | string;

  // Mining / HTM
  tokenId?: string;
  walletKey?: string;

  // GUI
  guiEnabled?: boolean;
  guiPort?: number;
  guiUiPath?: string;

  // Marketplace
  marketplaceUrl?: string;

  // Block Header Sync (BHS)
  bhsUrl?: string;
  bhsApiKey?: string;
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
  content: {
    items: number;
    totalBytes: number;
  };
  mining: {
    enabled: boolean;
    broadcasterConnected: boolean;
    tokenId?: string;
    minerAddress?: string;
  };
  relay: {
    peer_count: number;
    cache_size: number;
    db_size: number;
    uptime_ms: number;
  };
}

// ── Autonomous Agent ───────────────────────────────────────────────

import { ProofOfIndexingService } from '../services/mining.js';
import { RelayService } from '../services/relay.js';
import { HeaderSyncService } from '../services/headers.js';
import { WalletBalanceService } from '../services/wallet-balance.js';
import type { MintBroadcaster } from '../mining/broadcaster.js';

export class Path402Agent extends EventEmitter {
  private startTime: number = 0;
  private gossipNode: GossipNode | null = null;
  private speculationEngine: SpeculationEngine | null = null;
  private intelligenceProvider: IntelligenceProvider | null = null;
  private guiServer: GUIServer | null = null;
  private miningService: ProofOfIndexingService | null = null;
  private relayService: RelayService | null = null;
  private headerSyncService: HeaderSyncService | null = null;
  private walletBalanceService: WalletBalanceService | null = null;
  private marketplaceBridge: MarketplaceBridge | null = null;
  private contentStore: FsContentStore | null = null;
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

    // Initialize intelligence provider (optional — only needed for speculation)
    const hasAiKey = !!(this.config.aiApiKey || process.env.ANTHROPIC_API_KEY);
    if (hasAiKey) {
      this.initIntelligence();
    } else {
      console.log('[Agent] No AI API key — speculation disabled, mining-only mode');
    }

    // Initialize gossip node
    await this.initGossip();

    // Initialize Mining Service
    const walletKey = this.config.walletKey || process.env.PATHD_WALLET_KEY || process.env.MINER_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY;
    const tokenId = this.config.tokenId || process.env.HTM_TOKEN_ID;

    // Derive miner address from wallet key, or fall back to env/placeholder
    let minerAddr = process.env.MINER_ADDRESS || process.env.TREASURY_ADDRESS || '';
    let broadcaster: MintBroadcaster | undefined;

    // Try to create HTM broadcaster via dynamic require (isolates scrypt-ts CJS deps)
    if (tokenId && walletKey) {
      try {
        // Build a working require() for both ESM and esbuild CJS contexts
        let _require: NodeRequire;
        try {
          _require = createRequire(import.meta.url);
        } catch {
          // esbuild CJS: import.meta.url is undefined, use __filename or cwd
          const base = typeof __filename !== 'undefined'
            ? `file://${__filename}`
            : `file://${process.cwd()}/node_modules`;
          _require = createRequire(base);
        }
        const htm: any = _require('@b0ase/path402-htm');
        const htmBroadcaster = new htm.HtmBroadcaster(tokenId, walletKey);
        broadcaster = htmBroadcaster;
        if (!minerAddr) minerAddr = htmBroadcaster.getMinerAddress();
        console.log(`[Agent] HTM broadcaster ready (token: ${tokenId.slice(0, 12)}..., miner: ${minerAddr})`);
      } catch (err) {
        console.warn('[Agent] @b0ase/path402-htm not available — mint broadcasting disabled:', (err as Error).message);
      }
    } else if (tokenId && !walletKey) {
      console.warn('[Agent] HTM_TOKEN_ID set but no wallet key — mint broadcasting disabled');
    }

    if (!minerAddr) minerAddr = '1minerAddressPLACEHOLDER';

    // Initialize Relay Service (SPV Relay Mesh)
    this.relayService = new RelayService();
    this.relayService.attachToGossip(this.gossipNode!);
    this.relayService.start();
    console.log('[Agent] Relay Service initialized (SPV Relay Mesh)');

    this.miningService = new ProofOfIndexingService({
      minerAddress: minerAddr,
      gossipNode: this.gossipNode!,
      broadcaster,
      relayService: this.relayService,
    });
    console.log(`[Agent] Mining Service initialized for ${minerAddr}${broadcaster ? ' (HTM broadcasting enabled)' : ''}`);

    // Initialize Block Header Sync (SPV validation)
    const bhsUrl = this.config.bhsUrl || process.env.CLAWMINER_BHS_URL || '';
    if (bhsUrl) {
      this.headerSyncService = new HeaderSyncService({
        bhsUrl,
        bhsApiKey: this.config.bhsApiKey || process.env.CLAWMINER_BHS_API_KEY,
      });
      await this.headerSyncService.start();
      console.log('[Agent] Header Sync Service started');
    }

    // Initialize wallet balance polling
    if (minerAddr && !minerAddr.includes('PLACEHOLDER')) {
      this.walletBalanceService = new WalletBalanceService({ address: minerAddr });
      this.walletBalanceService.on('low_balance', (data) => {
        this.emit('wallet:low_balance', data);
      });
      await this.walletBalanceService.start();
    }

    // Initialize speculation engine
    this.initSpeculation();

    // Setup event handlers
    this.setupEventHandlers();

    // Initialize content store and load demo content
    this.contentStore = new FsContentStore(this.config.dataDir);
    try {
      const loaded = await loadDemoContent(this.contentStore);
      if (loaded > 0) {
        console.log(`[Agent] Content store ready with ${loaded} new demo items`);
      } else {
        const stats = getContentCacheStats();
        console.log(`[Agent] Content store ready (${stats.totalItems} items, ${Math.round(stats.totalBytes / 1024 / 1024)}MB)`);
      }
    } catch (err) {
      console.warn('[Agent] Demo content loading failed:', err);
    }

    // Start marketplace bridge
    this.marketplaceBridge = new MarketplaceBridge(
      this.config.marketplaceUrl || 'https://path402.com'
    );
    this.marketplaceBridge.on('tokens:synced', (tokens) => {
      this.emit('tokens:synced', tokens);
      // Queue marketplace tokens for speculation evaluation
      if (this.speculationEngine) {
        for (const t of tokens) {
          this.speculationEngine.queueEvaluation(t.address);
        }
      }
    });
    this.marketplaceBridge.on('synced', () => {
      this.emit('marketplace:synced');
    });
    await this.marketplaceBridge.start();

    // Start GUI if enabled
    if (this.config.guiEnabled !== false) {
      this.guiServer = new GUIServer(this, this.config.guiPort || 4021, this.config.guiUiPath, this.config.walletKey);
      await this.guiServer.start();
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

    if (this.walletBalanceService) {
      this.walletBalanceService.stop();
      this.walletBalanceService = null;
    }

    if (this.headerSyncService) {
      this.headerSyncService.stop();
      this.headerSyncService = null;
    }

    if (this.relayService) {
      this.relayService.stop();
      this.relayService = null;
    }

    if (this.marketplaceBridge) {
      this.marketplaceBridge.stop();
      this.marketplaceBridge = null;
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

      case 'ollama':
        this.intelligenceProvider = new OllamaIntelligenceProvider(
          this.config.aiModel || 'llama3'
        );
        break;

      case 'routing': {
        const local = new OllamaIntelligenceProvider(this.config.localModel || 'llama3');
        const mid = new ClaudeIntelligenceProvider(this.config.aiApiKey, this.config.midModel || 'claude-3-haiku-20240307');
        const frontier = new ClaudeIntelligenceProvider(this.config.aiApiKey, this.config.frontierModel || 'claude-3-5-sonnet-20240620');

        this.intelligenceProvider = new RoutingIntelligenceProvider(local, mid, frontier);
        break;
      }

      case 'openai':
        throw new Error('OpenAI provider not yet implemented');

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
      console.log('[Agent] Speculation: skipped (no AI provider)');
      return;
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

      this.gossipNode.on('call:signal', (remotePeer: string, signal: CallSignalMessage) => {
        this.emit('call:signal', remotePeer, signal);
      });

      // Persist incoming chat messages
      this.gossipNode.on('chat:received', (chat: any) => {
        try {
          saveChatMessage({
            message_id: `chat_${chat.timestamp}_${chat.sender_address?.slice(0, 8)}`,
            message_type: 'channel',
            channel: chat.channel || 'global',
            sender_peer_id: chat.sender_address || 'unknown',
            sender_handle: chat.sender_handle,
            content: chat.content,
            timestamp: chat.timestamp,
          });
        } catch { /* dedup collision is fine */ }
      });

      // Handle incoming DMs
      this.gossipNode.on('dm:received', (remotePeer: string, signal: DMSignalMessage) => {
        if (signal.type === DMSignalTypeEnum.DM_MESSAGE) {
          const payload = signal.payload as DMMessagePayload;
          const myPeerId = this.gossipNode?.getLibp2pPeerId() || getNodeId();
          try {
            saveChatMessage({
              message_id: payload.message_id,
              message_type: 'dm',
              sender_peer_id: remotePeer,
              recipient_peer_id: myPeerId,
              sender_handle: payload.sender_handle,
              content: payload.content,
              timestamp: payload.timestamp,
            });
          } catch { /* dedup */ }
          this.emit('dm:received', remotePeer, payload);
        }
      });

      // Persist incoming room messages
      this.gossipNode.on('room:chat', (chat: any) => {
        try {
          saveChatMessage({
            message_id: chat.message_id,
            message_type: 'room',
            room_id: chat.room_id,
            sender_peer_id: chat.sender_peer_id,
            sender_handle: chat.sender_handle,
            content: chat.content,
            timestamp: chat.timestamp,
          });
        } catch { /* dedup */ }
        this.emit('room:chat', chat);
      });

      // Handle room join/leave/announce events
      this.gossipNode.on('room:join', (payload: any) => {
        try { addRoomMember(payload.room_id, payload.peer_id); } catch { /* ignore */ }
        this.emit('room:join', payload);
      });

      this.gossipNode.on('room:leave', (payload: any) => {
        try { removeRoomMember(payload.room_id, payload.peer_id); } catch { /* ignore */ }
        this.emit('room:leave', payload);
      });

      this.gossipNode.on('room:announced', (payload: any) => {
        // Store the room if we don't have it
        try {
          createChatRoom({
            room_id: payload.room_id,
            name: payload.name,
            room_type: payload.room_type || 'text',
            access_type: payload.access_type || 'public',
            token_id: payload.token_id,
            creator_peer_id: payload.creator_peer_id,
            capacity: payload.capacity || 50,
            description: payload.description,
          });
        } catch { /* already exists */ }
        this.emit('room:announced', payload);
      });

      // Handle block announcements — feed peer blocks into mining service
      this.gossipNode.on('block:announced', (block: any, peerId: string) => {
        if (this.miningService) {
          this.miningService.handlePeerBlock({
            hash: block.hash,
            height: block.height,
            prev_hash: block.prev_hash,
            merkle_root: block.merkle_root,
            miner_address: block.miner_address,
            timestamp: block.timestamp,
            bits: block.bits,
            nonce: block.nonce,
            version: block.version || 1,
            item_count: block.item_count || 0,
            target_hex: block.target || '',
            source_peer: peerId,
          });
        }
        this.emit('block:announced', block, peerId);
      });
    }

    if (this.miningService) {
      this.miningService.on('block_mined', (block: any) => {
        console.log(`[Agent] Block mined: ${block.hash.slice(0, 16)}... (${block.items.length} items)`);
        this.emit('block_mined', block);
      });

      this.miningService.on('mint_claimed', (data: any) => {
        console.log(`[Agent] MINT CLAIMED: ${data.txid} (${data.amount} tokens)`);
        this.emit('mint_claimed', data);
      });

      this.miningService.on('mint_failed', (data: any) => {
        console.warn(`[Agent] Mint failed: ${data.error}`);
        this.emit('mint_failed', data);
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
      },
      content: (() => {
        const stats = getContentCacheStats();
        return { items: stats.totalItems, totalBytes: stats.totalBytes };
      })(),
      mining: {
        enabled: !!this.miningService,
        broadcasterConnected: !!(this.miningService as any)?.broadcaster,
        tokenId: this.config.tokenId || process.env.HTM_TOKEN_ID,
        minerAddress: process.env.MINER_ADDRESS || process.env.TREASURY_ADDRESS,
        ...(this.miningService ? this.miningService.status() : {}),
      },
      relay: this.relayService?.health() ?? { peer_count: 0, cache_size: 0, db_size: 0, uptime_ms: 0 },
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
   * Send a call signal to a specific peer via direct libp2p stream
   */
  async sendCallSignal(peerId: string, signal: CallSignalMessage): Promise<void> {
    if (!this.gossipNode) throw new Error('Gossip not initialized');
    await this.gossipNode.sendCallSignal(peerId, signal);
  }

  /**
   * Get list of connected libp2p peer IDs
   */
  getCallPeers(): string[] {
    return this.gossipNode?.getConnectedPeers() || [];
  }

  /**
   * Get this node's libp2p peer ID
   */
  getLibp2pPeerId(): string | null {
    return this.gossipNode?.getLibp2pPeerId() || null;
  }

  // ── Identity (Digital DNA) ───────────────────────────────────

  /**
   * Mint a Digital DNA identity token
   */
  mintIdentity(symbol: string): IdentityToken {
    // Ensure $ prefix
    const sym = symbol.startsWith('$') ? symbol : `$${symbol}`;

    const validation = validateSymbol(sym);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid symbol');
    }

    // Check not already minted
    const existing = getIdentityToken();
    if (existing) {
      throw new Error(`Identity already minted: ${existing.symbol}`);
    }

    // Derive issuer address from walletKey or fall back to node ID
    const issuerAddress = this.config.walletKey
      ? this.config.walletKey.slice(0, 34)
      : getNodeId();

    // Prepare BSV21 inscription
    const mintResult = prepareMint({
      symbol: sym,
      issuerAddress,
      accessRate: 1,
      description: `Digital DNA identity token for ${sym.slice(1)}`
    });

    if (!mintResult.success || !mintResult.tokenId) {
      throw new Error(mintResult.error || 'Mint preparation failed');
    }

    const metadata = {
      name: sym.slice(1),
      description: `Digital DNA identity token for ${sym.slice(1)}`,
      protocol: 'path402',
      version: '1.0.0'
    };

    // Store in DB
    createIdentityToken(
      sym,
      mintResult.tokenId,
      issuerAddress,
      mintResult.inscription,
      metadata
    );

    // Update config to point to this identity
    setConfig('tokenId', mintResult.tokenId);

    const identity = getIdentityToken()!;
    this.emit('identity:minted', identity);
    return identity;
  }

  /**
   * Get the current identity token
   */
  getIdentity(): IdentityToken | null {
    return getIdentityToken();
  }

  /**
   * Get identity balance (v1: returns total supply)
   */
  getIdentityBalance(): string {
    const identity = getIdentityToken();
    if (!identity) return '0';
    return identity.total_supply;
  }

  /**
   * Record a call settlement
   */
  recordCallSettlement(
    callId: string,
    callerTokensSent: string,
    calleeTokensSent: string,
    duration: number
  ): CallRecord | null {
    const record = getCallRecord(callId);
    if (!record) return null;

    const settlementData = JSON.stringify({
      p: 'path402',
      op: 'call_settlement',
      call_id: callId,
      caller: record.caller_peer_id,
      callee: record.callee_peer_id,
      caller_token: record.caller_token_symbol,
      callee_token: record.callee_token_symbol,
      duration_seconds: duration,
      caller_tokens_sent: callerTokensSent,
      callee_tokens_sent: calleeTokensSent,
      settled_at: Math.floor(Date.now() / 1000)
    });

    updateCallRecord(callId, {
      ended_at: Math.floor(Date.now() / 1000),
      duration_seconds: duration,
      caller_tokens_sent: callerTokensSent,
      callee_tokens_sent: calleeTokensSent,
      settlement_status: 'pending',
      settlement_data: settlementData
    });

    return getCallRecord(callId);
  }

  /**
   * Get recent call records
   */
  getCallRecords(limit = 50): CallRecord[] {
    return getCallRecords(limit);
  }

  // ── DM Methods ──────────────────────────────────────────────

  /**
   * Send a DM to a specific peer via direct libp2p stream
   */
  async sendDM(peerId: string, content: string): Promise<void> {
    if (!this.gossipNode) throw new Error('Gossip not initialized');

    const messageId = randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const identity = getIdentityToken();

    const signal: DMSignalMessage = {
      type: DMSignalTypeEnum.DM_MESSAGE,
      payload: {
        message_id: messageId,
        content,
        sender_handle: identity?.symbol || getNodeId().slice(0, 8),
        timestamp,
      }
    };

    await this.gossipNode.sendDM(peerId, signal);

    // Persist locally
    saveChatMessage({
      message_id: messageId,
      message_type: 'dm',
      sender_peer_id: this.gossipNode.getLibp2pPeerId() || getNodeId(),
      recipient_peer_id: peerId,
      sender_handle: identity?.symbol || getNodeId().slice(0, 8),
      content,
      timestamp,
    });
  }

  /**
   * Get DM conversations list
   */
  getDMConversations(): Array<{ peer_id: string; last_message: string; last_timestamp: number; unread_count: number }> {
    const myPeerId = this.gossipNode?.getLibp2pPeerId() || getNodeId();
    return getDMConversations(myPeerId);
  }

  /**
   * Get DM messages with a specific peer
   */
  getDMMessages(peerId: string, limit = 50, before?: number): ChatMessage[] {
    const myPeerId = this.gossipNode?.getLibp2pPeerId() || getNodeId();
    return getDMMessages(myPeerId, peerId, limit, before);
  }

  /**
   * Get channel chat history
   */
  getChatHistory(channel: string, limit = 50, before?: number): ChatMessage[] {
    return getChannelMessages(channel, limit, before);
  }

  // ── Room Methods ────────────────────────────────────────────

  /**
   * Create a new chat room, optionally token-gated
   */
  async createRoom(
    name: string,
    roomType: 'text' | 'voice' | 'hybrid' = 'text',
    accessType: 'public' | 'private' | 'token_gated' = 'public',
    tokenSymbol?: string
  ): Promise<ChatRoom> {
    if (!this.gossipNode) throw new Error('Gossip not initialized');

    const roomId = randomBytes(16).toString('hex');
    const creatorPeerId = this.gossipNode.getLibp2pPeerId() || getNodeId();
    let tokenId: string | undefined;

    // Mint a BSV-21 token for the room if token-gated
    if (accessType === 'token_gated' && tokenSymbol) {
      const sym = tokenSymbol.startsWith('$') ? tokenSymbol : `$${tokenSymbol}`;
      const issuerAddress = this.config.walletKey
        ? this.config.walletKey.slice(0, 34)
        : getNodeId();

      const mintResult = prepareMint({
        symbol: sym,
        issuerAddress,
        accessRate: 1,
        description: `Room access token for ${name}`
      });

      if (mintResult.success && mintResult.tokenId) {
        tokenId = mintResult.tokenId;
      }
    }

    const capacity = roomType === 'voice' ? 6 : roomType === 'hybrid' ? 6 : 50;

    // Store in DB
    createChatRoom({
      room_id: roomId,
      name,
      room_type: roomType,
      access_type: accessType,
      token_id: tokenId,
      creator_peer_id: creatorPeerId,
      capacity,
    });

    // Add creator as owner
    addRoomMember(roomId, creatorPeerId, 'owner');

    // Announce to network
    this.gossipNode.announceRoom({
      room_id: roomId,
      name,
      room_type: roomType,
      access_type: accessType,
      token_id: tokenId,
      creator_peer_id: creatorPeerId,
      capacity,
    });

    return getChatRoom(roomId)!;
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string): void {
    if (!this.gossipNode) throw new Error('Gossip not initialized');

    const room = getChatRoom(roomId);
    if (!room) throw new Error('Room not found');

    const myPeerId = this.gossipNode.getLibp2pPeerId() || getNodeId();

    // Check token gate
    if (room.access_type === 'token_gated' && room.token_id) {
      const holding = getHolding(room.token_id);
      if (!holding || holding.balance <= 0) {
        throw new Error(`Token gate: you need to hold ${room.token_id} to join this room`);
      }
    }

    // Check capacity
    const members = getRoomMembers(roomId);
    if (members.length >= room.capacity) {
      throw new Error('Room is full');
    }

    addRoomMember(roomId, myPeerId);

    // Broadcast join
    const identity = getIdentityToken();
    this.gossipNode.broadcastRoomJoin({
      room_id: roomId,
      peer_id: myPeerId,
      handle: identity?.symbol || getNodeId().slice(0, 8),
    });
  }

  /**
   * Leave a room
   */
  leaveRoom(roomId: string): void {
    if (!this.gossipNode) throw new Error('Gossip not initialized');

    const myPeerId = this.gossipNode.getLibp2pPeerId() || getNodeId();
    removeRoomMember(roomId, myPeerId);

    this.gossipNode.broadcastRoomLeave({
      room_id: roomId,
      peer_id: myPeerId,
    });
  }

  /**
   * Send a message to a room
   */
  sendRoomMessage(roomId: string, content: string): void {
    if (!this.gossipNode) throw new Error('Gossip not initialized');

    const messageId = randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const myPeerId = this.gossipNode.getLibp2pPeerId() || getNodeId();
    const identity = getIdentityToken();

    this.gossipNode.broadcastRoomMessage({
      room_id: roomId,
      message_id: messageId,
      content,
      sender_handle: identity?.symbol || getNodeId().slice(0, 8),
      sender_peer_id: myPeerId,
      timestamp,
    });

    // Persist locally
    saveChatMessage({
      message_id: messageId,
      message_type: 'room',
      room_id: roomId,
      sender_peer_id: myPeerId,
      sender_handle: identity?.symbol || getNodeId().slice(0, 8),
      content,
      timestamp,
    });
  }

  /**
   * Get room messages
   */
  getRoomMessages(roomId: string, limit = 50, before?: number): ChatMessage[] {
    return getRoomMessages(roomId, limit, before);
  }

  /**
   * Get all rooms
   */
  getRooms(): ChatRoom[] {
    return getAllChatRooms();
  }

  /**
   * Get a specific room
   */
  getRoom(roomId: string): ChatRoom | null {
    return getChatRoom(roomId);
  }

  /**
   * Get members of a room
   */
  getRoomMembers(roomId: string): RoomMember[] {
    return getRoomMembers(roomId);
  }

  /**
   * Send a room voice signal to a specific peer
   */
  async sendRoomVoiceSignal(peerId: string, signal: RoomVoiceSignalMessage): Promise<void> {
    if (!this.gossipNode) throw new Error('Gossip not initialized');
    await this.gossipNode.sendRoomVoiceSignal(peerId, signal);
  }

  /**
   * Check if agent is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the content store instance
   */
  getContentStore(): FsContentStore | null {
    return this.contentStore;
  }

  /**
   * Get the marketplace bridge instance
   */
  getMarketplaceBridge(): MarketplaceBridge | null {
    return this.marketplaceBridge;
  }

  /**
   * Get the relay service instance (SPV Relay Mesh)
   */
  getRelayService(): RelayService | null {
    return this.relayService;
  }

  /**
   * Get the mining service instance (Proof of Indexing)
   */
  getMiningService(): ProofOfIndexingService | null {
    return this.miningService;
  }

  /**
   * Get the gossip node instance
   */
  getGossipNode(): GossipNode | null {
    return this.gossipNode;
  }

  /**
   * Get the header sync service instance (SPV validation)
   */
  getHeaderSyncService(): HeaderSyncService | null {
    return this.headerSyncService;
  }

  /**
   * Get the wallet balance service instance
   */
  getWalletBalanceService(): WalletBalanceService | null {
    return this.walletBalanceService;
  }
}

// ── CLI Entry Point ────────────────────────────────────────────────

import { Config } from '../pathd/config.js';

export async function runAgent(config: AgentConfig = {}): Promise<Path402Agent> {
  // Load daemon config file (~/.pathd/config.json) and merge wallet/token settings
  const daemonConfig = new Config();
  if (!config.walletKey && daemonConfig.walletKey) {
    config.walletKey = daemonConfig.walletKey;
  }
  if (!config.tokenId && daemonConfig.tokenId) {
    config.tokenId = daemonConfig.tokenId;
  }
  if (!config.dataDir) {
    config.dataDir = daemonConfig.dataDir;
  }
  if (!config.marketplaceUrl && daemonConfig.marketplaceUrl) {
    config.marketplaceUrl = daemonConfig.marketplaceUrl;
  }

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
