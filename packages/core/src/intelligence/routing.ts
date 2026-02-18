/**
 * Routing Intelligence Provider
 *
 * Implements the "90% Strategy" by routing tasks to different models
 * based on complexity, cost, and importance.
 */

import {
    IntelligenceProvider,
    TokenEvaluation,
    ContentAnalysis,
    RebalanceRecommendation,
    MarketContext
} from './provider.js';
import { Token, Holding, PortfolioItem } from '../db/index.js';

export class RoutingIntelligenceProvider implements IntelligenceProvider {
    name = 'routing';
    model = 'hybrid-router';

    private local: IntelligenceProvider;
    private mid: IntelligenceProvider;
    private frontier: IntelligenceProvider;

    constructor(
        local: IntelligenceProvider,
        mid: IntelligenceProvider,
        frontier: IntelligenceProvider
    ) {
        this.local = local;
        this.mid = mid;
        this.frontier = frontier;
    }

    async evaluateToken(
        token: Token,
        holding: Holding | null,
        context: MarketContext
    ): Promise<TokenEvaluation> {
        // Evaluation is a core decision node.
        // If we have an existing holding, use frontier for better re-evaluation.
        // Otherwise, use mid-tier.
        const provider = holding ? this.frontier : this.mid;
        console.log(`[Routing] evaluateToken -> ${provider.name}`);
        return provider.evaluateToken(token, holding, context);
    }

    async analyzeContent(
        preview: string,
        contentType: string | null,
        issuerHandle: string | null
    ): Promise<ContentAnalysis> {
        // Content analysis is high volume but less mission-critical than trading.
        // Use local for initial pass or mid-tier for more depth.
        const provider = this.mid;
        console.log(`[Routing] analyzeContent -> ${provider.name}`);
        return provider.analyzeContent(preview, contentType, issuerHandle);
    }

    async rebalancePortfolio(
        portfolio: PortfolioItem[],
        budget: number,
        context: MarketContext
    ): Promise<RebalanceRecommendation> {
        // Rebalancing is the highest-tier task (strategic planning).
        // Always use frontier.
        console.log(`[Routing] rebalancePortfolio -> ${this.frontier.name}`);
        return this.frontier.rebalancePortfolio(portfolio, budget, context);
    }

    async shouldAcquire(
        token: Token,
        maxBudget: number,
        context: MarketContext
    ): Promise<{ acquire: boolean; reason: string }> {
        // "Should I even look at this?" -> Level 1 (Local)
        // This handles the bulk of the "scanning" traffic.
        console.log(`[Routing] shouldAcquire -> ${this.local.name}`);
        return this.local.shouldAcquire(token, maxBudget, context);
    }
}
