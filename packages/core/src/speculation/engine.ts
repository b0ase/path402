/**
 * $402 Speculation Engine
 *
 * Autonomous token acquisition and portfolio management.
 * Uses AI intelligence to evaluate opportunities and make decisions.
 */

import { EventEmitter } from 'events';
import {
  IntelligenceProvider,
  TokenEvaluation,
  MarketContext
} from '../intelligence/provider.js';
import {
  getToken,
  getAllTokens,
  getHolding,
  getAllHoldings,
  upsertHolding,
  getPortfolio,
  getPortfolioSummary,
  getSpeculationOpportunities,
  recordAIDecision,
  getConfig,
  setConfig,
  Token
} from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface SpeculationStrategy {
  name: string;

  // Entry conditions
  minScore: number;           // Minimum AI score to consider
  minConfidence: number;      // Minimum AI confidence
  maxSupply: number;          // Only consider tokens below this supply
  maxPrice: number;           // Maximum price in SAT

  // Position sizing
  positionSizePercent: number; // % of budget per position
  maxPositions: number;        // Maximum concurrent positions

  // Risk management
  maxExposurePercent: number;  // Max % of portfolio in speculation
  takeProfitMultiple: number;  // Exit at Nx return
  stopLossPercent: number;     // Exit at -X% loss
}

export interface SpeculationConfig {
  enabled: boolean;
  autoAcquire: boolean;
  budgetSats: number;
  strategy: SpeculationStrategy;
  provider: IntelligenceProvider;
}

export interface SpeculationEvents {
  'opportunity': (token: Token, evaluation: TokenEvaluation) => void;
  'acquire': (tokenId: string, price: number, reason: string) => void;
  'skip': (tokenId: string, reason: string) => void;
  'error': (error: Error) => void;
}

// ── Default Strategies ─────────────────────────────────────────────

export const STRATEGIES: Record<string, SpeculationStrategy> = {
  conservative: {
    name: 'conservative',
    minScore: 75,
    minConfidence: 0.8,
    maxSupply: 50,
    maxPrice: 5000,
    positionSizePercent: 5,
    maxPositions: 5,
    maxExposurePercent: 20,
    takeProfitMultiple: 2,
    stopLossPercent: 30
  },

  early_adopter: {
    name: 'early_adopter',
    minScore: 60,
    minConfidence: 0.6,
    maxSupply: 20,
    maxPrice: 10000,
    positionSizePercent: 10,
    maxPositions: 10,
    maxExposurePercent: 40,
    takeProfitMultiple: 3,
    stopLossPercent: 50
  },

  aggressive: {
    name: 'aggressive',
    minScore: 50,
    minConfidence: 0.5,
    maxSupply: 100,
    maxPrice: 20000,
    positionSizePercent: 15,
    maxPositions: 20,
    maxExposurePercent: 60,
    takeProfitMultiple: 5,
    stopLossPercent: 70
  }
};

// ── Speculation Engine ─────────────────────────────────────────────

export class SpeculationEngine extends EventEmitter {
  private config: SpeculationConfig;
  private running = false;
  private evaluationQueue: string[] = [];
  private evaluationInProgress = false;

  constructor(config: Partial<SpeculationConfig> & { provider: IntelligenceProvider }) {
    super();

    const savedEnabled = getConfig('speculation_enabled');
    const savedBudget = getConfig('max_speculation_budget_sats');

    this.config = {
      enabled: savedEnabled === 'true',
      autoAcquire: config.autoAcquire ?? false,
      budgetSats: parseInt(savedBudget || '100000'),
      strategy: config.strategy ?? STRATEGIES.early_adopter,
      provider: config.provider
    };
  }

  // ── Configuration ──────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    setConfig('speculation_enabled', enabled ? 'true' : 'false');
  }

  setBudget(sats: number): void {
    this.config.budgetSats = sats;
    setConfig('max_speculation_budget_sats', sats.toString());
  }

  setStrategy(strategy: SpeculationStrategy | string): void {
    if (typeof strategy === 'string') {
      this.config.strategy = STRATEGIES[strategy] ?? STRATEGIES.early_adopter;
    } else {
      this.config.strategy = strategy;
    }
  }

  setAutoAcquire(auto: boolean): void {
    this.config.autoAcquire = auto;
    setConfig('auto_acquire', auto ? 'true' : 'false');
  }

  // ── Market Context ─────────────────────────────────────────────

  private getMarketContext(): MarketContext {
    const tokens = getAllTokens();
    const supplies = tokens.map(t => t.current_supply);
    const prices = tokens.map(t => Math.ceil(t.base_price_sats / Math.sqrt(t.current_supply + 1)));

    return {
      totalTokensKnown: tokens.length,
      averageSupply: supplies.length > 0 ? Math.round(supplies.reduce((a, b) => a + b, 0) / supplies.length) : 0,
      averagePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      trendingTokens: [],  // TODO: Implement trending detection
      recentTransfers: 0   // TODO: Count recent transfers
    };
  }

  // ── Evaluation ─────────────────────────────────────────────────

  async evaluateToken(tokenId: string): Promise<TokenEvaluation | null> {
    const token = getToken(tokenId);
    if (!token) {
      console.warn(`[Speculation] Token not found: ${tokenId}`);
      return null;
    }

    const holding = getHolding(tokenId);
    const context = this.getMarketContext();

    try {
      const evaluation = await this.config.provider.evaluateToken(token, holding, context);

      // Record the decision
      recordAIDecision({
        token_id: tokenId,
        decision_type: 'evaluate',
        recommendation: evaluation.recommendation,
        ai_provider: this.config.provider.name,
        ai_model: this.config.provider.model,
        ai_score: evaluation.score,
        ai_confidence: evaluation.confidence,
        ai_reasoning: evaluation.reasoning,
        token_supply: token.current_supply,
        token_price_sats: Math.ceil(token.base_price_sats / Math.sqrt(token.current_supply + 1)),
        action_taken: null,
        price_at_action: null
      });

      return evaluation;
    } catch (error) {
      console.error(`[Speculation] Evaluation failed for ${tokenId}:`, error);
      this.emit('error', error as Error);
      return null;
    }
  }

  async evaluateOpportunities(): Promise<TokenEvaluation[]> {
    const opportunities = getSpeculationOpportunities();
    const strategy = this.config.strategy;

    // Filter by strategy criteria
    const candidates = opportunities.filter(o =>
      o.current_supply <= strategy.maxSupply &&
      o.current_price_sats <= strategy.maxPrice
    );

    const evaluations: TokenEvaluation[] = [];

    for (const candidate of candidates.slice(0, 10)) { // Limit to 10 at a time
      const evaluation = await this.evaluateToken(candidate.token_id);
      if (evaluation) {
        evaluations.push(evaluation);

        // Emit opportunity if it meets criteria
        if (evaluation.score >= strategy.minScore &&
            evaluation.confidence >= strategy.minConfidence) {
          const token = getToken(candidate.token_id);
          if (token) {
            this.emit('opportunity', token, evaluation);
          }
        }
      }
    }

    return evaluations;
  }

  // ── Acquisition ────────────────────────────────────────────────

  shouldAcquire(evaluation: TokenEvaluation): { should: boolean; reason: string } {
    const strategy = this.config.strategy;
    const summary = getPortfolioSummary();

    // Check if speculation is enabled
    if (!this.config.enabled) {
      return { should: false, reason: 'Speculation disabled' };
    }

    // Check AI recommendation
    if (evaluation.recommendation !== 'acquire') {
      return { should: false, reason: `AI recommends: ${evaluation.recommendation}` };
    }

    // Check score threshold
    if (evaluation.score < strategy.minScore) {
      return { should: false, reason: `Score ${evaluation.score} below minimum ${strategy.minScore}` };
    }

    // Check confidence threshold
    if (evaluation.confidence < strategy.minConfidence) {
      return { should: false, reason: `Confidence ${evaluation.confidence} below minimum ${strategy.minConfidence}` };
    }

    // Check position count
    const speculativeHoldings = getAllHoldings().filter(h => h.is_speculative && h.balance > 0);
    if (speculativeHoldings.length >= strategy.maxPositions) {
      return { should: false, reason: `Max positions (${strategy.maxPositions}) reached` };
    }

    // Check exposure limit
    const exposurePercent = (summary.totalSpent / this.config.budgetSats) * 100;
    if (exposurePercent >= strategy.maxExposurePercent) {
      return { should: false, reason: `Max exposure (${strategy.maxExposurePercent}%) reached` };
    }

    // Check price vs max
    if (evaluation.maxPrice > strategy.maxPrice) {
      return { should: false, reason: `Price ${evaluation.maxPrice} exceeds strategy max ${strategy.maxPrice}` };
    }

    return { should: true, reason: evaluation.reasoning };
  }

  calculatePositionSize(evaluation: TokenEvaluation): number {
    const strategy = this.config.strategy;
    const summary = getPortfolioSummary();

    // Base position size
    const baseSize = Math.floor(this.config.budgetSats * (strategy.positionSizePercent / 100));

    // Adjust by confidence
    const confidenceAdjusted = Math.floor(baseSize * evaluation.confidence);

    // Don't exceed remaining exposure limit
    const currentExposure = summary.totalSpent;
    const maxExposure = this.config.budgetSats * (strategy.maxExposurePercent / 100);
    const remainingExposure = Math.max(0, maxExposure - currentExposure);

    return Math.min(confidenceAdjusted, remainingExposure, evaluation.maxPrice);
  }

  async acquire(tokenId: string, maxPrice: number): Promise<boolean> {
    const token = getToken(tokenId);
    if (!token) {
      console.warn(`[Speculation] Cannot acquire - token not found: ${tokenId}`);
      return false;
    }

    const currentPrice = Math.ceil(token.base_price_sats / Math.sqrt(token.current_supply + 1));

    if (currentPrice > maxPrice) {
      console.warn(`[Speculation] Price ${currentPrice} exceeds max ${maxPrice}`);
      return false;
    }

    // TODO: Integrate with wallet to make actual payment
    // For now, just record the holding

    console.log(`[Speculation] Acquiring ${tokenId} at ${currentPrice} SAT`);

    upsertHolding(tokenId, 1, currentPrice, true);

    // Record the decision
    recordAIDecision({
      token_id: tokenId,
      decision_type: 'acquire',
      recommendation: 'acquire',
      ai_provider: this.config.provider.name,
      ai_model: this.config.provider.model,
      ai_score: null,
      ai_confidence: null,
      ai_reasoning: 'Autonomous acquisition',
      token_supply: token.current_supply,
      token_price_sats: currentPrice,
      action_taken: 'acquired',
      price_at_action: currentPrice
    });

    this.emit('acquire', tokenId, currentPrice, 'AI-driven acquisition');
    return true;
  }

  // ── Autonomous Loop ────────────────────────────────────────────

  queueEvaluation(tokenId: string): void {
    if (!this.evaluationQueue.includes(tokenId)) {
      this.evaluationQueue.push(tokenId);
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.evaluationInProgress || this.evaluationQueue.length === 0) {
      return;
    }

    this.evaluationInProgress = true;

    while (this.evaluationQueue.length > 0) {
      const tokenId = this.evaluationQueue.shift()!;

      try {
        const evaluation = await this.evaluateToken(tokenId);

        if (evaluation) {
          const decision = this.shouldAcquire(evaluation);

          if (decision.should && this.config.autoAcquire) {
            const positionSize = this.calculatePositionSize(evaluation);
            await this.acquire(tokenId, positionSize);
          } else if (!decision.should) {
            this.emit('skip', tokenId, decision.reason);
          }
        }
      } catch (error) {
        console.error(`[Speculation] Error processing ${tokenId}:`, error);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.evaluationInProgress = false;
  }

  // ── Status ─────────────────────────────────────────────────────

  getStatus(): {
    enabled: boolean;
    autoAcquire: boolean;
    budget: number;
    strategy: string;
    positions: number;
    exposure: number;
    queueLength: number;
  } {
    const summary = getPortfolioSummary();
    const speculativeCount = getAllHoldings().filter(h => h.is_speculative && h.balance > 0).length;

    return {
      enabled: this.config.enabled,
      autoAcquire: this.config.autoAcquire,
      budget: this.config.budgetSats,
      strategy: this.config.strategy.name,
      positions: speculativeCount,
      exposure: Math.round((summary.totalSpent / this.config.budgetSats) * 100),
      queueLength: this.evaluationQueue.length
    };
  }
}
