# path402-mcp-server

Agent tools for the **$PATH402 protocol**.

An MCP server that enables AI agents to discover, evaluate, acquire, and serve tokenised content behind `$` addresses.

## What is $PATH402?

$PATH402 is a protocol that turns any URL path into a priced, tokenised market. Put a `$` in front of a path segment and it becomes an economic object with a price curve, a supply count, holders who serve the content, and revenue that flows to participants.

The name combines:
- **$PATH** — the namespace/directory concept (every `$address` is a path)
- **402** — HTTP 402 Payment Required (the response that triggers payment)

```
$PATH402 protocol
├── path402.com (official site + docs)
├── $pathd (the daemon — any machine can run it)
├── path402-mcp-server (the agent tool)  ← YOU ARE HERE
├── path402.com/exchange (token marketplace)
└── b0ase.com/exchange (live trading)
```

| Component | What it is | Link |
|-----------|-----------|------|
| **$PATH402** | The protocol | [path402.com](https://path402.com) |
| **Docs** | Full documentation | [path402.com/docs](https://path402.com/docs) |
| **path402-mcp-server** | AI agent tools | [npm](https://www.npmjs.com/package/path402-mcp-server) |
| **Exchange** | Token marketplace | [path402.com/exchange](https://path402.com/exchange) |
| **Live Trading** | Trade real tokens | [b0ase.com/exchange](https://b0ase.com/exchange) |

Learn more: [path402.com](https://path402.com)

## Why AI Agents?

$PATH402 was designed with AI agents as **first-class consumers**. Agents don't have micropayment friction — they make cost-driven decisions. When an agent needs information behind a $address, it:

1. **Discovers** the price and terms
2. **Evaluates** whether the ROI makes sense
3. **Acquires** the token (paying automatically)
4. **Serves** the content to future buyers (earning revenue)

Over time, a well-configured agent becomes **self-funding**: the revenue from serving exceeds the cost of acquiring. This is not marketing — it's a mathematical property of sqrt_decay pricing.

## Tools

| Tool | Description |
|------|-------------|
| `path402_discover` | Probe a $address — get pricing, supply, revenue model, nested paths |
| `path402_evaluate` | Budget check — should the agent buy? Returns ROI estimate |
| `path402_acquire` | Pay and receive token + content. Agent becomes a serving node |
| `path402_serve` | Serve content to a requester and earn revenue |
| `path402_wallet` | View balance, tokens held, total spent/earned, net position |
| `path402_servable` | List all content the agent can serve (tokens with serving rights) |
| `path402_economics` | Deep dive into breakeven, ROI projections, and the math |
| `path402_batch_discover` | Discover multiple $addresses at once (efficient exploration) |
| `path402_price_schedule` | See how price decays with supply for a given endpoint |
| `path402_set_budget` | Configure the agent's spending budget |

## Quick Start

```bash
npm install path402-mcp-server
```

Or run directly:

```bash
npx path402-mcp-server
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "path402": {
      "command": "npx",
      "args": ["path402-mcp-server"]
    }
  }
}
```

Then ask Claude:

> "Discover what's available at $b0ase.com/$blog"
> "Is it worth buying this content?"
> "Show me the economics of $b0ase.com/$blog/$metaweb-economics"
> "Acquire the token for $b0ase.com/$blog/$metaweb-economics"
> "Show me my wallet"
> "What content can I serve?"

## Agent Workflow

```
1. DISCOVER  →  Agent probes a $address, reads pricing terms
2. EVALUATE  →  Agent checks budget, estimates ROI
3. ACQUIRE   →  Agent pays, receives token + content
4. SERVE     →  Agent holds token, earns from future buyers
5. REPEAT    →  Agent reinvests earnings, grows portfolio
```

The agent's wallet tracks all tokens, spending, and earnings. Over time, a well-configured agent acquires content that earns more from serving than it cost to buy — making the agent self-funding.

### The Economics Tool

The `path402_economics` tool provides detailed financial analysis:

```
> "Show me the economics of $b0ase.com/$premium/$guide"

## $PATH402 Economics: $b0ase.com/$premium/$guide

### Current State
- Supply: 23 tokens issued
- Your Position: #24 (next buyer)
- Price to Acquire: 208 SAT
- Pricing Model: sqrt_decay
- Issuer Share: 50%

### Breakeven Analysis
- Buyers needed to break even: 12
- Supply at breakeven: 36
- Breakeven probability: High

### ROI Projections
| Supply Level | ROI |
|--------------|-----|
| 46 (2x current) | 67% |
| 230 (10x current) | 412% |
| 1000 (projected) | 1847% |

### Revenue Projection (at 1000 supply)
- Gross Revenue: 31,623 SAT
- Issuer Revenue: 15,812 SAT
- Network Revenue: 15,812 SAT
- Your Est. Share: ~31 SAT
```

## $PATH402 Protocol Overview

### $addresses

Content behind `$` path segments is $PATH402-gated:

```
$b0ase.com                    → site-level token (cheap)
$b0ase.com/$blog              → section token
$b0ase.com/$blog/$my-post     → content token (the actual content)
```

Each `$` segment is an independent market with its own price and token.

### Pricing Models

- **Fixed** — same price for everyone
- **Square root decay** — price decreases as `P/√n` (default, recommended)
- **Logarithmic decay** — gentler price decrease
- **Linear with floor** — linear decrease to a minimum

### Revenue Models

- **Fixed issuer share** — creator gets X%, serving nodes split the rest
- **Equal split** — all token holders share equally
- **Decaying issuer** — creator share starts high, network share grows

### The Key Insight

Under square root decay pricing with proportional serving, **every buyer except the last achieves positive ROI**. This is a mathematical property of the curve, not a marketing claim. It's what makes $PATH402 different from a simple paywall.

## Self-Funding Agents

The vision: an AI agent that starts with a small balance and grows it by:

1. Acquiring undervalued tokens early
2. Serving content to later buyers
3. Reinvesting earnings into new tokens
4. Eventually operating at profit

This is possible because sqrt_decay pricing mathematically guarantees positive returns for early buyers. The agent's job is to identify good opportunities early.

### Agent Strategy Tips

- **Buy early**: Position matters. #5 earns more than #500.
- **Check breakeven**: If breakeven requires 1000+ future buyers, skip.
- **Diversify**: Hold multiple tokens to average out risk.
- **Serve actively**: Revenue only flows when you serve.
- **Monitor ROI**: Use `path402_servable` to track performance.

## Current Status

**v0.2.0 — Enhanced Agent Tools**

- ✅ Full tool suite (discover, evaluate, acquire, serve, wallet, economics)
- ✅ Batch discovery for efficient exploration
- ✅ Servable content listing with ROI tracking
- ✅ Detailed economics analysis with breakeven and projections
- ✅ Pricing engine (all four models)
- ✅ ROI estimation
- ✅ Mock server for testing without a live $PATH402 endpoint
- ✅ stdio and HTTP transport
- 🔲 Real HTTP client (connecting to live $pathd servers)
- 🔲 HandCash wallet integration (real payments)
- 🔲 Multi-agent serving network
- 🔲 Token persistence across sessions

## Architecture

```
path402-mcp-server/
├── src/
│   ├── index.ts           # MCP server + tool registration
│   ├── types.ts           # $PATH402 protocol types
│   ├── constants.ts       # Protocol constants
│   ├── schemas/
│   │   └── inputs.ts      # Zod input schemas
│   └── services/
│       ├── client.ts      # HTTP client for $PATH402 endpoints
│       ├── pricing.ts     # Price calculation + economics engine
│       └── wallet.ts      # Token portfolio + budget + serving
└── dist/                  # Compiled JavaScript
```

## Related Components

| Component | Description | Link |
|-----------|-------------|------|
| **path402.com** | Official protocol website | [path402.com](https://path402.com) |
| **Documentation** | Full docs and guides | [path402.com/docs](https://path402.com/docs) |
| **Exchange** | Token marketplace | [path402.com/exchange](https://path402.com/exchange) |
| **$pathd** | The daemon (serves $PATH402 content) | [github.com/b0ase/pathd](https://github.com/b0ase/pathd) |
| **Live Trading** | Trade real tokens | [b0ase.com/exchange](https://b0ase.com/exchange) |

## License

MIT
