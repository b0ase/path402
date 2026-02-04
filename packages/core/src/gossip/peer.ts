/**
 * $402 Peer Connection Manager
 *
 * Manages TCP connections to other pathd nodes.
 * Handles connection lifecycle, message sending, and keepalive.
 */

import { createConnection, Socket, createServer, Server } from 'net';
import { EventEmitter } from 'events';
import {
  GossipMessage,
  MessageType,
  serializeMessage,
  deserializeMessage,
  validateMessage,
  createHello,
  createHelloAck,
  createPing,
  createPong,
  HelloPayload,
  PingPayload,
  GOSSIP_PORT
} from './protocol.js';
import {
  getNodeId,
  upsertPeer,
  updatePeerStatus,
  recordPeerMessage,
  banPeer,
  getAllTokens
} from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface PeerConnection {
  peerId: string;
  host: string;
  port: number;
  socket: Socket;
  state: 'connecting' | 'handshaking' | 'connected' | 'disconnected';
  connectedAt?: number;
  lastMessageAt?: number;
  inbound: boolean;
}

export interface PeerManagerEvents {
  'peer:connected': (peerId: string, conn: PeerConnection) => void;
  'peer:disconnected': (peerId: string) => void;
  'peer:message': (peerId: string, msg: GossipMessage) => void;
  'peer:error': (peerId: string, error: Error) => void;
}

// ── Peer Manager ───────────────────────────────────────────────────

export class PeerManager extends EventEmitter {
  private nodeId: string;
  private connections: Map<string, PeerConnection> = new Map();
  private server: Server | null = null;
  private port: number;
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(port = GOSSIP_PORT) {
    super();
    this.nodeId = getNodeId();
    this.port = port;
  }

  // ── Server ─────────────────────────────────────────────────────

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleInboundConnection(socket);
      });

      this.server.on('error', (err) => {
        console.error('[PeerManager] Server error:', err.message);
        reject(err);
      });

      this.server.listen(this.port, () => {
        console.log(`[PeerManager] Listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Close all connections
    for (const [peerId, conn] of this.connections) {
      this.disconnect(peerId);
    }
  }

  private handleInboundConnection(socket: Socket): void {
    const tempId = `inbound-${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[PeerManager] Inbound connection from ${tempId}`);

    const conn: PeerConnection = {
      peerId: tempId,
      host: socket.remoteAddress || 'unknown',
      port: socket.remotePort || 0,
      socket,
      state: 'handshaking',
      inbound: true
    };

    this.setupSocket(conn);
    this.connections.set(tempId, conn);

    // Wait for HELLO from peer
    setTimeout(() => {
      if (conn.state === 'handshaking') {
        console.log(`[PeerManager] Handshake timeout for ${tempId}`);
        this.disconnect(tempId);
      }
    }, 10000);
  }

  // ── Outbound Connections ───────────────────────────────────────

  async connect(host: string, port: number): Promise<string> {
    const peerId = `${host}:${port}`;

    // Don't connect to self
    if (port === this.port && (host === 'localhost' || host === '127.0.0.1')) {
      throw new Error('Cannot connect to self');
    }

    // Check if already connected
    if (this.connections.has(peerId)) {
      const existing = this.connections.get(peerId)!;
      if (existing.state === 'connected') {
        return peerId;
      }
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port }, () => {
        console.log(`[PeerManager] Connected to ${peerId}`);

        const conn: PeerConnection = {
          peerId,
          host,
          port,
          socket,
          state: 'handshaking',
          inbound: false
        };

        this.connections.set(peerId, conn);
        this.setupSocket(conn);

        // Send HELLO
        const tokensCount = getAllTokens().length;
        const hello = createHello(this.nodeId, this.port, tokensCount);
        this.sendMessage(peerId, hello);

        // Wait for HELLO_ACK
        const timeout = setTimeout(() => {
          if (conn.state === 'handshaking') {
            reject(new Error('Handshake timeout'));
            this.disconnect(peerId);
          }
        }, 10000);

        const checkConnected = () => {
          if (conn.state === 'connected') {
            clearTimeout(timeout);
            resolve(peerId);
          } else {
            setTimeout(checkConnected, 100);
          }
        };
        checkConnected();
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  disconnect(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (!conn) return;

    // Clear ping interval
    const pingInterval = this.pingIntervals.get(peerId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(peerId);
    }

    conn.state = 'disconnected';
    conn.socket.destroy();
    this.connections.delete(peerId);

    updatePeerStatus(peerId, 'stale');
    this.emit('peer:disconnected', peerId);

    console.log(`[PeerManager] Disconnected from ${peerId}`);
  }

  // ── Socket Handling ────────────────────────────────────────────

  private setupSocket(conn: PeerConnection): void {
    let buffer = Buffer.alloc(0);

    conn.socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Try to parse complete messages (newline delimited)
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const messageData = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        try {
          const msg = deserializeMessage(messageData);
          this.handleMessage(conn, msg);
        } catch (err) {
          console.error(`[PeerManager] Failed to parse message from ${conn.peerId}:`, err);
          recordPeerMessage(conn.peerId, false);
        }
      }
    });

    conn.socket.on('close', () => {
      if (conn.state !== 'disconnected') {
        this.disconnect(conn.peerId);
      }
    });

    conn.socket.on('error', (err) => {
      console.error(`[PeerManager] Socket error for ${conn.peerId}:`, err.message);
      this.emit('peer:error', conn.peerId, err);
    });
  }

  // ── Message Handling ───────────────────────────────────────────

  private handleMessage(conn: PeerConnection, msg: GossipMessage): void {
    // Validate message structure
    const validation = validateMessage(msg);
    if (!validation.valid) {
      console.warn(`[PeerManager] Invalid message from ${conn.peerId}: ${validation.error}`);
      recordPeerMessage(conn.peerId, false);
      return;
    }

    conn.lastMessageAt = Date.now();
    recordPeerMessage(conn.peerId, true);

    // Handle based on message type
    switch (msg.type) {
      case MessageType.HELLO:
        this.handleHello(conn, msg as GossipMessage<HelloPayload>);
        break;

      case MessageType.HELLO_ACK:
        this.handleHelloAck(conn, msg);
        break;

      case MessageType.PING:
        this.handlePing(conn, msg as GossipMessage<PingPayload>);
        break;

      case MessageType.PONG:
        // Just updates lastMessageAt, which we already did
        break;

      default:
        // Emit for other handlers
        this.emit('peer:message', conn.peerId, msg);
    }
  }

  private handleHello(conn: PeerConnection, msg: GossipMessage<HelloPayload>): void {
    const payload = msg.payload;
    console.log(`[PeerManager] Received HELLO from ${payload.node_id} (v${payload.version})`);

    // Update peer ID to real node ID
    const oldId = conn.peerId;
    conn.peerId = payload.node_id;

    if (oldId !== conn.peerId) {
      this.connections.delete(oldId);
      this.connections.set(conn.peerId, conn);
    }

    // Store peer info
    upsertPeer({
      peer_id: conn.peerId,
      host: conn.host,
      port: payload.listening_port,
      status: 'active',
      discovered_via: conn.inbound ? 'inbound' : 'outbound'
    });

    // Send HELLO_ACK
    const ack = createHelloAck(this.nodeId, true);
    this.sendMessage(conn.peerId, ack);

    // If this was inbound, we also need to send our HELLO
    if (conn.inbound) {
      const tokensCount = getAllTokens().length;
      const hello = createHello(this.nodeId, this.port, tokensCount);
      this.sendMessage(conn.peerId, hello);
    }

    conn.state = 'connected';
    conn.connectedAt = Date.now();

    this.startPingInterval(conn.peerId);
    this.emit('peer:connected', conn.peerId, conn);
  }

  private handleHelloAck(conn: PeerConnection, msg: GossipMessage): void {
    console.log(`[PeerManager] Received HELLO_ACK from ${msg.sender_id}`);

    // Update peer ID
    if (conn.peerId !== msg.sender_id) {
      const oldId = conn.peerId;
      conn.peerId = msg.sender_id;
      this.connections.delete(oldId);
      this.connections.set(conn.peerId, conn);

      upsertPeer({
        peer_id: conn.peerId,
        host: conn.host,
        port: conn.port,
        status: 'active',
        discovered_via: 'outbound'
      });
    }

    conn.state = 'connected';
    conn.connectedAt = Date.now();

    this.startPingInterval(conn.peerId);
    this.emit('peer:connected', conn.peerId, conn);
  }

  private handlePing(conn: PeerConnection, msg: GossipMessage<PingPayload>): void {
    const pong = createPong(this.nodeId, msg.payload);
    this.sendMessage(conn.peerId, pong);
  }

  // ── Keepalive ──────────────────────────────────────────────────

  private startPingInterval(peerId: string): void {
    // Clear existing interval
    const existing = this.pingIntervals.get(peerId);
    if (existing) clearInterval(existing);

    // Ping every 30 seconds
    const interval = setInterval(() => {
      const conn = this.connections.get(peerId);
      if (!conn || conn.state !== 'connected') {
        clearInterval(interval);
        this.pingIntervals.delete(peerId);
        return;
      }

      // Check if peer has been silent too long
      const silentTime = Date.now() - (conn.lastMessageAt || conn.connectedAt || 0);
      if (silentTime > 120000) { // 2 minutes
        console.log(`[PeerManager] Peer ${peerId} silent for ${silentTime}ms, disconnecting`);
        this.disconnect(peerId);
        return;
      }

      const ping = createPing(this.nodeId);
      this.sendMessage(peerId, ping);
    }, 30000);

    this.pingIntervals.set(peerId, interval);
  }

  // ── Sending ────────────────────────────────────────────────────

  sendMessage(peerId: string, msg: GossipMessage): boolean {
    const conn = this.connections.get(peerId);
    if (!conn) {
      console.warn(`[PeerManager] Cannot send to unknown peer ${peerId}`);
      return false;
    }

    try {
      const data = serializeMessage(msg);
      conn.socket.write(data);
      conn.socket.write('\n'); // Newline delimiter
      return true;
    } catch (err) {
      console.error(`[PeerManager] Failed to send to ${peerId}:`, err);
      return false;
    }
  }

  broadcast(msg: GossipMessage, exclude?: string[]): number {
    let sent = 0;
    for (const [peerId, conn] of this.connections) {
      if (conn.state !== 'connected') continue;
      if (exclude?.includes(peerId)) continue;

      if (this.sendMessage(peerId, msg)) {
        sent++;
      }
    }
    return sent;
  }

  // ── Getters ────────────────────────────────────────────────────

  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === 'connected')
      .map(([peerId]) => peerId);
  }

  getPeerCount(): number {
    return this.getConnectedPeers().length;
  }

  isConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return conn?.state === 'connected';
  }

  getConnection(peerId: string): PeerConnection | undefined {
    return this.connections.get(peerId);
  }
}
