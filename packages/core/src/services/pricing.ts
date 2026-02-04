/**
 * $402 Pricing Engine
 * 
 * Calculates current prices and expected ROI based on
 * the pricing model and current supply.
 */

import {
  PricingModel,
  PricingRules,
  RevenueModel,
  RevenueRules
} from "../types.js";
import { MIN_SUPPLY, DEFAULT_SERVING_PARTICIPATION } from "../constants.js";

/**
 * Calculate the price for the next buyer given current supply
 */
export function calculatePrice(rules: PricingRules, supply: number): number {
  const n = Math.max(supply, MIN_SUPPLY);

  switch (rules.model) {
    case PricingModel.FIXED:
      return rules.basePrice;

    case PricingModel.SQRT_DECAY:
      return Math.max(
        rules.floor ?? 1,
        Math.round(rules.basePrice / Math.sqrt(n))
      );

    case PricingModel.LOG_DECAY:
      return Math.max(
        rules.floor ?? 1,
        Math.round(rules.basePrice / Math.log(n + 1))
      );

    case PricingModel.LINEAR_FLOOR: {
      const decay = rules.decayRate ?? 10;
      const floor = rules.floor ?? 50;
      return Math.max(floor, Math.round(rules.basePrice - (decay * n)));
    }

    default:
      return rules.basePrice;
  }
}

/**
 * Calculate issuer share at a given supply level
 */
export function calculateIssuerShare(rules: RevenueRules, supply: number): number {
  switch (rules.model) {
    case RevenueModel.FIXED_ISSUER:
      return rules.issuerShare;

    case RevenueModel.EQUAL_SPLIT:
      return 1 / (supply + 1);

    case RevenueModel.DECAYING_ISSUER: {
      const decay = rules.decayRate ?? 0.005;
      const floor = rules.issuerFloor ?? 0.1;
      return Math.max(floor, rules.issuerShare - (decay * supply));
    }

    default:
      return rules.issuerShare;
  }
}

/**
 * Estimate expected ROI for a buyer at position n,
 * assuming total eventual supply of N
 */
export function estimateROI(
  pricingRules: PricingRules,
  revenueRules: RevenueRules,
  buyerPosition: number,
  estimatedTotalSupply: number,
  servingParticipation: number = DEFAULT_SERVING_PARTICIPATION
): number {
  const pricePaid = calculatePrice(pricingRules, buyerPosition);
  if (pricePaid === 0) return 0;

  let totalServingRevenue = 0;

  // Sum expected serving revenue from all future buyers
  for (let k = buyerPosition + 1; k <= estimatedTotalSupply; k++) {
    const txPrice = calculatePrice(pricingRules, k);
    const issuerShare = calculateIssuerShare(revenueRules, k);
    const nodePool = txPrice * (1 - issuerShare);
    const activeServers = Math.max(1, Math.round(servingParticipation * k));
    totalServingRevenue += nodePool / activeServers;
  }

  return (totalServingRevenue - pricePaid) / pricePaid;
}

/**
 * Generate a price schedule showing how price changes with supply
 */
export function generatePriceSchedule(
  rules: PricingRules,
  points: number[] = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000]
): Array<{ supply: number; price: number }> {
  return points.map(supply => ({
    supply,
    price: calculatePrice(rules, supply)
  }));
}

/**
 * Calculate breakeven point - how many future buyers needed to recoup cost
 */
export function calculateBreakeven(
  pricingRules: PricingRules,
  revenueRules: RevenueRules,
  buyerPosition: number,
  servingParticipation: number = DEFAULT_SERVING_PARTICIPATION
): { buyersNeeded: number; supplyAtBreakeven: number } {
  const pricePaid = calculatePrice(pricingRules, buyerPosition);
  let accumulated = 0;
  let buyers = 0;

  // Simulate future buyers until we break even
  for (let k = buyerPosition + 1; k <= buyerPosition + 100000; k++) {
    const txPrice = calculatePrice(pricingRules, k);
    const issuerShare = calculateIssuerShare(revenueRules, k);
    const nodePool = txPrice * (1 - issuerShare);
    const activeServers = Math.max(1, Math.round(servingParticipation * k));
    accumulated += nodePool / activeServers;
    buyers++;

    if (accumulated >= pricePaid) {
      return { buyersNeeded: buyers, supplyAtBreakeven: k };
    }
  }

  // Never breaks even within 100k buyers
  return { buyersNeeded: -1, supplyAtBreakeven: -1 };
}

/**
 * Calculate total revenue at a given supply level
 */
export function calculateTotalRevenue(
  pricingRules: PricingRules,
  revenueRules: RevenueRules,
  fromSupply: number,
  toSupply: number
): { grossRevenue: number; issuerRevenue: number; networkRevenue: number } {
  let gross = 0;
  let issuer = 0;
  let network = 0;

  for (let n = fromSupply; n <= toSupply; n++) {
    const price = calculatePrice(pricingRules, n);
    const issuerShare = calculateIssuerShare(revenueRules, n);
    gross += price;
    issuer += price * issuerShare;
    network += price * (1 - issuerShare);
  }

  return {
    grossRevenue: Math.round(gross),
    issuerRevenue: Math.round(issuer),
    networkRevenue: Math.round(network)
  };
}

/**
 * Generate the mathematical explanation for sqrt_decay economics
 */
export function explainEconomics(
  pricingRules: PricingRules,
  revenueRules: RevenueRules,
  buyerPosition: number,
  projectedSupply: number
): string {
  const P = pricingRules.basePrice;
  const n = buyerPosition;
  const N = projectedSupply;
  const issuerShare = revenueRules.issuerShare;
  const serverShare = 1 - issuerShare;

  if (pricingRules.model === PricingModel.SQRT_DECAY) {
    return [
      `## sqrt_decay Economics`,
      ``,
      `**Price formula**: P(n) = ${P} / √n`,
      `**Your position**: n = ${n}`,
      `**You paid**: ${Math.round(P / Math.sqrt(n))} SAT`,
      ``,
      `**Revenue split**:`,
      `- Issuer: ${Math.round(issuerShare * 100)}%`,
      `- Serving network: ${Math.round(serverShare * 100)}%`,
      ``,
      `**Key insight**: Under sqrt_decay, the sum of future prices diverges slowly.`,
      `Each buyer after you pays less, but there are more of them.`,
      ``,
      `**Your expected serving revenue at N=${N}**:`,
      `Revenue ≈ ${Math.round(serverShare * 100)}% × Σ(P/√k) for k=${n+1}..${N}`,
      `       ≈ ${Math.round(serverShare * 100)}% × ${P} × 2(√${N} - √${n})`,
      `       ≈ ${Math.round(serverShare * P * 2 * (Math.sqrt(N) - Math.sqrt(n)))} SAT`,
      ``,
      `**Net position**: Revenue - Cost = ROI`,
      ``,
      `*The math favors early buyers. Every buyer except the last achieves positive ROI.*`
    ].join("\n");
  }

  return `Price model: ${pricingRules.model}. Base price: ${P} SAT.`;
}
