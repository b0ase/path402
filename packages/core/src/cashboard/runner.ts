/**
 * Cashboard Workflow Runner
 *
 * Walks a complete Cashboard workflow DAG, executing each actionable node
 * via the CashboardExecutor, following success/failure connection paths,
 * and persisting execution state to SQLite.
 *
 * Supports play (full run), pause/resume, and step (one node at a time).
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CashboardExecutor } from './executor.js';
import { CashboardSSE } from './sse.js';
import { NODE_ACTION_MAP } from './types.js';
import type {
  CashboardWorkflow,
  CashboardNode,
  CashboardConnection,
  CashboardActionableNodeType,
  AgentAction,
  ExecuteStepRequest,
  ExecuteStepResponse,
  WorkflowRunStatus,
  WorkflowRunnerConfig,
  SSEEventType,
} from './types.js';
import {
  createCashboardRun,
  updateCashboardRun,
  createCashboardStep,
  updateCashboardStep,
  getCashboardStepsByRun,
  getCashboardRun,
  getAllCashboardRuns,
  getActiveCashboardRun,
} from '../db/index.js';

const DEFAULT_CONFIG: WorkflowRunnerConfig = {
  rateLimitMs: 100,
  maxExecutionMs: 60_000,
  maxNodesPerRun: 100,
};

export class CashboardRunner extends EventEmitter {
  private executor: CashboardExecutor;
  private sse: CashboardSSE | null;
  private config: WorkflowRunnerConfig;

  // Per-run state
  private currentRunId: string | null = null;
  private workflow: CashboardWorkflow | null = null;
  private status: WorkflowRunStatus = 'pending';
  private paused = false;
  private resumeResolve: (() => void) | null = null;
  private startedAt = 0;

  // Graph state
  private adjacency: Map<string, CashboardConnection[]> = new Map();
  private reverseAdj: Map<string, string[]> = new Map();
  private nodeMap: Map<string, CashboardNode> = new Map();
  private completedNodes: Set<string> = new Set();
  private failedNodes: Set<string> = new Set();
  private inProgressNodes: Set<string> = new Set();
  private activatedNodes: Set<string> = new Set();
  private stepResults: Map<string, ExecuteStepResponse> = new Map();

  constructor(
    executor: CashboardExecutor,
    sse: CashboardSSE | null = null,
    config: Partial<WorkflowRunnerConfig> = {}
  ) {
    super();
    this.executor = executor;
    this.sse = sse;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Start a full workflow execution. Returns the run ID. */
  async run(workflow: CashboardWorkflow): Promise<string> {
    if (this.currentRunId && (this.status === 'running' || this.status === 'paused')) {
      throw new Error(`Run ${this.currentRunId} is already active`);
    }

    this.reset();
    this.workflow = workflow;
    this.currentRunId = randomUUID();
    this.startedAt = Date.now();
    this.status = 'running';

    this.buildGraph(workflow);

    // Find entry nodes and activate them
    const entryNodes = this.findEntryNodes();
    for (const nodeId of entryNodes) {
      this.activatedNodes.add(nodeId);
    }

    // Persist the run
    createCashboardRun({
      id: this.currentRunId,
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      node_count: workflow.nodes.length,
    });
    updateCashboardRun(this.currentRunId, { status: 'running' });

    this.broadcastEvent('workflow:started', {
      runId: this.currentRunId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      entryNodes,
    });

    // Run the loop asynchronously (don't await — caller gets runId immediately)
    const runId = this.currentRunId;
    this.processLoop().catch(err => {
      console.error('[CashboardRunner] processLoop error:', err);
      if (this.currentRunId === runId) {
        this.status = 'failed';
        updateCashboardRun(runId, {
          status: 'failed',
          finished_at: Math.floor(Date.now() / 1000),
          error: err instanceof Error ? err.message : String(err),
        });
        this.broadcastEvent('workflow:failed', { runId, error: String(err) });
      }
    });

    return runId;
  }

  /** Execute exactly one ready node, then pause. Returns the step result or null if nothing ready. */
  async step(runId: string): Promise<ExecuteStepResponse | null> {
    if (this.currentRunId !== runId) {
      throw new Error(`Run ${runId} is not the active run`);
    }

    // If this is a fresh run that hasn't started yet, initialize it
    if (this.status === 'pending') {
      throw new Error('Run has not been started. Use run() first.');
    }

    const readyNodes = this.getReadyNodes();
    if (readyNodes.length === 0) {
      return null;
    }

    // Execute just the first ready node
    const nodeId = readyNodes[0];
    const response = await this.executeNode(nodeId);

    // After stepping, check if we're done
    const nextReady = this.getReadyNodes();
    if (nextReady.length === 0 && this.inProgressNodes.size === 0) {
      this.status = 'completed';
      updateCashboardRun(this.currentRunId!, {
        status: 'completed',
        finished_at: Math.floor(Date.now() / 1000),
        completed_count: this.completedNodes.size,
      });
      this.broadcastEvent('workflow:completed', {
        runId: this.currentRunId,
        completedCount: this.completedNodes.size,
        failedCount: this.failedNodes.size,
      });
    }

    return response;
  }

  /** Pause the active run */
  pause(runId: string): void {
    if (this.currentRunId !== runId) return;
    this.paused = true;
  }

  /** Resume a paused run */
  resume(runId: string): void {
    if (this.currentRunId !== runId) return;
    this.paused = false;
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
  }

  /** Get status of a run (from DB) */
  getRunStatus(runId: string) {
    const run = getCashboardRun(runId);
    if (!run) return null;
    const steps = getCashboardStepsByRun(runId);
    return { run, steps };
  }

  /** List recent runs */
  listRuns(limit = 20) {
    return getAllCashboardRuns(limit);
  }

  /** Check if a run is currently active */
  isActive(): boolean {
    return this.status === 'running' || this.status === 'paused';
  }

  // ── Graph Building ───────────────────────────────────────────────

  private buildGraph(workflow: CashboardWorkflow): void {
    this.adjacency.clear();
    this.reverseAdj.clear();
    this.nodeMap.clear();

    // Index nodes
    for (const node of workflow.nodes) {
      this.nodeMap.set(node.id, node);
      this.adjacency.set(node.id, []);
      this.reverseAdj.set(node.id, []);
    }

    // Build edges
    for (const conn of workflow.connections) {
      const outgoing = this.adjacency.get(conn.source);
      if (outgoing) outgoing.push(conn);

      const incoming = this.reverseAdj.get(conn.target);
      if (incoming && !incoming.includes(conn.source)) {
        incoming.push(conn.source);
      }
    }
  }

  /** Find nodes with no incoming connections */
  private findEntryNodes(): string[] {
    const entries: string[] = [];
    for (const [nodeId, incoming] of this.reverseAdj) {
      if (incoming.length === 0) {
        entries.push(nodeId);
      }
    }
    return entries;
  }

  /**
   * Get nodes that are ready to execute:
   * - Must be in activatedNodes (reachable via a followed connection or entry node)
   * - All dependencies (incoming nodes) must be completed or failed
   * - Not already completed, failed, or in progress
   */
  private getReadyNodes(): string[] {
    const ready: string[] = [];
    for (const nodeId of this.activatedNodes) {
      if (this.completedNodes.has(nodeId)) continue;
      if (this.failedNodes.has(nodeId)) continue;
      if (this.inProgressNodes.has(nodeId)) continue;

      const deps = this.reverseAdj.get(nodeId) || [];
      const allDepsSettled = deps.every(
        dep => this.completedNodes.has(dep) || this.failedNodes.has(dep)
      );

      if (allDepsSettled) {
        ready.push(nodeId);
      }
    }
    return ready;
  }

  // ── Process Loop ─────────────────────────────────────────────────

  private async processLoop(): Promise<void> {
    while (true) {
      // Check pause
      if (this.paused) {
        this.status = 'paused';
        updateCashboardRun(this.currentRunId!, { status: 'paused' });
        this.broadcastEvent('workflow:paused', { runId: this.currentRunId });
        await new Promise<void>(resolve => {
          this.resumeResolve = resolve;
        });
        this.status = 'running';
        updateCashboardRun(this.currentRunId!, { status: 'running' });
      }

      // Check timeout
      if (Date.now() - this.startedAt > this.config.maxExecutionMs) {
        this.status = 'timed_out';
        updateCashboardRun(this.currentRunId!, {
          status: 'timed_out',
          finished_at: Math.floor(Date.now() / 1000),
          completed_count: this.completedNodes.size,
          error: `Execution timed out after ${this.config.maxExecutionMs}ms`,
        });
        this.broadcastEvent('workflow:failed', {
          runId: this.currentRunId,
          reason: 'timed_out',
        });
        return;
      }

      // Check max nodes
      if (this.completedNodes.size + this.failedNodes.size >= this.config.maxNodesPerRun) {
        this.status = 'failed';
        updateCashboardRun(this.currentRunId!, {
          status: 'failed',
          finished_at: Math.floor(Date.now() / 1000),
          completed_count: this.completedNodes.size,
          error: `Max nodes per run (${this.config.maxNodesPerRun}) exceeded`,
        });
        this.broadcastEvent('workflow:failed', {
          runId: this.currentRunId,
          reason: 'max_nodes_exceeded',
        });
        return;
      }

      const readyNodes = this.getReadyNodes();

      if (readyNodes.length === 0 && this.inProgressNodes.size === 0) {
        // Done — no more work
        this.status = 'completed';
        updateCashboardRun(this.currentRunId!, {
          status: 'completed',
          finished_at: Math.floor(Date.now() / 1000),
          completed_count: this.completedNodes.size,
        });
        this.broadcastEvent('workflow:completed', {
          runId: this.currentRunId,
          completedCount: this.completedNodes.size,
          failedCount: this.failedNodes.size,
        });
        return;
      }

      if (readyNodes.length === 0) {
        // Nodes still in progress, wait a tick
        await this.delay(50);
        continue;
      }

      // Execute all ready nodes in parallel
      await Promise.all(readyNodes.map(nodeId => this.executeNode(nodeId)));

      // Rate limit between batches
      await this.delay(this.config.rateLimitMs);
    }
  }

  // ── Node Execution ───────────────────────────────────────────────

  private async executeNode(nodeId: string): Promise<ExecuteStepResponse> {
    const node = this.nodeMap.get(nodeId)!;
    this.inProgressNodes.add(nodeId);

    const stepId = randomUUID();
    const startedAt = Math.floor(Date.now() / 1000);
    const action = this.resolveActionForNode(node);

    // Persist step as running
    createCashboardStep({
      id: stepId,
      run_id: this.currentRunId!,
      node_id: nodeId,
      action,
    });
    updateCashboardStep(stepId, { status: 'running', started_at: startedAt });

    this.broadcastEvent('workflow:step:started', {
      runId: this.currentRunId,
      stepId,
      nodeId,
      nodeName: node.name || node.id,
      action,
    });

    // Build the ExecuteStepRequest
    const outgoingConns = this.adjacency.get(nodeId) || [];
    const req: ExecuteStepRequest = {
      executionId: this.currentRunId!,
      workflowId: this.workflow!.id,
      node,
      connections: outgoingConns,
      params: (node.metadata ?? {}) as Record<string, unknown>,
    };

    let response: ExecuteStepResponse;
    try {
      response = await this.executor.execute(req);
    } catch (err) {
      // Executor threw — create a synthetic failure response
      const error = err instanceof Error ? err.message : String(err);
      response = {
        executionId: this.currentRunId!,
        nodeId,
        action: action as ExecuteStepResponse['action'],
        success: false,
        result: null,
        error,
        nextConnections: [],
        durationMs: (Date.now() / 1000 - startedAt) * 1000,
      };
    }

    const finishedAt = Math.floor(Date.now() / 1000);
    this.inProgressNodes.delete(nodeId);
    this.stepResults.set(nodeId, response);

    // Resolve next nodes from activated connections
    const nextNodeIds = this.resolveNextNodes(response, outgoingConns);
    for (const nextId of nextNodeIds) {
      this.activatedNodes.add(nextId);
    }

    if (response.success) {
      this.completedNodes.add(nodeId);

      updateCashboardStep(stepId, {
        status: 'completed',
        result_json: JSON.stringify(response.result),
        finished_at: finishedAt,
        duration_ms: response.durationMs,
      });
      updateCashboardRun(this.currentRunId!, {
        completed_count: this.completedNodes.size,
      });

      this.broadcastEvent('workflow:step:completed', {
        runId: this.currentRunId,
        stepId,
        nodeId,
        action: response.action,
        durationMs: response.durationMs,
      });
    } else {
      this.failedNodes.add(nodeId);

      updateCashboardStep(stepId, {
        status: 'failed',
        error: response.error,
        result_json: response.result ? JSON.stringify(response.result) : undefined,
        finished_at: finishedAt,
        duration_ms: response.durationMs,
      });

      this.broadcastEvent('workflow:step:failed', {
        runId: this.currentRunId,
        stepId,
        nodeId,
        error: response.error,
      });
    }

    return response;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /** Resolve the action string for a node (for DB logging before execution) */
  private resolveActionForNode(node: CashboardNode): string {
    const nodeType = node.type as CashboardActionableNodeType;
    return NODE_ACTION_MAP[nodeType] ?? 'noop';
  }

  /** Map connection IDs from nextConnections to their target node IDs */
  private resolveNextNodes(
    response: ExecuteStepResponse,
    outgoingConns: CashboardConnection[]
  ): string[] {
    const connIdToTarget = new Map<string, string>();
    for (const conn of outgoingConns) {
      connIdToTarget.set(conn.id, conn.target);
    }

    const nextNodeIds: string[] = [];
    for (const connId of response.nextConnections) {
      const target = connIdToTarget.get(connId);
      if (target && this.nodeMap.has(target)) {
        nextNodeIds.push(target);
      }
    }
    return nextNodeIds;
  }

  /** Broadcast an SSE event and emit locally */
  private broadcastEvent(type: SSEEventType, data: unknown): void {
    if (this.sse) {
      this.sse.broadcast({ type, timestamp: Date.now(), data });
    }
    this.emit(type, data);
  }

  /** Promise-based delay */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Reset all per-run state */
  private reset(): void {
    this.currentRunId = null;
    this.workflow = null;
    this.status = 'pending';
    this.paused = false;
    this.resumeResolve = null;
    this.startedAt = 0;
    this.adjacency.clear();
    this.reverseAdj.clear();
    this.nodeMap.clear();
    this.completedNodes.clear();
    this.failedNodes.clear();
    this.inProgressNodes.clear();
    this.activatedNodes.clear();
    this.stepResults.clear();
  }
}
