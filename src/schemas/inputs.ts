/**
 * $402 MCP Server - Input Schemas
 */

import { z } from "zod";

// ── discover_path402 ──────────────────────────────────────────

export const DiscoverInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address or URL to discover. Examples: '$b0ase.com/$blog/$my-post', 'https://b0ase.com/$blog'")
}).strict();

export type DiscoverInput = z.infer<typeof DiscoverInputSchema>;

// ── evaluate_path402 ──────────────────────────────────────────

export const EvaluateInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address or URL to evaluate for purchase"),
  max_price: z.number()
    .int()
    .min(1)
    .default(10000)
    .describe("Maximum price in satoshis the agent is willing to pay (default: 10000)")
}).strict();

export type EvaluateInput = z.infer<typeof EvaluateInputSchema>;

// ── acquire_path402 ───────────────────────────────────────────

export const AcquireInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address or URL to acquire a token for"),
  max_price: z.number()
    .int()
    .min(1)
    .default(10000)
    .describe("Maximum price in satoshis. Transaction will be rejected if current price exceeds this.")
}).strict();

export type AcquireInput = z.infer<typeof AcquireInputSchema>;

// ── wallet_status ───────────────────────────────────────────────

export const WalletStatusInputSchema = z.object({
  response_format: z.enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format: 'markdown' for human-readable, 'json' for structured data")
}).strict();

export type WalletStatusInput = z.infer<typeof WalletStatusInputSchema>;

// ── price_schedule ──────────────────────────────────────────────

export const PriceScheduleInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address or URL to generate a price schedule for"),
  supply_points: z.array(z.number().int().min(1))
    .default([1, 5, 10, 50, 100, 500, 1000])
    .describe("Supply levels to calculate prices at")
}).strict();

export type PriceScheduleInput = z.infer<typeof PriceScheduleInputSchema>;

// ── set_budget ──────────────────────────────────────────────────

export const SetBudgetInputSchema = z.object({
  balance: z.number()
    .int()
    .min(0)
    .describe("Set the wallet balance in satoshis")
}).strict();

export type SetBudgetInput = z.infer<typeof SetBudgetInputSchema>;

// ── serve ──────────────────────────────────────────────────────

export const ServeInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address to serve content for (must hold token)"),
  requester: z.string()
    .optional()
    .describe("Optional identifier for who requested the content")
}).strict();

export type ServeInput = z.infer<typeof ServeInputSchema>;

// ── economics ──────────────────────────────────────────────────

export const EconomicsInputSchema = z.object({
  url: z.string()
    .min(1, "URL is required")
    .describe("The $address to analyse economics for"),
  projected_supply: z.number()
    .int()
    .min(1)
    .default(1000)
    .describe("Projected total supply for ROI calculation (default: 1000)"),
  serving_participation: z.number()
    .min(0.01)
    .max(1.0)
    .default(0.5)
    .describe("Fraction of token holders actively serving (0.01-1.0, default: 0.5)")
}).strict();

export type EconomicsInput = z.infer<typeof EconomicsInputSchema>;

// ── batch_discover ─────────────────────────────────────────────

export const BatchDiscoverInputSchema = z.object({
  urls: z.array(z.string().min(1))
    .min(1)
    .max(10)
    .describe("Array of $addresses to discover (max 10)")
}).strict();

export type BatchDiscoverInput = z.infer<typeof BatchDiscoverInputSchema>;

// ── servable ───────────────────────────────────────────────────

export const ServableInputSchema = z.object({
  response_format: z.enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format: 'markdown' for human-readable, 'json' for structured data")
}).strict();

export type ServableInput = z.infer<typeof ServableInputSchema>;
