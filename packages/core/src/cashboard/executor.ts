/**
 * Cashboard Workflow Step Executor
 *
 * Accepts a Cashboard node, resolves the appropriate $402 agent action,
 * dispatches to existing service functions, and returns structured results.
 */

import type { Path402Agent } from '../client/agent.js';
import type {
  AgentAction,
  CashboardActionableNodeType,
  ExecuteStepRequest,
  ExecuteStepResponse,
} from './types.js';
import { NODE_ACTION_MAP } from './types.js';

// Service imports — lazy to avoid circular deps at module load
import { discover } from '../services/client.js';
import { evaluateBudget, getPortfolioSummary, getServableTokens, getAddress, getPublicKey, getServeHistory, getServeStats } from '../services/wallet.js';
import { explainEconomics, generatePriceSchedule, estimateROI, calculateBreakeven, calculateTotalRevenue } from '../services/pricing.js';
import { getTokenStats, initDatabase, getHolders, getRecentTransfers, verifyTokenOwnership } from '../services/database.js';
import { chainAgents, discoverAgent, fetchAgentRegistry } from '../services/x402.js';
import { verifyDomainDns, resolvePaymentAddress } from '../services/dns.js';

export class CashboardExecutor {
  private agent: Path402Agent;

  constructor(agent: Path402Agent) {
    this.agent = agent;
  }

  /** Execute a single workflow step */
  async execute(req: ExecuteStepRequest): Promise<ExecuteStepResponse> {
    const start = Date.now();
    const action = this.resolveAction(req);

    try {
      const result = await this.dispatch(action, req);

      return {
        executionId: req.executionId,
        nodeId: req.node.id,
        action,
        success: true,
        result,
        nextConnections: this.pickConnections(req.connections, true),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        executionId: req.executionId,
        nodeId: req.node.id,
        action,
        success: false,
        result: null,
        error,
        nextConnections: this.pickConnections(req.connections, false),
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Action Resolution ───────────────────────────────────────────

  /**
   * Resolution order:
   *   1. Explicit `action` field on the request
   *   2. `metadata.action` on the node
   *   3. NODE_ACTION_MAP[type]
   *   4. 'noop'
   */
  private resolveAction(req: ExecuteStepRequest): AgentAction {
    if (req.action) return req.action;

    const metaAction = req.node.metadata?.action;
    if (typeof metaAction === 'string' && metaAction in NODE_ACTION_MAP) {
      return metaAction as AgentAction;
    }

    const nodeType = req.node.type as CashboardActionableNodeType;
    return NODE_ACTION_MAP[nodeType] ?? 'noop';
  }

  // ── Dispatch ────────────────────────────────────────────────────

  private async dispatch(action: AgentAction, req: ExecuteStepRequest): Promise<unknown> {
    const params = req.params ?? {};
    const url = (params.url as string) ?? (req.node.metadata?.url as string) ?? '';

    switch (action) {
      case 'get_status':
        return this.agent.getStatus();

      case 'wallet_status':
        return getPortfolioSummary();

      case 'discover': {
        if (!url) return { info: 'No URL provided — skipping discover' };
        return discover(url);
      }

      case 'evaluate': {
        if (!url) return { info: 'No URL provided — skipping evaluate' };
        const response = await discover(url);
        const maxPrice = (params.max_price as number) ?? 10000;
        return evaluateBudget(response, maxPrice);
      }

      case 'acquire': {
        // Safety: acquire only evaluates in this foundation layer.
        // Full acquisition is gated for a later phase.
        if (!url) return { info: 'No URL provided — skipping acquire' };
        const response = await discover(url);
        const maxPrice = (params.max_price as number) ?? 10000;
        const evaluation = evaluateBudget(response, maxPrice);
        return {
          ...evaluation,
          _note: 'Acquire is evaluate-only in bridge v1. Full acquisition gated for later phase.',
        };
      }

      case 'serve':
        return { servable: getServableTokens() };

      case 'token_stats': {
        try {
          initDatabase();
          const stats = await getTokenStats();
          return stats ?? { info: 'Token stats unavailable — check database config' };
        } catch {
          return { info: 'Token stats unavailable — database not configured' };
        }
      }

      case 'batch_discover': {
        const urls = (params.urls as string[]) ?? [];
        if (urls.length === 0) return { info: 'No URLs provided for batch discover' };
        const results = await Promise.allSettled(
          urls.map(u => discover(u))
        );
        return results.map((r, i) => ({
          url: urls[i],
          ...(r.status === 'fulfilled'
            ? { success: true, data: r.value }
            : { success: false, error: r.reason?.message ?? String(r.reason) }),
        }));
      }

      case 'x402_chain': {
        const prompt = (params.prompt as string) ?? '';
        if (!prompt) return { info: 'No prompt provided for x402 chain' };
        const budget = (params.max_total_budget as number) ?? 50000;
        return chainAgents(prompt, budget);
      }

      case 'economics': {
        if (!url) return { info: 'No URL provided — skipping economics' };
        const response = await discover(url);
        return explainEconomics(
          response.pricing,
          response.revenue,
          response.currentSupply + 1,
          (params.projected_supply as number) ?? 1000
        );
      }

      case 'mining_status': {
        const status = this.agent.getStatus();
        return { mining: status.mining, uptime: status.uptime, nodeId: status.nodeId };
      }

      case 'relay_health': {
        const relay = this.agent.getRelayService?.();
        if (!relay) return { info: 'Relay service not available' };
        return relay.health();
      }

      case 'marketplace_data': {
        const bridge = this.agent.getMarketplaceBridge?.();
        if (!bridge) return { info: 'Marketplace bridge not available' };
        return bridge.getData();
      }

      case 'dns_verify': {
        const domain = (params.domain as string) ?? '';
        const code = (params.code as string) ?? '';
        if (!domain) return { info: 'No domain provided — skipping dns_verify' };
        if (code) {
          return verifyDomainDns(domain, code);
        }
        return resolvePaymentAddress(domain);
      }

      case 'network_peers': {
        const status = this.agent.getStatus();
        const relay = this.agent.getRelayService?.();
        return {
          peers: status.peers,
          relay: relay ? await relay.health() : null,
        };
      }

      case 'wallet_identity': {
        return {
          address: getAddress(),
          publicKey: getPublicKey(),
          serveHistory: getServeHistory(),
          serveStats: getServeStats(),
          portfolio: getPortfolioSummary(),
        };
      }

      case 'price_analysis': {
        if (!url) return { info: 'No URL provided — skipping price_analysis' };
        const response = await discover(url);
        const buyerPosition = (params.buyer_position as number) ?? response.currentSupply + 1;
        const projectedSupply = (params.projected_supply as number) ?? 1000;
        return {
          schedule: generatePriceSchedule(response.pricing),
          roi: estimateROI(response.pricing, response.revenue, buyerPosition, projectedSupply),
          breakeven: calculateBreakeven(response.pricing, response.revenue, buyerPosition),
          totalRevenue: calculateTotalRevenue(response.pricing, response.revenue, buyerPosition, projectedSupply),
        };
      }

      case 'holders_data': {
        try {
          initDatabase();
          const address = (params.address as string) ?? '';
          if (address) {
            return { ownership: await verifyTokenOwnership(address) };
          }
          return {
            holders: await getHolders(),
            recentTransfers: await getRecentTransfers(),
          };
        } catch {
          return { info: 'Holder data unavailable — database not configured' };
        }
      }

      case 'x402_discover': {
        if (url) {
          return discoverAgent(url);
        }
        return fetchAgentRegistry();
      }

      case 'noop':
      default:
        return {
          nodeId: req.node.id,
          nodeType: req.node.type,
          action: 'noop',
          info: 'Visual-only node — no $402 action',
        };
    }
  }

  // ── Connection Routing ──────────────────────────────────────────

  /**
   * Pick which connections to follow based on success/failure.
   * - If connections have conditionType, filter by 'success'/'failure'
   * - Otherwise return all connections (default path)
   */
  private pickConnections(
    connections: ExecuteStepRequest['connections'],
    success: boolean
  ): string[] {
    const matchType = success ? 'success' : 'failure';

    // Check if any connections have conditionType set
    const hasConditions = connections.some(c => c.conditionType);

    if (hasConditions) {
      // Return connections matching the outcome, plus any 'default' ones
      return connections
        .filter(c => c.conditionType === matchType || c.conditionType === 'default')
        .map(c => c.id);
    }

    // No conditions — return all connections (always follow)
    return connections.map(c => c.id);
  }
}
