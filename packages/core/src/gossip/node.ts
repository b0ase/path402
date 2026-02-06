/**
 * $402 Gossip Node (libp2p implementation)
 * 
 * Professional-grade P2P networking with:
 * - Noise encryption (PFS)
 * - Yamux multiplexing
 * - GossipSub message propagation
 */

import { EventEmitter } from 'events';
import { createLibp2p, Libp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@libp2p/noise';
import { yamux } from '@libp2p/yamux';
import { gossipsub } from '@libp2p/gossipsub';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import { multiaddr } from '@multiformats/multiaddr';
import { createEd25519PeerId } from '@libp2p/peer-id-factory';
import {
  GossipMessage,
  MessageType,
  createAnnounceToken,
  createRequestToken,
  createTokenData,
  createTransferEvent,
  createMessage,
  hashMessage,
  AnnounceTokenPayload,
  RequestTokenPayload,
  TokenDataPayload,
  TransferEventPayload,
  HolderUpdatePayload,
  ContentRequestPayload,
  ContentOfferPayload,
  TicketStampPayload,
  createTicketStamp,
  ChatPayload,
  createChatMessage,
  GOSSIP_PORT
} from './protocol.js';
import {
  getNodeId,
  upsertToken,
  getToken,
  recordTransfer,
  hasTransfer,
  logGossipMessage,
  hasSeenMessage,
  getTransfers,
  upsertPeer
} from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface GossipNodeConfig {
  port?: number;
  bootstrapPeers?: string[];
  maxPeers?: number;
  verifyOnChain?: boolean;
}

const TOPICS = {
  TOKENS: '$402/tokens/v1',
  TRANSFERS: '$402/transfers/v1',
  STAMPS: '$402/stamps/v1',
  CHAT: '$402/chat/v1',
  CONTENT: '$402/content/v1'
};

// ── Gossip Node ────────────────────────────────────────────────────

export class GossipNode extends EventEmitter {
  private nodeId: string;
  private libp2p: Libp2p | null = null;
  private config: Required<GossipNodeConfig>;
  private started = false;

  constructor(config: GossipNodeConfig = {}) {
    super();
    this.nodeId = getNodeId();
    this.config = {
      port: config.port ?? GOSSIP_PORT,
      bootstrapPeers: config.bootstrapPeers ?? [],
      maxPeers: config.maxPeers ?? 50,
      verifyOnChain: config.verifyOnChain ?? true
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;

    console.log(`[GossipNode] Initializing libp2p node ${this.nodeId.slice(0, 8)}...`);

    const bootstrapNodes = this.config.bootstrapPeers.map(addr => addr.startsWith('/') ? addr : `/ip4/${addr.split(':')[0]}/tcp/${addr.split(':')[1] || GOSSIP_PORT}/p2p/REPLACE_ME`);

    this.libp2p = await createLibp2p({
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`]
      },
      transports: [tcp() as any],
      connectionEncryption: [noise() as any],
      streamMuxers: [yamux() as any],
      services: {
        identify: identify({
          protocolPrefix: '402-p2p'
        } as any) as any,
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          fallbackToFloodsub: true,
          globalSignaturePolicy: 'StrictNoSign'
        }) as any
      },
      connectionManager: {
        maxConnections: this.config.maxPeers,
        minConnections: 1
      },
      // Essential for Identify service
      nodeInfo: {
        name: 'path402',
        version: '3.0.0',
        userAgent: 'path402/3.0.0'
      },
      // Peer discovery via bootstrap
      peerDiscovery: this.config.bootstrapPeers.length > 0 ? [
        bootstrap({
          list: this.config.bootstrapPeers
        }) as any
      ] : []
    } as any);

    // Setup event handlers
    this.setupLibp2pHandlers();

    // Start node
    await this.libp2p.start();

    // Subscribe to topics
    if (this.libp2p) {
      const lp2p = this.libp2p as any;
      await lp2p.services.pubsub.subscribe(TOPICS.TOKENS);
      await lp2p.services.pubsub.subscribe(TOPICS.TRANSFERS);
      await lp2p.services.pubsub.subscribe(TOPICS.STAMPS);
      await lp2p.services.pubsub.subscribe(TOPICS.CHAT);
      await lp2p.services.pubsub.subscribe(TOPICS.CONTENT);
    }

    this.started = true;
    this.emit('ready');

    console.log(`[GossipNode] libp2p node started. Identity: ${this.libp2p.peerId.toString()}`);
    console.log(`[GossipNode] Listening on:`);
    this.libp2p.getMultiaddrs().forEach(ma => console.log(`  ${ma.toString()}`));
    console.log(`[GossipNode] Transport: NOISE ENCRYPTED TCP (PFS)`);
  }

  async stop(): Promise<void> {
    if (this.libp2p) {
      await this.libp2p.stop();
      this.libp2p = null;
    }
    this.started = false;
    console.log('[GossipNode] libp2p node stopped');
  }

  private setupLibp2pHandlers(): void {
    if (!this.libp2p) return;

    this.libp2p.addEventListener('peer:connect', (evt: any) => {
      const peerId = evt.detail.toString();
      console.log(`[GossipNode] Peer connected: ${peerId}`);
      this.emit('peer:count', this.getPeerCount());

      // Store in DB
      upsertPeer({
        peer_id: peerId,
        host: 'unknown',
        port: 0,
        status: 'active',
        discovered_via: 'libp2p'
      });
    });

    this.libp2p.addEventListener('peer:disconnect', (evt: any) => {
      const peerId = evt.detail.toString();
      console.log(`[GossipNode] Peer disconnected: ${peerId}`);
      this.emit('peer:count', this.getPeerCount());
    });

    (this.libp2p.services.pubsub as any).addEventListener('message', (evt: any) => {
      const topic = evt.detail.topic;
      const data = evt.detail.data;
      try {
        const msg = JSON.parse(new TextDecoder().decode(data)) as GossipMessage;
        this.handleGossipMessage(topic, msg);
      } catch (err) {
        console.error(`[GossipNode] Failed to handle pubsub message:`, err);
      }
    });
  }

  // ── Message Handling ───────────────────────────────────────────

  private handleGossipMessage(topic: string, msg: GossipMessage): void {
    // Deduplicate
    const msgHash = hashMessage(msg);
    if (hasSeenMessage(msgHash)) {
      return;
    }

    // Log
    logGossipMessage('in', msg.sender_id, msg.type, msg.payload, true);

    // Handle by type
    switch (msg.type) {
      case MessageType.ANNOUNCE_TOKEN:
        this.handleAnnounceToken(msg.sender_id, msg as GossipMessage<AnnounceTokenPayload>);
        break;

      case MessageType.TRANSFER_EVENT:
        this.handleTransferEvent(msg.sender_id, msg as GossipMessage<TransferEventPayload>);
        break;

      case MessageType.TICKET_STAMP:
        this.handleTicketStamp(msg.sender_id, msg as GossipMessage<TicketStampPayload>);
        break;

      case MessageType.CHAT_MESSAGE:
        this.handleChatMessage(msg.sender_id, msg as GossipMessage<ChatPayload>);
        break;

      case MessageType.CONTENT_REQUEST:
        this.handleContentRequest(msg.sender_id, msg as GossipMessage<ContentRequestPayload>);
        break;

      case MessageType.CONTENT_OFFER:
        this.handleContentOffer(msg.sender_id, msg as GossipMessage<ContentOfferPayload>);
        break;
    }
  }

  private handleAnnounceToken(peerId: string, msg: GossipMessage<AnnounceTokenPayload>): void {
    const token = msg.payload;
    console.log(`[GossipNode] Token announced: ${token.token_id} (supply: ${token.current_supply})`);

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
  }

  private handleTransferEvent(peerId: string, msg: GossipMessage<TransferEventPayload>): void {
    const transfer = msg.payload;
    if (hasTransfer(transfer.txid)) return;

    console.log(`[GossipNode] Transfer received: ${transfer.amount} ${transfer.token_id}`);

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

    this.emit('transfer:received', transfer);
  }

  private handleTicketStamp(peerId: string, msg: GossipMessage<TicketStampPayload>): void {
    const stamp = msg.payload;
    console.log(`[GossipNode] Ticket stamp received for ${stamp.address} on ${stamp.path}`);
    this.emit('ticket:stamped', stamp);
  }

  private handleChatMessage(peerId: string, msg: GossipMessage<ChatPayload>): void {
    const chat = msg.payload;
    console.log(`[GossipNode] Chat message from ${chat.sender_address} in ${chat.channel}`);
    this.emit('chat:received', chat);
  }

  private handleContentRequest(peerId: string, msg: GossipMessage<ContentRequestPayload>): void {
    const request = msg.payload;
    console.log(`[GossipNode] Content request for ${request.token_id} from ${peerId}`);
    this.emit('content:requested', request, peerId);
  }

  private handleContentOffer(peerId: string, msg: GossipMessage<ContentOfferPayload>): void {
    const offer = msg.payload;
    console.log(`[GossipNode] Content offer for ${offer.token_id} (${offer.content_size} bytes) from ${peerId}`);
    this.emit('content:offered', offer, peerId);
  }

  // ── Public API ─────────────────────────────────────────────────

  private async publish(topic: string, msg: GossipMessage): Promise<void> {
    if (!this.libp2p) return;
    const data = new TextEncoder().encode(JSON.stringify(msg));
    await (this.libp2p.services as any).pubsub.publish(topic, data);
    logGossipMessage('out', null, msg.type, msg.payload);
  }

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

    this.publish(TOPICS.TOKENS, msg);
    console.log(`[GossipNode] Announced token ${tokenId} via GossipSub`);
  }

  requestToken(tokenId: string): void {
    const msg = createRequestToken(this.nodeId, tokenId);
    this.publish(TOPICS.TOKENS, msg); // Use tokens topic for requests for now
    console.log(`[GossipNode] Requested token ${tokenId} via GossipSub`);
  }

  broadcastTransfer(transfer: TransferEventPayload): void {
    const msg = createTransferEvent(this.nodeId, transfer);
    this.publish(TOPICS.TRANSFERS, msg);
    console.log(`[GossipNode] Broadcast transfer via GossipSub`);
  }

  broadcastTicketStamp(stamp: TicketStampPayload): void {
    const msg = createTicketStamp(this.nodeId, stamp);
    this.publish(TOPICS.STAMPS, msg);
    console.log(`[GossipNode] Broadcast ticket stamp via GossipSub`);
  }

  broadcastChatMessage(chat: ChatPayload): void {
    const msg = createChatMessage(this.nodeId, chat);
    this.publish(TOPICS.CHAT, msg);
    console.log(`[GossipNode] Broadcast chat message via GossipSub`);
  }

  requestContent(tokenId: string, requesterAddress: string): void {
    const msg = createMessage<ContentRequestPayload>(
      MessageType.CONTENT_REQUEST,
      this.nodeId,
      { token_id: tokenId, requester_address: requesterAddress }
    );
    this.publish(TOPICS.CONTENT, msg);
    console.log(`[GossipNode] Requested content for ${tokenId} via GossipSub`);
  }

  offerContent(tokenId: string, contentHash: string, contentSize: number, priceSats: number, serverAddress: string): void {
    const msg = createMessage<ContentOfferPayload>(
      MessageType.CONTENT_OFFER,
      this.nodeId,
      {
        token_id: tokenId,
        content_hash: contentHash,
        content_size: contentSize,
        price_sats: priceSats,
        server_address: serverAddress
      }
    );
    this.publish(TOPICS.CONTENT, msg);
    console.log(`[GossipNode] Offered content for ${tokenId} via GossipSub`);
  }

  async connectToPeer(addr: string): Promise<void> {
    if (!this.libp2p) return;
    try {
      const ma = multiaddr(addr);
      await this.libp2p.dial(ma);
      console.log(`[GossipNode] Dialled peer ${addr}`);
    } catch (err) {
      console.error(`[GossipNode] Failed to dial peer ${addr}:`, err);
    }
  }

  getPeerCount(): number {
    return this.libp2p?.getPeers().length || 0;
  }

  getConnectedPeers(): string[] {
    return this.libp2p?.getPeers().map(p => p.toString()) || [];
  }

  getNodeId(): string {
    return this.nodeId;
  }
}
