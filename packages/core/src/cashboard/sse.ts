/**
 * Cashboard SSE (Server-Sent Events) Manager
 *
 * Pushes real-time agent events to connected Cashboard clients.
 * Binds to Path402Agent EventEmitter and broadcasts structured events.
 */

import type { Response } from 'express';
import type { Path402Agent } from '../client/agent.js';
import type { SSEEvent, SSEEventType } from './types.js';

export class CashboardSSE {
  private clients: Set<Response> = new Set();
  private agent: Path402Agent;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private boundHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  constructor(agent: Path402Agent) {
    this.agent = agent;
    this.bindAgentEvents();
    this.startStatusBroadcast();
    this.startHeartbeat();
  }

  /** Register an Express response as an SSE client */
  addClient(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial status snapshot
    this.sendToClient(res, {
      type: 'status',
      timestamp: Date.now(),
      data: this.agent.getStatus(),
    });

    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: SSEEvent): void {
    for (const client of this.clients) {
      this.sendToClient(client, event);
    }
  }

  /** Number of connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  /** Clean up intervals and event listeners */
  destroy(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Unbind agent event listeners
    for (const { event, handler } of this.boundHandlers) {
      this.agent.removeListener(event, handler);
    }
    this.boundHandlers = [];

    // Close all client connections
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }

  // ── Private ─────────────────────────────────────────────────────

  private sendToClient(res: Response, event: SSEEvent): void {
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client disconnected, remove it
      this.clients.delete(res);
    }
  }

  private bindAgentEvents(): void {
    const eventMap: Array<[string, SSEEventType]> = [
      ['token:discovered', 'token:discovered'],
      ['acquired',         'token:acquired'],
      ['block_mined',      'block_mined'],
      ['mint_claimed',     'mint_claimed'],
      ['peers:updated',    'peers:updated'],
      ['marketplace:synced', 'marketplace:synced'],
      ['opportunity',      'opportunity'],
      ['error',            'error'],
    ];

    for (const [agentEvent, sseType] of eventMap) {
      const handler = (...args: unknown[]) => {
        this.broadcast({
          type: sseType,
          timestamp: Date.now(),
          data: args.length === 1 ? args[0] : args,
        });
      };
      this.agent.on(agentEvent, handler);
      this.boundHandlers.push({ event: agentEvent, handler });
    }
  }

  private startStatusBroadcast(): void {
    this.statusInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      this.broadcast({
        type: 'status',
        timestamp: Date.now(),
        data: this.agent.getStatus(),
      });
    }, 5000);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      this.broadcast({
        type: 'heartbeat',
        timestamp: Date.now(),
        data: { clients: this.clients.size },
      });
    }, 30000);
  }
}
