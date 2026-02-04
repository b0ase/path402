/**
 * $402 Intelligence Provider Interface
 *
 * Pluggable AI backends for token evaluation and speculation.
 * Implementations: Claude, OpenAI, Ollama (local LLM)
 */

import { Token, Holding, PortfolioItem } from '../db/index.js';

// ── Types ──────────────────────────────────────────────────────────

export interface TokenEvaluation {
  tokenId: string;
  score: number;              // 0-100 overall score
  confidence: number;         // 0-1 confidence in assessment
  recommendation: 'acquire' | 'hold' | 'skip' | 'sell';
  maxPrice: number;           // Maximum SAT willing to pay
  reasoning: string;          // Explanation for the decision

  // Sub-scores
  contentQuality?: number;    // 0-100 estimated content quality
  issuerReputation?: number;  // 0-100 issuer trustworthiness
  pricingFairness?: number;   // 0-100 is price reasonable for value
  growthPotential?: number;   // 0-100 expected demand growth
  riskLevel?: number;         // 0-100 (100 = highest risk)
}

export interface ContentAnalysis {
  quality: number;            // 0-100
  category: string;           // 'article', 'api', 'data', 'media', 'code'
  topics: string[];
  estimatedDemand: number;    // 0-100
  viralPotential: number;     // 0-100
  reasoning: string;
}

export interface PortfolioAction {
  type: 'acquire' | 'divest' | 'hold';
  tokenId: string;
  amount?: number;
  reason: string;
}

export interface RebalanceRecommendation {
  actions: PortfolioAction[];
  reasoning: string;
  expectedImprovement: string;
}

export interface MarketContext {
  totalTokensKnown: number;
  averageSupply: number;
  averagePrice: number;
  trendingTokens: string[];
  recentTransfers: number;
}

// ── Provider Interface ─────────────────────────────────────────────

export interface IntelligenceProvider {
  name: string;
  model: string;

  /**
   * Evaluate a token for acquisition
   */
  evaluateToken(
    token: Token,
    holding: Holding | null,
    context: MarketContext
  ): Promise<TokenEvaluation>;

  /**
   * Analyze content preview/description
   */
  analyzeContent(
    preview: string,
    contentType: string | null,
    issuerHandle: string | null
  ): Promise<ContentAnalysis>;

  /**
   * Get portfolio rebalancing recommendations
   */
  rebalancePortfolio(
    portfolio: PortfolioItem[],
    budget: number,
    context: MarketContext
  ): Promise<RebalanceRecommendation>;

  /**
   * Quick yes/no acquisition decision
   */
  shouldAcquire(
    token: Token,
    maxBudget: number,
    context: MarketContext
  ): Promise<{ acquire: boolean; reason: string }>;
}

// ── Base Implementation ────────────────────────────────────────────

export abstract class BaseIntelligenceProvider implements IntelligenceProvider {
  abstract name: string;
  abstract model: string;

  protected abstract callLLM(prompt: string): Promise<string>;

  async evaluateToken(
    token: Token,
    holding: Holding | null,
    context: MarketContext
  ): Promise<TokenEvaluation> {
    const currentPrice = Math.ceil(token.base_price_sats / Math.sqrt(token.current_supply + 1));

    const prompt = `You are an AI agent evaluating a tokenized content opportunity.

TOKEN DETAILS:
- ID: ${token.token_id}
- Name: ${token.name || 'Unknown'}
- Issuer: ${token.issuer_handle || 'Unknown'}
- Current Supply: ${token.current_supply}
- Current Price: ${currentPrice} SAT
- Base Price: ${token.base_price_sats} SAT
- Pricing Model: ${token.pricing_model}
- Content Type: ${token.content_type || 'Unknown'}
- Preview: ${token.content_preview || 'No preview available'}
- Verified: ${token.verification_status}

${holding ? `CURRENT POSITION:
- Balance: ${holding.balance}
- Avg Cost: ${holding.avg_cost_sats} SAT
- Total Spent: ${holding.total_spent_sats} SAT
- Revenue Earned: ${holding.total_revenue_sats} SAT` : 'NO CURRENT POSITION'}

MARKET CONTEXT:
- Total Tokens Known: ${context.totalTokensKnown}
- Average Supply: ${context.averageSupply}
- Average Price: ${context.averagePrice} SAT
- Recent Transfers: ${context.recentTransfers}

Evaluate this token and respond in JSON format:
{
  "score": <0-100>,
  "confidence": <0.0-1.0>,
  "recommendation": "<acquire|hold|skip|sell>",
  "maxPrice": <max SAT to pay>,
  "reasoning": "<explanation>",
  "contentQuality": <0-100>,
  "issuerReputation": <0-100>,
  "pricingFairness": <0-100>,
  "growthPotential": <0-100>,
  "riskLevel": <0-100>
}`;

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON<TokenEvaluation>(response);

    return {
      tokenId: token.token_id,
      score: parsed.score ?? 50,
      confidence: parsed.confidence ?? 0.5,
      recommendation: parsed.recommendation ?? 'skip',
      maxPrice: parsed.maxPrice ?? currentPrice,
      reasoning: parsed.reasoning ?? 'Unable to evaluate',
      contentQuality: parsed.contentQuality,
      issuerReputation: parsed.issuerReputation,
      pricingFairness: parsed.pricingFairness,
      growthPotential: parsed.growthPotential,
      riskLevel: parsed.riskLevel
    };
  }

  async analyzeContent(
    preview: string,
    contentType: string | null,
    issuerHandle: string | null
  ): Promise<ContentAnalysis> {
    const prompt = `Analyze this content preview for a tokenized content offering.

CONTENT PREVIEW:
${preview}

CONTENT TYPE: ${contentType || 'Unknown'}
ISSUER: ${issuerHandle || 'Unknown'}

Respond in JSON format:
{
  "quality": <0-100>,
  "category": "<article|api|data|media|code|other>",
  "topics": ["<topic1>", "<topic2>"],
  "estimatedDemand": <0-100>,
  "viralPotential": <0-100>,
  "reasoning": "<explanation>"
}`;

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON<ContentAnalysis>(response);

    return {
      quality: parsed.quality ?? 50,
      category: parsed.category ?? 'other',
      topics: parsed.topics ?? [],
      estimatedDemand: parsed.estimatedDemand ?? 50,
      viralPotential: parsed.viralPotential ?? 30,
      reasoning: parsed.reasoning ?? 'Unable to analyze'
    };
  }

  async rebalancePortfolio(
    portfolio: PortfolioItem[],
    budget: number,
    context: MarketContext
  ): Promise<RebalanceRecommendation> {
    const portfolioSummary = portfolio.map(p => ({
      token: p.token_id,
      balance: p.balance,
      value: p.balance * p.current_price_sats,
      pnl: p.pnl_sats,
      roi: p.roi_percent
    }));

    const prompt = `You are managing a portfolio of tokenized content holdings.

CURRENT PORTFOLIO:
${JSON.stringify(portfolioSummary, null, 2)}

AVAILABLE BUDGET: ${budget} SAT

MARKET CONTEXT:
- Total Tokens Known: ${context.totalTokensKnown}
- Trending: ${context.trendingTokens.join(', ') || 'None'}

Recommend portfolio actions. Respond in JSON format:
{
  "actions": [
    { "type": "<acquire|divest|hold>", "tokenId": "<token>", "amount": <optional>, "reason": "<why>" }
  ],
  "reasoning": "<overall strategy>",
  "expectedImprovement": "<what this achieves>"
}`;

    const response = await this.callLLM(prompt);
    const parsed = this.parseJSON<RebalanceRecommendation>(response);

    return {
      actions: parsed.actions ?? [],
      reasoning: parsed.reasoning ?? 'No changes recommended',
      expectedImprovement: parsed.expectedImprovement ?? 'Maintain current position'
    };
  }

  async shouldAcquire(
    token: Token,
    maxBudget: number,
    context: MarketContext
  ): Promise<{ acquire: boolean; reason: string }> {
    const currentPrice = Math.ceil(token.base_price_sats / Math.sqrt(token.current_supply + 1));

    // Quick heuristics before calling LLM
    if (currentPrice > maxBudget) {
      return { acquire: false, reason: `Price ${currentPrice} exceeds budget ${maxBudget}` };
    }

    if (token.verification_status === 'invalid') {
      return { acquire: false, reason: 'Token failed verification' };
    }

    // Low supply = early opportunity
    if (token.current_supply < 10 && currentPrice < maxBudget * 0.5) {
      return { acquire: true, reason: 'Early opportunity with low supply' };
    }

    // Otherwise, do full evaluation
    const evaluation = await this.evaluateToken(token, null, context);

    return {
      acquire: evaluation.recommendation === 'acquire',
      reason: evaluation.reasoning
    };
  }

  protected parseJSON<T>(text: string): Partial<T> {
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
    } catch (e) {
      console.warn('[Intelligence] Failed to parse JSON response');
    }
    return {};
  }
}
