/**
 * $402 Gossip Node
 *
 * The main gossip service that orchestrates peer communication,
 * message routing, on-chain verification, and data synchronization.
 */

import { EventEmitter } from 'events';
import { PeerManager } from './peer.js';
import {
  GossipMessage,
  MessageType,
  createAnnounceToken,
  createRequestToken,
  createTokenData,
  createTransferEvent,
  createPeerListRequest,
  createPeerList,
  prepareForRelay,
  hashMessage,
  AnnounceTokenPayload,
  RequestTokenPayload,
  TokenDataPayload,
  TransferEventPayload,
  HolderUpdatePayload,
  PeerListPayload,
  PeerInfo,
  GOSSIP_PORT
} from './protocol.js';
import {
  getNodeId,
  upsertToken,
  getToken,
  getAllTokens,
  markTokenVerified,
  upsertPeer,
  getActivePeers,
  getAllPeers,
  recordTransfer,
  hasTransfer,
  logGossipMessage,
  hasSeenMessage,
  getHolding,
  getTransfers
} from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface GossipNodeConfig {
  port?: number;
  bootstrapPeers?: string[];
  maxPeers?: number;
  verifyOnChain?: boolean;
}

export interface GossipNodeEvents {
  'ready': () => void;
  'token:discovered': (tokenId: string, token: AnnounceTokenPayload) => void;
  'transfer:received': (transfer: TransferEventPayload) => void;
  'peer:count': (count: number) => void;
}

const DEFAULT_BOOTSTRAP_PEERS: string[] = [
  // Add known bootstrap nodes here
  // 'pathd.b0ase.com:4020',
];

// ── Gossip Node ────────────────────────────────────────────────────

export class GossipNode extends EventEmitter {
  private nodeId: string;
  private peerManager: PeerManager;
  private config: Required<GossipNodeConfig>;
  private seenMessages: Set<string> = new Set();
  private started = false;

  constructor(config: GossipNodeConfig = {}) {
    super();
    this.nodeId = getNodeId();
    this.config = {
      port: config.port ?? GOSSIP_PORT,
      bootstrapPeers: config.bootstrapPeers ?? DEFAULT_BOOTSTRAP_PEERS,
      maxPeers: config.maxPeers ?? 50,
      verifyOnChain: config.verifyOnChain ?? true
    };
    this.peerManager = new PeerManager(this.config.port);

    this.setupPeerHandlers();
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;

    console.log(`[GossipNode] Starting node ${this.nodeId.slice(0, 8)}...`);

    // Start listening for connections
    await this.peerManager.startServer();

    // Connect to bootstrap peers
    await this.connectToBootstrapPeers();

    this.started = true;
    this.emit('ready');

    console.log(`[GossipNode] Node ready with ${this.peerManager.getPeerCount()} peers`);
  }

  stop(): void {
    this.peerManager.stopServer();
    this.started = false;
    console.log('[GossipNode] Node stopped');
  }

  private async connectToBootstrapPeers(): Promise<void> {
    // Try saved peers first
    const savedPeers = getAllPeers().filter(p => p.status !== 'banned');

    for (const peer of savedPeers.slice(0, 10)) {
      try {
        await this.peerManager.connect(peer.host, peer.port);
      } catch (err) {
        // Ignore connection failures
      }
    }

    // Then try bootstrap peers
    for (const addr of this.config.bootstrapPeers) {
      const [host, portStr] = addr.split(':');
      const port = parseInt(portStr) || GOSSIP_PORT;

      try {
        await this.peerManager.connect(host, port);
      } catch (err) {
        console.warn(`[GossipNode] Failed to connect to bootstrap peer ${addr}`);
      }
    }
  }

  // ── Peer Event Handlers ────────────────────────────────────────

  private setupPeerHandlers(): void {
    this.peerManager.on('peer:connected', (peerId, conn) => {
      console.log(`[GossipNode] Peer connected: ${peerId}`);
      this.emit('peer:count', this.peerManager.getPeerCount());

      // Request peer list from new peer
      const request = createPeerListRequest(this.nodeId);
      this.peerManager.sendMessage(peerId, request);
    });

    this.peerManager.on('peer:disconnected', (peerId) => {
      console.log(`[GossipNode] Peer disconnected: ${peerId}`);
      this.emit('peer:count', this.peerManager.getPeerCount());
    });

    this.peerManager.on('peer:message', (peerId, msg) => {
      this.handleMessage(peerId, msg);
    });

    this.peerManager.on('peer:error', (peerId, error) => {
      console.error(`[GossipNode] Peer error ${peerId}:`, error.message);
    });
  }

  // ── Message Handling ───────────────────────────────────────────

  private handleMessage(peerId: string, msg: GossipMessage): void {
    // Deduplicate
    const msgHash = hashMessage(msg);
    if (this.seenMessages.has(msgHash) || hasSeenMessage(msgHash)) {
      return; // Already processed
    }
    this.seenMessages.add(msgHash);

    // Log
    logGossipMessage('in', peerId, msg.type, msg.payload, true);

    // Handle by type
    switch (msg.type) {
      case MessageType.PEER_LIST_REQUEST:
        this.handlePeerListRequest(peerId);
        break;

      case MessageType.PEER_LIST:
        this.handlePeerList(msg as GossipMessage<PeerListPayload>);
        break;

      case MessageType.ANNOUNCE_TOKEN:
        this.handleAnnounceToken(peerId, msg as GossipMessage<AnnounceTokenPayload>);
        break;

      case MessageType.REQUEST_TOKEN:
        this.handleRequestToken(peerId, msg as GossipMessage<RequestTokenPayload>);
        break;

      case MessageType.TOKEN_DATA:
        this.handleTokenData(peerId, msg as GossipMessage<TokenDataPayload>);
        break;

      case MessageType.TRANSFER_EVENT:
        this.handleTransferEvent(peerId, msg as GossipMessage<TransferEventPayload>);
        break;

      case MessageType.HOLDER_UPDATE:
        this.handleHolderUpdate(peerId, msg as GossipMessage<HolderUpdatePayload>);
        break;
    }

    // Relay to other peers (if appropriate)
    this.relayMessage(msg, peerId);
  }

  private handlePeerListRequest(peerId: string): void {
    const peers = getActivePeers().map(p => ({
      peer_id: p.peer_id,
      host: p.host,
      port: p.port,
      last_seen: p.last_seen_at || 0,
      reputation: p.reputation_score
    }));

    const response = createPeerList(this.nodeId, peers);
    this.peerManager.sendMessage(peerId, response);
  }

  private handlePeerList(msg: GossipMessage<PeerListPayload>): void {
    for (const peer of msg.payload.peers) {
      // Don't add self
      if (peer.peer_id === this.nodeId) continue;

      // Store peer
      upsertPeer({
        peer_id: peer.peer_id,
        host: peer.host,
        port: peer.port,
        status: 'unknown',
        discovered_via: 'gossip'
      });

      // Try to connect if we need more peers
      if (this.peerManager.getPeerCount() < this.config.maxPeers) {
        this.peerManager.connect(peer.host, peer.port).catch(() => {});
      }
    }
  }

  private handleAnnounceToken(peerId: string, msg: GossipMessage<AnnounceTokenPayload>): void {
    const token = msg.payload;
    console.log(`[GossipNode] Token announced: ${token.token_id} (supply: ${token.current_supply})`);

    // Store token
    upsertToken({
      token_id: token.token_id,
      name: token.name,
      issuer_handle: token.issuer_handle,
      current_supply: token.current_supply,
      base_price_sats: token.base_price_sats,
      pricing_model: token.pricing_model,
      content_preview: token.content_preview,
      discovered_via: 'gossip',
      verification_status: token.verified ? 'verified' : 'unverified'
    });

    this.emit('token:discovered', token.token_id, token);

    // If we're interested, request full data
    // (Could add logic here to filter which tokens we care about)
  }

  private handleRequestToken(peerId: string, msg: GossipMessage<RequestTokenPayload>): void {
    const tokenId = msg.payload.token_id;
    const token = getToken(tokenId);

    if (!token) {
      return; // We don't have this token
    }

    // Get transfers for this token
    const transfers = getTransfers(tokenId, 10);

    const response = createTokenData(this.nodeId, {
      token_id: token.token_id,
      name: token.name || undefined,
      description: token.description || undefined,
      issuer_address: token.issuer_address || undefined,
      issuer_handle: token.issuer_handle || undefined,
      base_price_sats: token.base_price_sats,
      pricing_model: token.pricing_model,
      current_supply: token.current_supply,
      max_supply: token.max_supply || undefined,
      issuer_share_bps: token.issuer_share_bps,
      network_share_bps: token.network_share_bps,
      content_type: token.content_type || undefined,
      content_preview: token.content_preview || undefined,
      access_url: token.access_url || undefined,
      holders_count: 0, // TODO: count from holders table
      recent_transfers: transfers.map(t => ({
        token_id: t.token_id,
        from_address: t.from_address || undefined,
        to_address: t.to_address,
        amount: t.amount,
        txid: t.txid || '',
        block_height: t.block_height || undefined,
        block_time: t.block_time || undefined
      }))
    });

    this.peerManager.sendMessage(peerId, response);
  }

  private handleTokenData(peerId: string, msg: GossipMessage<TokenDataPayload>): void {
    const data = msg.payload;

    // Store/update token
    upsertToken({
      token_id: data.token_id,
      name: data.name,
      description: data.description,
      issuer_address: data.issuer_address,
      issuer_handle: data.issuer_handle,
      base_price_sats: data.base_price_sats,
      pricing_model: data.pricing_model,
      current_supply: data.current_supply,
      max_supply: data.max_supply,
      issuer_share_bps: data.issuer_share_bps,
      network_share_bps: data.network_share_bps,
      content_type: data.content_type,
      content_preview: data.content_preview,
      access_url: data.access_url,
      discovered_via: 'gossip'
    });

    // Store transfers
    for (const transfer of data.recent_transfers) {
      if (!hasTransfer(transfer.txid)) {
        recordTransfer({
          token_id: transfer.token_id,
          from_address: transfer.from_address || null,
          to_address: transfer.to_address,
          amount: transfer.amount,
          txid: transfer.txid,
          block_height: transfer.block_height || null,
          block_time: transfer.block_time || null,
          verified_at: null,
          verified_via: 'gossip'
        });
      }
    }
  }

  private handleTransferEvent(peerId: string, msg: GossipMessage<TransferEventPayload>): void {
    const transfer = msg.payload;

    // Check if we already have this transfer
    if (hasTransfer(transfer.txid)) {
      return;
    }

    console.log(`[GossipNode] Transfer received: ${transfer.amount} ${transfer.token_id}`);

    // Store transfer
    recordTransfer({
      token_id: transfer.token_id,
      from_address: transfer.from_address || null,
      to_address: transfer.to_address,
      amount: transfer.amount,
      txid: transfer.txid,
      block_height: transfer.block_height || null,
      block_time: transfer.block_time || null,
      verified_at: null,
      verified_via: 'gossip'
    });

    // Update token supply if we have it
    const token = getToken(transfer.token_id);
    if (token) {
      upsertToken({
        token_id: transfer.token_id,
        current_supply: token.current_supply + transfer.amount
      });
    }

    this.emit('transfer:received', transfer);

    // TODO: If verifyOnChain is true, verify against WhatsOnChain
  }

  private handleHolderUpdate(peerId: string, msg: GossipMessage<HolderUpdatePayload>): void {
    // TODO: Store holder updates
    // For now, we'll primarily rely on transfer events
  }

  // ── Message Relay ──────────────────────────────────────────────

  private relayMessage(msg: GossipMessage, excludePeer: string): void {
    // Don't relay handshake messages
    if ([MessageType.HELLO, MessageType.HELLO_ACK, MessageType.PING, MessageType.PONG,
         MessageType.PEER_LIST_REQUEST, MessageType.PEER_LIST].includes(msg.type)) {
      return;
    }

    const relayMsg = prepareForRelay(msg);
    if (!relayMsg) return; // TTL expired or max hops

    const sent = this.peerManager.broadcast(relayMsg, [excludePeer, msg.sender_id]);
    if (sent > 0) {
      logGossipMessage('out', null, msg.type, msg.payload);
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Announce a token we know about
   */
  announceToken(tokenId: string): void {
    const token = getToken(tokenId);
    if (!token) return;

    const msg = createAnnounceToken(this.nodeId, {
      token_id: token.token_id,
      name: token.name || undefined,
      issuer_handle: token.issuer_handle || undefined,
      current_supply: token.current_supply,
      current_price_sats: Math.ceil(token.base_price_sats / Math.sqrt(token.current_supply + 1)),
      base_price_sats: token.base_price_sats,
      pricing_model: token.pricing_model,
      content_preview: token.content_preview || undefined,
      verified: token.verification_status === 'verified'
    });

    const sent = this.peerManager.broadcast(msg);
    console.log(`[GossipNode] Announced token ${tokenId} to ${sent} peers`);
  }

  /**
   * Request data for a token we're interested in
   */
  requestToken(tokenId: string): void {
    const msg = createRequestToken(this.nodeId, tokenId);
    const sent = this.peerManager.broadcast(msg);
    console.log(`[GossipNode] Requested token ${tokenId} from ${sent} peers`);
  }

  /**
   * Broadcast a transfer event
   */
  broadcastTransfer(transfer: TransferEventPayload): void {
    const msg = createTransferEvent(this.nodeId, transfer);
    const sent = this.peerManager.broadcast(msg);
    console.log(`[GossipNode] Broadcast transfer to ${sent} peers`);
  }

  /**
   * Connect to a specific peer
   */
  async connectToPeer(host: string, port = GOSSIP_PORT): Promise<void> {
    await this.peerManager.connect(host, port);
  }

  /**
   * Get connected peer count
   */
  getPeerCount(): number {
    return this.peerManager.getPeerCount();
  }

  /**
   * Get connected peer IDs
   */
  getConnectedPeers(): string[] {
    return this.peerManager.getConnectedPeers();
  }

  /**
   * Get node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }
}
