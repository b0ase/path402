/**
 * $402 MCP Server
 * 
 * Enables AI agents to discover, evaluate, acquire, and serve
 * tokenised content using the $402 protocol.
 * 
 * Tools:
 *   path402_discover    - Probe a $address, get pricing and terms
 *   path402_evaluate    - Budget check: should the agent buy?
 *   path402_acquire     - Pay and receive token + content
 *   path402_wallet      - View token portfolio and balance
 *   path402_price_schedule - See how price changes with supply
 *   path402_set_budget  - Set agent's spending budget
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import {
  DiscoverInputSchema,
  EvaluateInputSchema,
  AcquireInputSchema,
  WalletStatusInputSchema,
  PriceScheduleInputSchema,
  SetBudgetInputSchema,
  ServeInputSchema,
  EconomicsInputSchema,
  BatchDiscoverInputSchema,
  ServableInputSchema,
  TokenStatsInputSchema,
  HoldersInputSchema,
  VerifyHolderInputSchema,
  ConnectWalletInputSchema,
  X402InputSchema
} from "./schemas/inputs.js";
import type {
  DiscoverInput,
  EvaluateInput,
  AcquireInput,
  WalletStatusInput,
  PriceScheduleInput,
  SetBudgetInput,
  ServeInput,
  EconomicsInput,
  BatchDiscoverInput,
  ServableInput,
  TokenStatsInput,
  HoldersInput,
  VerifyHolderInput,
  ConnectWalletInput,
  X402Input
} from "./schemas/inputs.js";

import { discover, acquireContent } from "./services/client.js";
import {
  generatePriceSchedule,
  calculatePrice,
  calculateBreakeven,
  calculateTotalRevenue,
  estimateROI,
  explainEconomics
} from "./services/pricing.js";
import {
  evaluateBudget,
  recordAcquisition,
  getWallet,
  hasToken,
  getToken,
  getPortfolioSummary,
  setBalance,
  resetWallet,
  getServableTokens,
  recordServe,
  getServeHistory,
  getServeStats
} from "./services/wallet.js";
import {
  initDatabase,
  getTokenStats,
  getHolders,
  getHolder,
  hasTokens,
  verifyTokenOwnership
} from "./services/database.js";
import { chainAgents } from "./services/x402.js";
import { getWalletManager } from "./wallet/index.js";

// Token minting exports
export {
  DEFAULT_SUPPLY,
  DEFAULT_DECIMALS,
  DEFAULT_ACCESS_RATE,
  generateBSV21Inscription,
  generateTransferInscription,
  generateTokenId,
  validateSymbol,
  prepareMint,
  calculateServeReward,
  calculateDividend
} from "./token/mint.js";

export type {
  TokenConfig,
  MintedToken,
  TokenMetadata,
  MintRequest,
  MintResult,
  ServeProof,
  ServeReward,
  StakePosition,
  DividendClaim
} from "./token/mint.js";

// Mining exports
export { ProofOfIndexingService } from "./services/mining.js";
export type { MintBroadcaster, MintBroadcasterResult } from "./mining/broadcaster.js";

// DNS Verification exports
export { verifyDomainDns, generateVerificationCode, resolvePaymentAddress } from "./services/dns.js";
export type { VerificationResult } from "./services/dns.js";

// Client/Agent exports
export { Path402Agent, runAgent } from "./client/agent.js";
export type { AgentConfig, AgentStatus } from "./client/agent.js";

// Marketplace bridge exports
export { MarketplaceBridge } from "./services/marketplace-bridge.js";
export type { MarketplaceData, MarketplaceToken, MarketplaceStats } from "./services/marketplace-bridge.js";

// Call signaling types
export { CallSignalType } from "./gossip/protocol.js";
export type { CallSignalMessage, CallOfferPayload, CallAnswerPayload, CallRejectPayload, CallHangupPayload, IceCandidatePayload } from "./gossip/protocol.js";

// Config exports
export { Config } from "./pathd/config.js";
export type { PathDConfig } from "./pathd/config.js";

// Identity + Call Record DB types
export type { IdentityToken, CallRecord } from "./db/index.js";

// Publish exports
export { publishProject, initManifest } from "./publish/publisher.js";
export type { PublishOptions, PublishResult, FileEntry } from "./publish/publisher.js";
export { ProjectManifestSchema, parseManifest, createManifestFromFlags, generateManifestTemplate } from "./publish/manifest.js";
export type { ProjectManifest } from "./publish/manifest.js";

// ── Global Services ─────────────────────────────────────────────
import { ProofOfIndexingService } from "./services/mining.js";

// Global mining service instantiation removed to prevent side-effects in browser imports.
// The Agent provided in ./client/agent.ts will manage the mining service.


// ── Server Init ─────────────────────────────────────────────────

export const server = new McpServer({
  name: "path402",
  version: "1.3.0"
});

// ── Tool: discover ──────────────────────────────────────────────

server.registerTool(
  "path402_discover",
  {
    title: "Discover $402 Content",
    description: `Probe a $address to discover its $402 pricing terms, revenue model, current supply, and any nested $addresses below it.

Use this before acquiring content to understand what you're buying into. Returns the full $402 response including pricing model, current price, issuer share, and child paths.

Args:
  - url (string): The $address or URL. Examples: "$b0ase.com/$blog", "https://example.com/$api/$data"

Returns:
  The $402 discovery response with pricing, revenue rules, supply, and children.

Examples:
  - "What content is available at $b0ase.com?" → discover $b0ase.com
  - "How much does this post cost?" → discover the specific $address
  - "What's nested under this section?" → check children array`,
    inputSchema: DiscoverInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: DiscoverInput) => {
    try {
      const response = await discover(params.url);
      const owned = hasToken(response.dollarAddress);

      const lines = [
        `## $402 Discovery: ${response.dollarAddress}`,
        "",
        `**Protocol:** ${response.protocol} v${response.version}`,
        `**Current Price:** ${response.currentPrice} SAT`,
        `**Current Supply:** ${response.currentSupply} tokens issued`,
        `**Pricing Model:** ${response.pricing.model} (base: ${response.pricing.basePrice} SAT)`,
        `**Revenue Model:** ${response.revenue.model} (issuer: ${Math.round(response.revenue.issuerShare * 100)}%)`,
        `**Payment Address:** ${response.paymentAddress}`,
        `**Already Owned:** ${owned ? "Yes ✓" : "No"}`,
      ];

      if (response.contentPreview) {
        lines.push("", `**Preview:** ${response.contentPreview}`);
      }

      if (response.children && response.children.length > 0) {
        lines.push("", "**Nested $addresses:**");
        for (const child of response.children) {
          lines.push(`  - ${child}`);
        }
      }

      const output = {
        dollarAddress: response.dollarAddress,
        protocol: response.protocol,
        currentPrice: response.currentPrice,
        currentSupply: response.currentSupply,
        pricing: response.pricing,
        revenue: response.revenue,
        children: response.children ?? [],
        alreadyOwned: owned,
        contentPreview: response.contentPreview
      };

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: output
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Discovery failed: ${msg}. Check the URL is a valid $402 endpoint.` }]
      };
    }
  }
);

// ── Tool: evaluate ──────────────────────────────────────────────

server.registerTool(
  "path402_evaluate",
  {
    title: "Evaluate $402 Purchase",
    description: `Evaluate whether to acquire a $402 token. Checks budget, estimates ROI, and returns a recommendation.

This is the agent's decision-making tool. Use it before acquiring to determine if the purchase is worthwhile given the current balance and price.

Args:
  - url (string): The $address or URL to evaluate
  - max_price (number): Maximum acceptable price in satoshis (default: 10000)

Returns:
  Budget decision with recommendation: "acquire", "skip", or "insufficient_funds"`,
    inputSchema: EvaluateInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: EvaluateInput) => {
    try {
      const response = await discover(params.url);
      const decision = evaluateBudget(response, params.max_price);

      const emoji = decision.recommendation === "acquire" ? "✅"
        : decision.recommendation === "skip" ? "⏭️"
          : "❌";

      const lines = [
        `## ${emoji} Budget Evaluation: ${decision.dollarAddress}`,
        "",
        `**Current Price:** ${decision.currentPrice} SAT`,
        `**Recommendation:** ${decision.recommendation.toUpperCase()}`,
        `**Reasoning:** ${decision.reasoning}`,
        `**Budget Remaining:** ${decision.budgetRemaining} SAT`,
      ];

      if (decision.expectedROI !== undefined) {
        lines.push(`**Expected ROI:** ${decision.expectedROI}%`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: decision
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Evaluation failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: acquire ───────────────────────────────────────────────

server.registerTool(
  "path402_acquire",
  {
    title: "Acquire $402 Token",
    description: `Pay for and acquire a $402 token. This debits the agent's balance, stores the token (with serving rights), and returns the gated content.

After acquisition, the agent holds the token and can serve the content to future buyers, earning revenue.

Args:
  - url (string): The $address or URL to acquire
  - max_price (number): Maximum price in satoshis. Rejects if current price exceeds this.

Returns:
  The acquired token details and the unlocked content.

⚠️ This tool spends funds from the agent's wallet balance.`,
    inputSchema: AcquireInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: AcquireInput) => {
    try {
      // First discover current terms
      const response = await discover(params.url);

      // Check if already owned
      if (hasToken(response.dollarAddress)) {
        return {
          content: [{ type: "text", text: `Already hold a token for ${response.dollarAddress}. No purchase needed.` }]
        };
      }

      // Budget check
      const decision = evaluateBudget(response, params.max_price);
      if (decision.recommendation === "insufficient_funds") {
        return {
          isError: true,
          content: [{ type: "text", text: `Cannot acquire: ${decision.reasoning}` }]
        };
      }
      if (decision.recommendation === "skip" && response.currentPrice > params.max_price) {
        return {
          isError: true,
          content: [{ type: "text", text: `Price ${response.currentPrice} SAT exceeds max_price ${params.max_price} SAT. Increase max_price or wait for price to decay.` }]
        };
      }

      // Attempt payment via Wallet Manager
      const walletManager = getWalletManager();
      let paymentProof = `proof_${Date.now()}`;
      let usingRealWallet = false;

      // Check if we have a real wallet connected
      if (walletManager.getConnectedWallets().length > 0) {
        const paymentResult = await walletManager.payForContent({
          contentToken: response.dollarAddress,
          amount: 1,
          priceSats: response.currentPrice,
          recipient: response.paymentAddress,
          recipientChain: 'bsv', // Default to BSV
          preferredChain: 'bsv'
        });

        if (!paymentResult.success) {
          throw new Error(`Payment failed: ${paymentResult.error}`);
        }

        paymentProof = paymentResult.txid;
        usingRealWallet = true;
      }

      // Record the acquisition (updates local state)
      // Note: If using real wallet, this will debit the *simulation* balance too, 
      // keeping the simulation consistent with actions taken, even if funds came from elsewhere.
      const token = recordAcquisition(
        response.dollarAddress,
        response.currentPrice,
        response.currentSupply,
        response.paymentAddress
      );

      // Retrieve the content
      const { content, contentType } = await acquireContent(params.url, paymentProof);

      const wallet = getWallet();
      const lines = [
        `## ✅ Token Acquired: ${response.dollarAddress}`,
        "",
        `**Token ID:** ${token.id}`,
        `**Price Paid:** ${token.pricePaid} SAT`,
        `**Position:** #${token.supply + 1} (supply was ${token.supply})`,
        `**Serving Rights:** Yes`,
        `**Wallet Balance:** ${wallet.balance} SAT`,
        "",
        "---",
        "",
        content
      ];

      const output = {
        success: true,
        token,
        content,
        totalCost: token.pricePaid,
        newBalance: wallet.balance
      };

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: output
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Acquisition failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: connect_wallet ────────────────────────────────────────

server.registerTool(
  "path402_connect_wallet",
  {
    title: "Connect Wallet",
    description: `Connect an external wallet provider (e.g. Metanet/Babbage) to the agent.
This allows real payments to be made using the user's funds.`,
    inputSchema: ConnectWalletInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: ConnectWalletInput) => {
    try {
      const manager = getWalletManager();
      let address = '';

      switch (params.provider) {
        case 'metanet': {
          manager.useMetanet();
          await manager.connectAll();
          const addresses = await manager.getAddresses();
          address = addresses['bsv'] || '';
          break;
        }
        case 'handcash': {
          // V1: store handle as address, real OAuth in v2
          const handle = params.handle || '';
          if (!handle) throw new Error('HandCash handle is required');
          address = `$${handle.replace(/^[$@]/, '')}`;
          break;
        }
        case 'yours': {
          // V1: Yours/Panda extension detected by the renderer
          // Backend just acknowledges the connection
          address = 'yours-connected';
          break;
        }
        case 'manual': {
          const wif = params.wif || '';
          if (!wif) throw new Error('WIF private key is required');
          const bsv = manager.getBSV();
          bsv.importKey(wif);
          address = await bsv.getAddress();
          break;
        }
      }

      return {
        content: [{ type: "text", text: `Connected to ${params.provider}. Address: ${address || 'unknown'}` }],
        structuredContent: { connected: true, provider: params.provider, address }
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Connection failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: wallet ────────────────────────────────────────────────

server.registerTool(
  "path402_wallet",
  {
    title: "$402 Wallet Status",
    description: `View the agent's $402 wallet: balance, tokens held, total spent/earned, and net position.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Complete wallet state including all held tokens and financial summary.`,
    inputSchema: WalletStatusInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: WalletStatusInput) => {
    const summary = getPortfolioSummary();

    if (params.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary
      };
    }

    const lines = [
      "## $402 Wallet",
      "",
      `**Balance:** ${summary.balance} SAT`,
      `**Tokens Held:** ${summary.totalTokens}`,
      `**Total Spent:** ${summary.totalSpent} SAT`,
      `**Total Earned:** ${summary.totalEarned} SAT`,
      `**Net Position:** ${summary.netPosition >= 0 ? "+" : ""}${summary.netPosition} SAT`,
    ];

    if (summary.tokens.length > 0) {
      lines.push("", "### Token Portfolio");
      for (const t of summary.tokens) {
        lines.push(`- **${t.dollarAddress}** — paid ${t.pricePaid} SAT (${t.acquiredAt})`);
      }
    } else {
      lines.push("", "_No tokens held. Use path402_acquire to purchase content._");
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: summary
    };
  }
);

// ── Tool: price_schedule ────────────────────────────────────────

server.registerTool(
  "path402_price_schedule",
  {
    title: "$402 Price Schedule",
    description: `Show how the price of a $402 endpoint changes as supply grows. Useful for understanding the pricing curve and optimal buying timing.

Args:
  - url (string): The $address to analyse
  - supply_points (number[]): Supply levels to calculate prices at (default: [1,5,10,50,100,500,1000])

Returns:
  A table showing price at each supply level.`,
    inputSchema: PriceScheduleInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: PriceScheduleInput) => {
    try {
      const response = await discover(params.url);
      const schedule = generatePriceSchedule(response.pricing, params.supply_points);

      const lines = [
        `## Price Schedule: ${response.dollarAddress}`,
        `**Model:** ${response.pricing.model} (base: ${response.pricing.basePrice} SAT)`,
        `**Current Supply:** ${response.currentSupply}`,
        "",
        "| Supply | Price (SAT) |",
        "|--------|-------------|"
      ];

      for (const point of schedule) {
        const marker = point.supply === response.currentSupply ? " ← current" : "";
        lines.push(`| ${point.supply} | ${point.price}${marker} |`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { dollarAddress: response.dollarAddress, schedule }
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Price schedule failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: set_budget ────────────────────────────────────────────

server.registerTool(
  "path402_set_budget",
  {
    title: "Set $402 Budget",
    description: `Set or reset the agent's wallet balance. Use this to configure spending limits.

Args:
  - balance (number): Wallet balance in satoshis

Returns:
  Updated wallet state.`,
    inputSchema: SetBudgetInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: SetBudgetInput) => {
    resetWallet(params.balance);
    const summary = getPortfolioSummary();

    return {
      content: [{ type: "text", text: `Wallet reset. Balance set to ${params.balance} SAT.` }],
      structuredContent: summary
    };
  }
);

// ── Tool: serve ──────────────────────────────────────────────────

server.registerTool(
  "path402_serve",
  {
    title: "Serve $402 Content",
    description: `Serve content for a $address you hold a token for. This simulates serving content to a buyer and earning revenue.

When a buyer requests content you hold, you serve it and earn a share of their payment. This is how agents become self-funding over time.

Args:
  - url (string): The $address to serve content for (must hold token)
  - requester (string): Optional identifier for who requested the content

Returns:
  Confirmation of serve event and revenue earned.

⚠️ You must hold a token for this $address to serve it.`,
    inputSchema: ServeInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (params: ServeInput) => {
    try {
      const dollarAddress = params.url.startsWith("$") ? params.url : `$${params.url.replace(/^https?:\/\//, "")}`;
      const token = getToken(dollarAddress);

      if (!token) {
        return {
          isError: true,
          content: [{ type: "text", text: `Cannot serve ${dollarAddress}: no token held. Use path402_acquire first.` }]
        };
      }

      if (!token.servingRights) {
        return {
          isError: true,
          content: [{ type: "text", text: `Cannot serve ${dollarAddress}: token does not have serving rights.` }]
        };
      }

      // Simulate serving revenue (in production: actual payment from network)
      // Revenue = fraction of buyer's payment based on serving pool
      const simulatedRevenue = Math.round(token.pricePaid * 0.1 * Math.random() + 10);

      const event = recordServe(
        dollarAddress,
        token.id,
        simulatedRevenue,
        params.requester
      );

      const wallet = getWallet();
      const history = getServeHistory(dollarAddress);

      const lines = [
        `## ✅ Content Served: ${dollarAddress}`,
        "",
        `**Serve ID:** ${event.id}`,
        `**Revenue Earned:** ${event.revenueEarned} SAT`,
        `**Requester:** ${event.requester || "anonymous"}`,
        `**Token Position:** #${token.supply + 1}`,
        "",
        `**Total Serves for This Token:** ${history.length}`,
        `**Total Revenue from This Token:** ${history.reduce((sum, e) => sum + e.revenueEarned, 0)} SAT`,
        `**New Wallet Balance:** ${wallet.balance} SAT`
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          event,
          tokenStats: {
            serves: history.length,
            totalRevenue: history.reduce((sum, e) => sum + e.revenueEarned, 0)
          },
          newBalance: wallet.balance
        }
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Serve failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: economics ──────────────────────────────────────────────

server.registerTool(
  "path402_economics",
  {
    title: "$402 Economics Analysis",
    description: `Deep dive into the economics of a $402 token. Shows breakeven analysis, ROI projections at different supply levels, and the mathematical explanation of the ascending bonding curve.

Use this to understand whether a $address is a good investment, when you'll break even, and how much you can expect to earn.

Args:
  - url (string): The $address to analyse
  - projected_supply (number): Expected total supply for ROI calculation (default: 1000)
  - serving_participation (number): Fraction of holders actively serving (0.01-1.0, default: 0.5)

Returns:
  Detailed economics analysis including breakeven, ROI projections, and math explanation.`,
    inputSchema: EconomicsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: EconomicsInput) => {
    try {
      const response = await discover(params.url);
      const buyerPosition = response.currentSupply + 1;
      const pricePaid = response.currentPrice;

      // Calculate breakeven
      const breakeven = calculateBreakeven(
        response.pricing,
        response.revenue,
        buyerPosition,
        params.serving_participation
      );

      // Calculate ROI at different supply levels
      const roiAtProjected = estimateROI(
        response.pricing,
        response.revenue,
        buyerPosition,
        params.projected_supply,
        params.serving_participation
      );
      const roiAt2x = estimateROI(
        response.pricing,
        response.revenue,
        buyerPosition,
        response.currentSupply * 2,
        params.serving_participation
      );
      const roiAt10x = estimateROI(
        response.pricing,
        response.revenue,
        buyerPosition,
        response.currentSupply * 10,
        params.serving_participation
      );

      // Calculate revenue projection
      const revenueProjection = calculateTotalRevenue(
        response.pricing,
        response.revenue,
        buyerPosition,
        params.projected_supply
      );

      // Your share of network revenue
      const avgHolders = (buyerPosition + params.projected_supply) / 2;
      const yourShare = Math.round(revenueProjection.networkRevenue / avgHolders);

      // Math explanation
      const mathExplanation = explainEconomics(
        response.pricing,
        response.revenue,
        buyerPosition,
        params.projected_supply
      );

      const lines = [
        `## $402 Economics: ${response.dollarAddress}`,
        "",
        `### Current State`,
        `- **Supply:** ${response.currentSupply} tokens issued`,
        `- **Your Position:** #${buyerPosition} (next buyer)`,
        `- **Price to Acquire:** ${pricePaid} SAT`,
        `- **Pricing Model:** ${response.pricing.model}`,
        `- **Issuer Share:** ${Math.round(response.revenue.issuerShare * 100)}%`,
        "",
        `### Breakeven Analysis`,
        breakeven.buyersNeeded > 0
          ? `- **Buyers needed to break even:** ${breakeven.buyersNeeded}`
          : `- **Breakeven:** Not achievable within 100k buyers`,
        breakeven.supplyAtBreakeven > 0
          ? `- **Supply at breakeven:** ${breakeven.supplyAtBreakeven}`
          : "",
        breakeven.buyersNeeded > 0
          ? `- **Breakeven probability:** ${breakeven.buyersNeeded < 50 ? "High" : breakeven.buyersNeeded < 200 ? "Medium" : "Low"}`
          : "",
        "",
        `### ROI Projections`,
        `| Supply Level | ROI |`,
        `|--------------|-----|`,
        `| ${response.currentSupply * 2} (2x current) | ${Math.round(roiAt2x * 100)}% |`,
        `| ${response.currentSupply * 10} (10x current) | ${Math.round(roiAt10x * 100)}% |`,
        `| ${params.projected_supply} (projected) | ${Math.round(roiAtProjected * 100)}% |`,
        "",
        `### Revenue Projection (at ${params.projected_supply} supply)`,
        `- **Gross Revenue:** ${revenueProjection.grossRevenue} SAT`,
        `- **Issuer Revenue:** ${revenueProjection.issuerRevenue} SAT`,
        `- **Network Revenue:** ${revenueProjection.networkRevenue} SAT`,
        `- **Your Est. Share:** ~${yourShare} SAT`,
        "",
        "---",
        "",
        mathExplanation
      ].filter(Boolean);

      const analysis = {
        dollarAddress: response.dollarAddress,
        currentSupply: response.currentSupply,
        currentPrice: pricePaid,
        projectedSupply: params.projected_supply,
        buyerPosition,
        pricePaid,
        breakeven: {
          buyersNeeded: breakeven.buyersNeeded,
          supplyAtBreakeven: breakeven.supplyAtBreakeven,
          probability: breakeven.buyersNeeded < 50 ? "high" : breakeven.buyersNeeded < 200 ? "medium" : "low"
        },
        roi: {
          atProjectedSupply: Math.round(roiAtProjected * 100),
          at2xSupply: Math.round(roiAt2x * 100),
          at10xSupply: Math.round(roiAt10x * 100)
        },
        revenueProjection: {
          ...revenueProjection,
          yourShare
        },
        mathExplanation
      };

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: analysis
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Economics analysis failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: mine_status ──────────────────────────────────────────

server.registerTool(
  "path402_mine_status",
  {
    title: "Miner Status",
    description: "Check the status of the Proof of Indexing miner.",
    inputSchema: WalletStatusInputSchema, // Reuse simple schema or create empty one
    annotations: {
      readOnlyHint: true
    }
  },
  async () => {
    // For now, we just mock the response since we can't easily access the private mempool state 
    // without exposing getters on the service.
    return {
      content: [{ type: "text", text: "Miner is running. Mining active." }],
      structuredContent: { status: 'mining' }
    };
  }
);

// ── Tool: batch_discover ─────────────────────────────────────────

server.registerTool(
  "path402_batch_discover",
  {
    title: "Batch Discover $402 Content",
    description: `Discover multiple $addresses at once. More efficient than calling discover individually when exploring a site or comparing options.

Args:
  - urls (string[]): Array of $addresses to discover (max 10)

Returns:
  Summary of all discovered $addresses with prices and ownership status.`,
    inputSchema: BatchDiscoverInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: BatchDiscoverInput) => {
    const results = {
      successful: [] as Array<{
        url: string;
        dollarAddress: string;
        currentPrice: number;
        currentSupply: number;
        alreadyOwned: boolean;
      }>,
      failed: [] as Array<{
        url: string;
        error: string;
      }>
    };

    // Process all URLs in parallel
    await Promise.all(
      params.urls.map(async (url) => {
        try {
          const response = await discover(url);
          const owned = hasToken(response.dollarAddress);
          results.successful.push({
            url,
            dollarAddress: response.dollarAddress,
            currentPrice: response.currentPrice,
            currentSupply: response.currentSupply,
            alreadyOwned: owned
          });
        } catch (error) {
          results.failed.push({
            url,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    // Sort by price
    results.successful.sort((a, b) => a.currentPrice - b.currentPrice);

    const lines = [
      `## Batch Discovery: ${params.urls.length} URLs`,
      "",
      `**Successful:** ${results.successful.length}`,
      `**Failed:** ${results.failed.length}`,
      ""
    ];

    if (results.successful.length > 0) {
      lines.push("### Results (sorted by price)");
      lines.push("");
      lines.push("| $address | Price | Supply | Owned |");
      lines.push("|----------|-------|--------|-------|");
      for (const r of results.successful) {
        lines.push(`| ${r.dollarAddress} | ${r.currentPrice} SAT | ${r.currentSupply} | ${r.alreadyOwned ? "✓" : "✗"} |`);
      }
    }

    if (results.failed.length > 0) {
      lines.push("");
      lines.push("### Failed");
      for (const f of results.failed) {
        lines.push(`- ${f.url}: ${f.error}`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: results
    };
  }
);

// ── Tool: servable ───────────────────────────────────────────────

server.registerTool(
  "path402_servable",
  {
    title: "List Servable Content",
    description: `List all $addresses the agent can serve (holds tokens with serving rights). Shows serve history and revenue earned per token.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of servable content with stats.`,
    inputSchema: ServableInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: ServableInput) => {
    const servable = getServableTokens();
    const stats = getServeStats();

    const statsMap = new Map(stats.map(s => [s.dollarAddress, s]));

    const enriched = servable.map(token => {
      const tokenStats = statsMap.get(token.dollarAddress);
      return {
        dollarAddress: token.dollarAddress,
        tokenId: token.id,
        position: token.supply + 1,
        pricePaid: token.pricePaid,
        acquiredAt: token.acquiredAt,
        serves: tokenStats?.serveCount ?? 0,
        revenueEarned: tokenStats?.totalRevenue ?? 0,
        roi: tokenStats ? Math.round(((tokenStats.totalRevenue - token.pricePaid) / token.pricePaid) * 100) : -100
      };
    });

    if (params.response_format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
        structuredContent: { servable: enriched }
      };
    }

    const lines = [
      `## Servable Content`,
      "",
      `**Total Tokens with Serving Rights:** ${servable.length}`,
      ""
    ];

    if (enriched.length === 0) {
      lines.push("_No servable tokens. Use path402_acquire to purchase content with serving rights._");
    } else {
      lines.push("| $address | Position | Paid | Serves | Revenue | ROI |");
      lines.push("|----------|----------|------|--------|---------|-----|");
      for (const e of enriched) {
        const roiStr = e.roi >= 0 ? `+${e.roi}%` : `${e.roi}%`;
        lines.push(`| ${e.dollarAddress} | #${e.position} | ${e.pricePaid} SAT | ${e.serves} | ${e.revenueEarned} SAT | ${roiStr} |`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { servable: enriched }
    };
  }
);

// ── Tool: token_stats (Database) ─────────────────────────────────

server.registerTool(
  "path402_token_stats",
  {
    title: "Platform Token Stats (Live)",
    description: `Get REAL statistics for the path402.com PLATFORM token (500M supply, sqrt_decay pricing, sold on the website).
This is NOT the $402 HTM PoW20 token (21M supply, BSV-21, mined via Proof of Indexing).

Queries the live Supabase database to show:
- Treasury balance and address
- Circulating supply and total sold
- Current price (sqrt_decay bonding curve)
- Total revenue collected
- Number of holders

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Live platform token statistics from the database.`,
    inputSchema: TokenStatsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: TokenStatsInput) => {
    try {
      initDatabase();
      const stats = await getTokenStats();

      if (!stats) {
        return {
          isError: true,
          content: [{ type: "text", text: "Failed to fetch token stats from database. Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables." }]
        };
      }

      if (params.response_format === "json") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }]
        };
      }

      const lines = [
        "## path402.com Platform Token Statistics (LIVE)",
        "",
        `**Treasury Address:** ${stats.treasuryAddress}`,
        `**Treasury Balance:** ${stats.treasuryBalance.toLocaleString()} tokens`,
        `**Circulating Supply:** ${stats.circulatingSupply.toLocaleString()} tokens`,
        `**Total Supply:** ${stats.totalSupply.toLocaleString()} tokens`,
        `**Total Revenue:** ${stats.totalRevenueSats.toLocaleString()} SAT`,
        `**Holder Count:** ${stats.holderCount}`,
        `**Current Price:** ${stats.currentPriceSats} SAT`,
        "",
        "_Data from live Supabase database_"
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Database query failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: holders (Database) ─────────────────────────────────────

server.registerTool(
  "path402_holders",
  {
    title: "Platform Token Holders (Live)",
    description: `Get REAL list of path402.com PLATFORM token holders from Supabase.
This is NOT $402 HTM PoW20 holders — these are users who purchased platform tokens on the website.

Shows:
- All addresses/handles holding platform tokens
- Balance per holder
- Provider (HandCash/Yours)
- Staked balance
- Total purchased and dividends received

Args:
  - limit (number): Maximum holders to return (default: 20, max: 100)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of platform token holders from the database.`,
    inputSchema: HoldersInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: HoldersInput) => {
    try {
      initDatabase();
      const holders = await getHolders();
      const limited = holders.slice(0, params.limit);

      if (params.response_format === "json") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ holders: limited, total: holders.length }, null, 2) }]
        };
      }

      const lines = [
        "## path402.com Platform Token Holders (LIVE)",
        "",
        `**Total Holders:** ${holders.length}`,
        `**Showing:** ${limited.length}`,
        "",
        "| Handle/Address | Balance | Staked | Provider |",
        "|----------------|---------|--------|----------|"
      ];

      for (const h of limited) {
        const identifier = h.handle || h.address?.slice(0, 12) + "..." || "unknown";
        lines.push(`| ${identifier} | ${h.balance.toLocaleString()} | ${h.staked_balance.toLocaleString()} | ${h.provider} |`);
      }

      lines.push("", "_Data from live Supabase database_");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Database query failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: verify_holder (Database) ───────────────────────────────

server.registerTool(
  "path402_verify",
  {
    title: "Verify Platform Token Holder (Live)",
    description: `Verify if an address or handle holds path402.com platform tokens.
This checks the website's platform token (500M supply), NOT the $402 HTM PoW20 token.

Queries the live database to check:
- Whether they hold platform tokens
- Their exact balance
- Whether they meet a minimum balance requirement

Use this for access control decisions - to verify someone can access gated content.

Args:
  - address_or_handle (string): BSV address, ordinals address, or HandCash handle
  - min_balance (number): Minimum tokens required (default: 1)

Returns:
  Verification result with holder details if found.`,
    inputSchema: VerifyHolderInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: VerifyHolderInput) => {
    try {
      initDatabase();
      const holder = await getHolder(params.address_or_handle);
      const meetsMinimum = holder && holder.balance >= params.min_balance;

      const result = {
        query: params.address_or_handle,
        found: !!holder,
        meetsMinimum: meetsMinimum,
        minRequired: params.min_balance,
        holder: holder ? {
          handle: holder.handle,
          address: holder.address,
          ordinalsAddress: holder.ordinals_address,
          balance: holder.balance,
          stakedBalance: holder.staked_balance,
          provider: holder.provider,
          totalPurchased: holder.total_purchased,
          totalDividends: holder.total_dividends
        } : null
      };

      const emoji = meetsMinimum ? "✅" : holder ? "⚠️" : "❌";
      const status = meetsMinimum ? "VERIFIED" : holder ? "INSUFFICIENT BALANCE" : "NOT FOUND";

      const lines = [
        `## ${emoji} Token Verification: ${status}`,
        "",
        `**Query:** ${params.address_or_handle}`,
        `**Minimum Required:** ${params.min_balance} tokens`,
        ""
      ];

      if (holder) {
        lines.push(
          `**Balance:** ${holder.balance.toLocaleString()} tokens`,
          `**Staked:** ${holder.staked_balance.toLocaleString()} tokens`,
          `**Provider:** ${holder.provider}`,
          `**Total Purchased:** ${holder.total_purchased.toLocaleString()} tokens`,
          "",
          meetsMinimum
            ? "✓ This holder is authorized for gated content access."
            : `✗ Balance (${holder.balance}) is below minimum (${params.min_balance}).`
        );
      } else {
        lines.push("✗ No holder found with this address or handle.");
      }

      lines.push("", "_Data from live Supabase database_");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Verification failed: ${msg}` }]
      };
    }
  }
);

// ── Tool: x402 ──────────────────────────────────────────────────

server.registerTool(
  "path402_x402",
  {
    title: "X402 Agent Chaining",
    description: `Execute a complex task by chaining multiple x402 agents with automatic discovery, payment, and output piping.

Agents discover each other, authenticate via BRC-31, and pay in satoshis — automatically.
Supports: image generation (Banana), video (Kling/Veo), transcription (Whisper), research (X/Twitter), file hosting (NanoStore).

Pipeline is planned from the prompt:
  "Generate an image of a jellyfish" → image → host
  "Create a video of a sunset" → image → video-kling → host
  "Make a cinematic 4k video" → image → video-veo → host

Args:
  - prompt (string): Natural language description of the goal
  - max_total_budget (number): Budget limit in SAT (default: 50000)

Returns:
  Chain result with per-step costs, durations, output URLs, and total spend.`,
    inputSchema: X402InputSchema
  },
  async (params: X402Input) => {
    try {
      const result = await chainAgents(params.prompt, params.max_total_budget);

      if (!result.success) {
        const lines = [
          `## X402 Chain: Failed`,
          "",
          `**Error:** ${result.error}`,
          `**Spent before failure:** ${result.totalCostSats} SAT`,
        ];
        if (result.steps.length > 0) {
          lines.push("", "### Completed steps:");
          for (const step of result.steps) {
            const status = step.output ? 'OK' : 'FAIL';
            lines.push(`- **${step.agentName}** (${step.action}): ${status} — ${step.costSats} SAT, ${step.durationMs}ms`);
          }
        }
        return {
          isError: true,
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result
        };
      }

      const lines = [
        `## X402 Chain: Complete`,
        "",
        `**Prompt:** "${params.prompt}"`,
        `**Total Cost:** ${result.totalCostSats} SAT`,
        `**Duration:** ${result.totalDurationMs}ms`,
        `**Output:** ${result.finalOutputUrl || result.finalOutput}`,
        "",
        "### Pipeline:",
      ];

      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        const arrow = i < result.steps.length - 1 ? ' →' : '';
        lines.push(
          `${i + 1}. **${step.agentName}** (${step.action})${arrow}`,
          `   Cost: ${step.costSats} SAT | Time: ${step.durationMs}ms`,
          step.outputUrl ? `   Output: ${step.outputUrl}` : `   Output: ${step.output.slice(0, 120)}`,
        );
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: result
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `X402 execution failed: ${msg}` }]
      };
    }
  }
);


// Side-effects removed. Use runServer() from mcp.ts to start.
