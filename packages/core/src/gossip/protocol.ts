/**
 * $402 Gossip Protocol
 *
 * Message types and validation for peer-to-peer communication.
 * Nodes share token discoveries, transfer events, and holder updates.
 *
 * Trust model:
 * 1. Receive message from peer
 * 2. If interesting, verify against WhatsOnChain
 * 3. If valid, store locally and re-gossip
 * 4. If invalid, reduce peer reputation
 */

import { createHash, randomBytes } from 'crypto';

// ── Protocol Constants ─────────────────────────────────────────────

export const PROTOCOL_VERSION = '0.1.0';
export const GOSSIP_PORT = 4020;
export const MAX_MESSAGE_SIZE = 1024 * 64; // 64KB
export const MESSAGE_TTL = 300; // 5 minutes
export const MAX_HOPS = 10;

// ── Message Types ──────────────────────────────────────────────────

export enum MessageType {
  // Handshake
  HELLO = 'HELLO',
  HELLO_ACK = 'HELLO_ACK',

  // Peer discovery
  PEER_LIST_REQUEST = 'PEER_LIST_REQUEST',
  PEER_LIST = 'PEER_LIST',

  // Token announcements
  ANNOUNCE_TOKEN = 'ANNOUNCE_TOKEN',
  REQUEST_TOKEN = 'REQUEST_TOKEN',
  TOKEN_DATA = 'TOKEN_DATA',

  // Transfer events
  TRANSFER_EVENT = 'TRANSFER_EVENT',

  // Holder updates
  HOLDER_UPDATE = 'HOLDER_UPDATE',

  // Content serving
  CONTENT_REQUEST = 'CONTENT_REQUEST',
  CONTENT_OFFER = 'CONTENT_OFFER',

  // Ticket Stamping
  TICKET_STAMP = 'TICKET_STAMP',

  // Real-time Chat
  CHAT_MESSAGE = 'CHAT_MESSAGE',

  // Room messages (via $402/rooms/v1 topic)
  ROOM_CHAT_MESSAGE = 'ROOM_CHAT_MESSAGE',
  ROOM_JOIN = 'ROOM_JOIN',
  ROOM_LEAVE = 'ROOM_LEAVE',
  ROOM_ANNOUNCE = 'ROOM_ANNOUNCE',

  // Block announcements (PoI mining)
  BLOCK_ANNOUNCE = 'BLOCK_ANNOUNCE',

  // Ping/Pong for keepalive
  PING = 'PING',
  PONG = 'PONG'
}

// ── Call Signal Types (Direct Stream, not GossipSub) ─────────────

export enum CallSignalType {
  CALL_OFFER = 'CALL_OFFER',
  CALL_ANSWER = 'CALL_ANSWER',
  CALL_REJECT = 'CALL_REJECT',
  CALL_HANGUP = 'CALL_HANGUP',
  ICE_CANDIDATE = 'ICE_CANDIDATE',
}

export interface CallOfferPayload {
  call_id: string;
  caller_node_id: string;
  sdp: string;
}

export interface CallAnswerPayload {
  call_id: string;
  sdp: string;
}

export interface CallRejectPayload {
  call_id: string;
  reason?: string;
}

export interface CallHangupPayload {
  call_id: string;
}

export interface IceCandidatePayload {
  call_id: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface CallSignalMessage {
  type: CallSignalType;
  payload: CallOfferPayload | CallAnswerPayload | CallRejectPayload | CallHangupPayload | IceCandidatePayload;
}

// ── DM Signal Types (Direct Stream, not GossipSub) ──────────────

export enum DMSignalType {
  DM_MESSAGE = 'DM_MESSAGE',
  DM_ACK = 'DM_ACK',
  DM_TYPING = 'DM_TYPING',
}

export interface DMMessagePayload {
  message_id: string;
  content: string;
  sender_handle?: string;
  timestamp: number;
}

export interface DMAckPayload {
  message_id: string;
}

export interface DMTypingPayload {
  typing: boolean;
}

export interface DMSignalMessage {
  type: DMSignalType;
  payload: DMMessagePayload | DMAckPayload | DMTypingPayload;
}

// ── Room Payloads (via GossipSub $402/rooms/v1) ─────────────────

export interface RoomChatPayload {
  room_id: string;
  message_id: string;
  content: string;
  sender_handle?: string;
  sender_peer_id: string;
  timestamp: number;
}

export interface RoomJoinPayload {
  room_id: string;
  peer_id: string;
  handle?: string;
}

export interface RoomLeavePayload {
  room_id: string;
  peer_id: string;
}

export interface RoomAnnouncePayload {
  room_id: string;
  name: string;
  room_type: 'text' | 'voice' | 'hybrid';
  access_type: 'public' | 'private' | 'token_gated';
  token_id?: string;
  creator_peer_id: string;
  capacity: number;
  description?: string;
}

// ── Room Voice Signaling (extends call protocol) ────────────────

export enum RoomVoiceSignalType {
  ROOM_OFFER = 'ROOM_OFFER',
  ROOM_ANSWER = 'ROOM_ANSWER',
  ROOM_ICE = 'ROOM_ICE',
}

export interface RoomVoiceOfferPayload {
  room_id: string;
  sdp: string;
  sender_peer_id: string;
}

export interface RoomVoiceAnswerPayload {
  room_id: string;
  sdp: string;
  sender_peer_id: string;
}

export interface RoomVoiceIcePayload {
  room_id: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  sender_peer_id: string;
}

export interface RoomVoiceSignalMessage {
  type: RoomVoiceSignalType;
  payload: RoomVoiceOfferPayload | RoomVoiceAnswerPayload | RoomVoiceIcePayload;
}

// ── Message Payloads ───────────────────────────────────────────────

export interface HelloPayload {
  node_id: string;
  version: string;
  capabilities: string[];
  tokens_count: number;
  listening_port: number;
}

export interface HelloAckPayload {
  node_id: string;
  version: string;
  accepted: boolean;
  reason?: string;
}

export interface PeerInfo {
  peer_id: string;
  host: string;
  port: number;
  last_seen: number;
  reputation: number;
}

export interface PeerListPayload {
  peers: PeerInfo[];
}

export interface AnnounceTokenPayload {
  token_id: string;
  name?: string;
  issuer_handle?: string;
  current_supply: number;
  current_price_sats: number;
  base_price_sats: number;
  pricing_model: string;
  content_preview?: string;
  verified: boolean;
  verify_txid?: string;
}

export interface RequestTokenPayload {
  token_id: string;
}

export interface TokenDataPayload {
  token_id: string;
  name?: string;
  description?: string;
  issuer_address?: string;
  issuer_handle?: string;
  base_price_sats: number;
  pricing_model: string;
  current_supply: number;
  max_supply?: number;
  issuer_share_bps: number;
  network_share_bps: number;
  content_type?: string;
  content_preview?: string;
  access_url?: string;
  holders_count: number;
  recent_transfers: TransferEventPayload[];
}

export interface TransferEventPayload {
  token_id: string;
  from_address?: string;
  to_address: string;
  amount: number;
  txid: string;
  block_height?: number;
  block_time?: number;
}

export interface HolderUpdatePayload {
  token_id: string;
  address: string;
  handle?: string;
  balance: number;
  verified_at?: number;
}

export interface ContentRequestPayload {
  token_id: string;
  requester_address: string;
  payment_txid?: string;
}

export interface ContentOfferPayload {
  token_id: string;
  content_hash: string;
  content_size: number;
  price_sats: number;
  server_address: string;
}

export interface PingPayload {
  timestamp: number;
  nonce: string;
}

export interface PongPayload {
  timestamp: number;
  nonce: string;
  request_timestamp: number;
}

export interface TicketStampPayload {
  token_id: string;
  address: string;
  path: string;
  timestamp: string;
  indexer_pubkey: string;
  indexer_signature: string;
}

export interface ChatPayload {
  token_id?: string;   // Optional: scoped to a token channel
  channel: string;     // e.g., 'global', '$alice', '$bob/chatroom'
  content: string;
  sender_handle?: string;
  sender_address: string;
  signature?: string;
  timestamp: number;
}

export interface BlockAnnouncePayload {
  hash: string;
  height: number;
  miner_address: string;
  timestamp: number;
  bits: number;
  target: string;        // Full 256-bit target hex
  merkle_root: string;
  prev_hash: string;
  nonce: number;
  version: number;
  item_count: number;
}

// ── Message Envelope ───────────────────────────────────────────────

export interface GossipMessage<T = unknown> {
  id: string;              // Unique message ID
  type: MessageType;
  version: string;
  sender_id: string;
  timestamp: number;
  ttl: number;             // Time to live in seconds
  hops: number;            // Number of hops so far
  payload: T;
  signature?: string;      // Optional signature for verification
}

// ── Message Factory ────────────────────────────────────────────────

export function createMessage<T>(
  type: MessageType,
  senderId: string,
  payload: T,
  ttl = MESSAGE_TTL
): GossipMessage<T> {
  return {
    id: randomBytes(16).toString('hex'),
    type,
    version: PROTOCOL_VERSION,
    sender_id: senderId,
    timestamp: Date.now(),
    ttl,
    hops: 0,
    payload
  };
}

export function createHello(nodeId: string, port: number, tokensCount: number): GossipMessage<HelloPayload> {
  return createMessage(MessageType.HELLO, nodeId, {
    node_id: nodeId,
    version: PROTOCOL_VERSION,
    capabilities: ['index', 'serve', 'gossip'],
    tokens_count: tokensCount,
    listening_port: port
  });
}

export function createHelloAck(nodeId: string, accepted: boolean, reason?: string): GossipMessage<HelloAckPayload> {
  return createMessage(MessageType.HELLO_ACK, nodeId, {
    node_id: nodeId,
    version: PROTOCOL_VERSION,
    accepted,
    reason
  });
}

export function createPeerListRequest(nodeId: string): GossipMessage<Record<string, never>> {
  return createMessage(MessageType.PEER_LIST_REQUEST, nodeId, {});
}

export function createPeerList(nodeId: string, peers: PeerInfo[]): GossipMessage<PeerListPayload> {
  return createMessage(MessageType.PEER_LIST, nodeId, { peers });
}

export function createAnnounceToken(nodeId: string, token: AnnounceTokenPayload): GossipMessage<AnnounceTokenPayload> {
  return createMessage(MessageType.ANNOUNCE_TOKEN, nodeId, token);
}

export function createRequestToken(nodeId: string, tokenId: string): GossipMessage<RequestTokenPayload> {
  return createMessage(MessageType.REQUEST_TOKEN, nodeId, { token_id: tokenId });
}

export function createTokenData(nodeId: string, data: TokenDataPayload): GossipMessage<TokenDataPayload> {
  return createMessage(MessageType.TOKEN_DATA, nodeId, data);
}

export function createTransferEvent(nodeId: string, transfer: TransferEventPayload): GossipMessage<TransferEventPayload> {
  return createMessage(MessageType.TRANSFER_EVENT, nodeId, transfer);
}

export function createHolderUpdate(nodeId: string, update: HolderUpdatePayload): GossipMessage<HolderUpdatePayload> {
  return createMessage(MessageType.HOLDER_UPDATE, nodeId, update);
}

export function createPing(nodeId: string): GossipMessage<PingPayload> {
  return createMessage(MessageType.PING, nodeId, {
    timestamp: Date.now(),
    nonce: randomBytes(8).toString('hex')
  }, 30); // Short TTL for ping
}

export function createPong(nodeId: string, ping: PingPayload): GossipMessage<PongPayload> {
  return createMessage(MessageType.PONG, nodeId, {
    timestamp: Date.now(),
    nonce: ping.nonce,
    request_timestamp: ping.timestamp
  }, 30);
}

export function createTicketStamp(nodeId: string, stamp: TicketStampPayload): GossipMessage<TicketStampPayload> {
  return createMessage(MessageType.TICKET_STAMP, nodeId, stamp);
}

export function createChatMessage(nodeId: string, chat: ChatPayload): GossipMessage<ChatPayload> {
  return createMessage(MessageType.CHAT_MESSAGE, nodeId, chat);
}

export function createBlockAnnounce(nodeId: string, block: BlockAnnouncePayload): GossipMessage<BlockAnnouncePayload> {
  return createMessage(MessageType.BLOCK_ANNOUNCE, nodeId, block);
}

// ── Message Validation ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMessage(msg: unknown): ValidationResult {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const m = msg as Record<string, unknown>;

  // Required fields
  if (!m.id || typeof m.id !== 'string') {
    return { valid: false, error: 'Missing or invalid id' };
  }

  if (!m.type || !Object.values(MessageType).includes(m.type as MessageType)) {
    return { valid: false, error: 'Missing or invalid type' };
  }

  if (!m.version || typeof m.version !== 'string') {
    return { valid: false, error: 'Missing or invalid version' };
  }

  if (!m.sender_id || typeof m.sender_id !== 'string') {
    return { valid: false, error: 'Missing or invalid sender_id' };
  }

  if (!m.timestamp || typeof m.timestamp !== 'number') {
    return { valid: false, error: 'Missing or invalid timestamp' };
  }

  if (typeof m.ttl !== 'number' || m.ttl < 0) {
    return { valid: false, error: 'Missing or invalid ttl' };
  }

  if (typeof m.hops !== 'number' || m.hops < 0) {
    return { valid: false, error: 'Missing or invalid hops' };
  }

  if (!m.payload || typeof m.payload !== 'object') {
    return { valid: false, error: 'Missing or invalid payload' };
  }

  // Check TTL hasn't expired
  const age = (Date.now() - (m.timestamp as number)) / 1000;
  if (age > (m.ttl as number)) {
    return { valid: false, error: 'Message expired (TTL exceeded)' };
  }

  // Check hops limit
  if ((m.hops as number) > MAX_HOPS) {
    return { valid: false, error: 'Max hops exceeded' };
  }

  return { valid: true };
}

export function validateTransferEvent(payload: TransferEventPayload): ValidationResult {
  if (!payload.token_id || typeof payload.token_id !== 'string') {
    return { valid: false, error: 'Missing token_id' };
  }

  if (!payload.to_address || typeof payload.to_address !== 'string') {
    return { valid: false, error: 'Missing to_address' };
  }

  if (typeof payload.amount !== 'number' || payload.amount <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (!payload.txid || typeof payload.txid !== 'string') {
    return { valid: false, error: 'Missing txid' };
  }

  // Basic txid format check (64 hex chars)
  if (!/^[a-fA-F0-9]{64}$/.test(payload.txid)) {
    return { valid: false, error: 'Invalid txid format' };
  }

  return { valid: true };
}

// ── Message Hashing ────────────────────────────────────────────────

export function hashMessage(msg: GossipMessage): string {
  const content = JSON.stringify({
    type: msg.type,
    sender_id: msg.sender_id,
    payload: msg.payload
  });
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

// ── Message Propagation ────────────────────────────────────────────

export function prepareForRelay(msg: GossipMessage): GossipMessage | null {
  // Don't relay if TTL expired or max hops reached
  const age = (Date.now() - msg.timestamp) / 1000;
  if (age > msg.ttl || msg.hops >= MAX_HOPS) {
    return null;
  }

  // Clone and increment hops
  return {
    ...msg,
    hops: msg.hops + 1
  };
}

// ── Serialization ──────────────────────────────────────────────────

export function serializeMessage(msg: GossipMessage): Buffer {
  const json = JSON.stringify(msg);
  if (json.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${json.length} > ${MAX_MESSAGE_SIZE}`);
  }
  return Buffer.from(json, 'utf-8');
}

export function deserializeMessage(data: Buffer): GossipMessage {
  if (data.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${data.length} > ${MAX_MESSAGE_SIZE}`);
  }

  const json = data.toString('utf-8');
  return JSON.parse(json) as GossipMessage;
}
