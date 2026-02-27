/**
 * Cashboard ↔ $402 Agent Bridge — Protocol Types
 *
 * Shared contract between the Cashboard visual workflow canvas
 * and the $402 agent REST API.
 */

// ── Node Types ──────────────────────────────────────────────────

/** Cashboard node types that map to $402 agent actions */
export type CashboardActionableNodeType =
  | 'payment'
  | 'wallets'
  | 'instrument'
  | 'api'
  | 'webhook'
  | 'trigger'
  | 'ai-agent'
  | 'condition'
  | 'function'
  | 'service'
  | 'database'
  // Mining & production
  | 'mint'
  | 'counter'
  | 'production'
  // Network & comms
  | 'gateway'
  | 'router'
  | 'discord'
  | 'telegram'
  // Marketplace & CRM
  | 'salesforce'
  | 'hubspot'
  | 'stripe'
  // Analytics & pricing
  | 'calculator'
  | 'finance'
  | 'aggregator'
  // Validation
  | 'validator'
  // Data filtering
  | 'filter'
  | 'sorter'
  // Identity
  | 'contact'
  // AI platforms
  | 'replicate'
  | 'huggingface'
  // Queue
  | 'queue';

// ── Agent Actions ───────────────────────────────────────────────

/** $402 operations the executor can dispatch */
export type AgentAction =
  | 'discover'
  | 'evaluate'
  | 'acquire'
  | 'serve'
  | 'wallet_status'
  | 'token_stats'
  | 'batch_discover'
  | 'get_status'
  | 'x402_chain'
  | 'economics'
  | 'mining_status'
  | 'relay_health'
  | 'marketplace_data'
  | 'dns_verify'
  | 'network_peers'
  | 'wallet_identity'
  | 'price_analysis'
  | 'holders_data'
  | 'x402_discover'
  | 'noop';

/** Default mapping from Cashboard node type → agent action */
export const NODE_ACTION_MAP: Record<CashboardActionableNodeType, AgentAction> = {
  // Original mappings
  payment:      'acquire',
  wallets:      'wallet_status',
  instrument:   'discover',
  api:          'discover',
  webhook:      'batch_discover',
  trigger:      'get_status',
  'ai-agent':   'x402_chain',
  condition:    'evaluate',
  function:     'economics',
  service:      'serve',
  database:     'token_stats',
  // Mining & production → mining_status
  mint:         'mining_status',
  counter:      'mining_status',
  production:   'mining_status',
  // Network & comms → network_peers
  gateway:      'network_peers',
  router:       'network_peers',
  discord:      'network_peers',
  telegram:     'network_peers',
  // Marketplace & CRM → marketplace_data
  salesforce:   'marketplace_data',
  hubspot:      'marketplace_data',
  stripe:       'marketplace_data',
  // Analytics & pricing → price_analysis
  calculator:   'price_analysis',
  finance:      'price_analysis',
  aggregator:   'price_analysis',
  // Validation → dns_verify
  validator:    'dns_verify',
  // Data filtering → holders_data
  filter:       'holders_data',
  sorter:       'holders_data',
  // Identity → wallet_identity
  contact:      'wallet_identity',
  // AI platforms → x402_discover
  replicate:    'x402_discover',
  huggingface:  'x402_discover',
  // Queue → relay_health
  queue:        'relay_health',
};

/** All actions the executor supports (for introspection) */
export const AVAILABLE_ACTIONS: AgentAction[] = [
  'discover',
  'evaluate',
  'acquire',
  'serve',
  'wallet_status',
  'token_stats',
  'batch_discover',
  'get_status',
  'x402_chain',
  'economics',
  'mining_status',
  'relay_health',
  'marketplace_data',
  'dns_verify',
  'network_peers',
  'wallet_identity',
  'price_analysis',
  'holders_data',
  'x402_discover',
  'noop',
];

// ── Execute Step ────────────────────────────────────────────────

/** A Cashboard node as sent to the executor */
export interface CashboardNode {
  id: string;
  type: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/** A connection between two Cashboard nodes */
export interface CashboardConnection {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** 'success' | 'failure' | 'default' */
  conditionType?: string;
}

/** What Cashboard sends to POST /api/cashboard/execute */
export interface ExecuteStepRequest {
  executionId: string;
  workflowId: string;
  node: CashboardNode;
  connections: CashboardConnection[];
  /** Override the default action from NODE_ACTION_MAP */
  action?: AgentAction;
  /** Params passed to the agent action */
  params?: Record<string, unknown>;
}

/** What the agent returns from POST /api/cashboard/execute */
export interface ExecuteStepResponse {
  executionId: string;
  nodeId: string;
  action: AgentAction;
  success: boolean;
  result: unknown;
  error?: string;
  /** Connection IDs to follow next (success or failure path) */
  nextConnections: string[];
  durationMs: number;
}

// ── Workflow Types ───────────────────────────────────────────────

/** A complete Cashboard workflow definition */
export interface CashboardWorkflow {
  id: string;
  name: string;
  nodes: CashboardNode[];
  connections: CashboardConnection[];
}

/** Status of a workflow run */
export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'timed_out';

/** Status of a single step within a run */
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/** Persisted record of a workflow run */
export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: WorkflowRunStatus;
  started_at: number;
  finished_at: number | null;
  node_count: number;
  completed_count: number;
  error: string | null;
}

/** Persisted record of a single step execution */
export interface WorkflowStep {
  id: string;
  run_id: string;
  node_id: string;
  action: string;
  status: WorkflowStepStatus;
  result_json: string | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
}

/** Configuration for the workflow runner */
export interface WorkflowRunnerConfig {
  /** Delay between node execution batches in ms (default: 100) */
  rateLimitMs: number;
  /** Max total execution time in ms (default: 60000) */
  maxExecutionMs: number;
  /** Max nodes a single run can execute (default: 100) */
  maxNodesPerRun: number;
}

// ── SSE Events ──────────────────────────────────────────────────

export type SSEEventType =
  | 'status'
  | 'token:discovered'
  | 'token:acquired'
  | 'block_mined'
  | 'mint_claimed'
  | 'peers:updated'
  | 'marketplace:synced'
  | 'opportunity'
  | 'error'
  | 'heartbeat'
  // Workflow runner events
  | 'workflow:started'
  | 'workflow:step:started'
  | 'workflow:step:completed'
  | 'workflow:step:failed'
  | 'workflow:paused'
  | 'workflow:completed'
  | 'workflow:failed';

export interface SSEEvent {
  type: SSEEventType;
  timestamp: number;
  data: unknown;
}
