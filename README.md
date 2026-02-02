# $PATH402 MCP Server

> **Turn AI agents into autonomous economic actors.**

The PATH402 MCP Server enables AI agents (Claude, GPT, etc.) to discover, evaluate, acquire, and serve tokenized content through the $402 protocol. Agents can operate autonomously, managing budgets, making investment decisions, and earning revenue.

[![npm version](https://badge.fury.io/js/path402-mcp-server.svg)](https://www.npmjs.com/package/path402-mcp-server)
[![License: Open BSV](https://img.shields.io/badge/License-Open%20BSV-blue.svg)](https://github.com/b0ase/path402-mcp-server/blob/main/LICENSE)

## Quick Start

### Installation

```bash
npm install path402-mcp-server
# or
npx path402-mcp-server
```

### Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "path402": {
      "command": "npx",
      "args": ["path402-mcp-server"],
      "env": {
        "PATH402_API_URL": "https://path402.com",
        "PATH402_DEFAULT_BUDGET": "10000"
      }
    }
  }
}
```

### First Conversation

```
You: "Discover what's available at $b0ase.com"

Claude: [Uses path402_discover to probe the $address]
        Found 3 nested tokens:
        - $b0ase.com/$blog (500 sats, 0 supply)
        - $b0ase.com/$api (1000 sats, 0 supply)
        - $b0ase.com/$premium (2500 sats, 0 supply)

You: "Evaluate if $b0ase.com/$blog is worth acquiring"

Claude: [Uses path402_evaluate and path402_economics]
        ROI Analysis:
        - Current price: 500 sats
        - Breakeven: 1 serve at current rates
        - Projected ROI: 340% over 30 days
        Recommendation: ACQUIRE (high confidence)

You: "Acquire 10 tokens"

Claude: [Uses path402_acquire]
        Acquired 10 $b0ase.com/$blog tokens
        Total cost: 5,000 sats
        New balance: 10 tokens
```

---

## The $402 Protocol

### What is $402?

$402 turns URL paths into tokenized markets. Any path prefixed with `$` becomes an economic object:

```
$example.com              → Site-level token
$example.com/$api         → API access token
$example.com/$api/$premium → Premium tier token
```

Each token has:
- **Price curve** (sqrt_decay by default)
- **Supply counter** (increases with each acquisition)
- **Holder registry** (who owns what)
- **Revenue distribution** (issuer/facilitator split)

### sqrt_decay Pricing

Price is determined by remaining treasury, not speculation:

```
price = base_price / √(treasury_remaining + 1)
```

| Treasury | Price | % Sold |
|----------|-------|--------|
| 500M | 10 sats | 0% |
| 100M | 22 sats | 80% |
| 10M | 71 sats | 98% |
| 1M | 224 sats | 99.8% |
| 1K | 7,072 sats | 99.9998% |

**Key insight**: Early buyers always get better prices. This creates natural incentives for discovery and early adoption.

### Self-Funding Agents

Agents can become economically self-sustaining:

1. **Acquire** tokens at current price
2. **Serve** content to other agents/users
3. **Earn** revenue from serving
4. **Reinvest** profits into more tokens

The sqrt_decay model mathematically guarantees that early acquirers can achieve positive ROI through serving.

---

## Complete Tool Reference

### Discovery & Evaluation

| Tool | Description |
|------|-------------|
| `path402_discover` | Probe a $address for pricing, supply, revenue model, and nested paths |
| `path402_batch_discover` | Discover multiple $addresses in a single call |
| `path402_evaluate` | Assess ROI viability before purchasing |
| `path402_economics` | Deep financial analysis: breakeven, projections, scenarios |
| `path402_price_schedule` | View how price changes across supply levels |

#### path402_discover

```typescript
// Input
{
  address: "$example.com/$api"
}

// Output
{
  address: "$example.com/$api",
  exists: true,
  pricing: {
    model: "sqrt_decay",
    base_price_sats: 1000,
    current_price_sats: 45,
    treasury_remaining: 499500000
  },
  supply: {
    total: 500000,
    max: null
  },
  revenue_split: {
    issuer_bps: 8000,
    facilitator_bps: 2000
  },
  nested: [
    "$example.com/$api/$premium",
    "$example.com/$api/$enterprise"
  ],
  content_type: "application/json",
  description: "API access credits"
}
```

#### path402_evaluate

```typescript
// Input
{
  address: "$example.com/$api",
  amount: 100,
  budget_sats: 10000
}

// Output
{
  recommendation: "ACQUIRE",
  confidence: 0.85,
  analysis: {
    total_cost_sats: 4500,
    within_budget: true,
    avg_price_per_token: 45,
    breakeven_serves: 5,
    projected_roi_30d: 0.34,
    risk_level: "low"
  },
  reasoning: "Early position in growing market. Favorable price curve."
}
```

### Acquisition & Wallet

| Tool | Description |
|------|-------------|
| `path402_acquire` | Purchase tokens and receive gated content |
| `path402_set_budget` | Configure agent spending parameters |
| `path402_wallet` | View balance, holdings, and net financial position |
| `path402_transfer` | Transfer tokens to another address |
| `path402_history` | View transaction history |

#### path402_acquire

```typescript
// Input
{
  address: "$example.com/$api",
  amount: 100
}

// Output
{
  success: true,
  acquired: 100,
  total_cost_sats: 4500,
  avg_price: 45,
  new_balance: 100,
  content: {
    type: "api_key",
    value: "sk_live_xxx...",
    expires: null
  },
  txId: "bsv_abc123..."
}
```

#### path402_wallet

```typescript
// Output
{
  balance_sats: 45000,
  holdings: [
    {
      address: "$example.com/$api",
      balance: 100,
      avg_cost: 45,
      current_value: 4800,
      unrealized_pnl: 300
    }
  ],
  total_value_sats: 49800,
  total_cost_sats: 49500,
  net_pnl_sats: 300,
  serving_revenue_sats: 1200
}
```

### Serving & Revenue

| Tool | Description |
|------|-------------|
| `path402_serve` | Distribute content and earn revenue |
| `path402_servable` | List all content the agent can serve |
| `path402_register` | Register a new $address as issuer |

#### path402_serve

```typescript
// Input
{
  address: "$example.com/$api",
  requester: "agent_xyz",
  amount: 1
}

// Output
{
  served: true,
  tokens_consumed: 1,
  revenue_earned_sats: 40,
  remaining_balance: 99,
  content_delivered: true
}
```

#### path402_servable

```typescript
// Output
{
  servable: [
    {
      address: "$example.com/$api",
      balance: 99,
      serves_remaining: 99,
      revenue_per_serve: 40,
      total_potential_revenue: 3960
    }
  ],
  total_serves_available: 99,
  total_potential_revenue_sats: 3960
}
```

### x402 Facilitator Tools

| Tool | Description |
|------|-------------|
| `x402_verify` | Verify payment proof from any supported chain |
| `x402_settle` | Settle cross-chain payment via facilitator |
| `x402_inscription` | Get or create BSV inscription proof |

#### x402_verify

```typescript
// Input
{
  payment_proof: "0xabc123...",
  network: "base",
  expected_amount: 1000,
  expected_recipient: "0x..."
}

// Output
{
  valid: true,
  network: "base",
  amount_sats: 1000,
  recipient: "0x...",
  sender: "0x...",
  txId: "0x...",
  timestamp: "2026-02-02T10:00:00Z",
  facilitator: "path402.com"
}
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PATH402_API_URL` | `https://path402.com` | API endpoint |
| `PATH402_DEFAULT_BUDGET` | `10000` | Default budget in sats |
| `PATH402_WALLET_KEY` | - | Wallet signing key (for payments) |
| `PATH402_AUTO_ACQUIRE` | `false` | Auto-acquire when recommended |
| `PATH402_MAX_SINGLE_SPEND` | `5000` | Max sats per single acquisition |
| `PATH402_LOG_LEVEL` | `info` | Logging verbosity |

### Advanced Configuration

```json
{
  "mcpServers": {
    "path402": {
      "command": "npx",
      "args": ["path402-mcp-server"],
      "env": {
        "PATH402_API_URL": "https://path402.com",
        "PATH402_DEFAULT_BUDGET": "50000",
        "PATH402_AUTO_ACQUIRE": "true",
        "PATH402_MAX_SINGLE_SPEND": "10000",
        "PATH402_WALLET_KEY": "your-wallet-key",
        "PATH402_LOG_LEVEL": "debug"
      }
    }
  }
}
```

---

## Use Cases

### 1. Content Discovery Agent

```
Agent explores the $402 namespace, discovering valuable content:

1. path402_batch_discover(["$news.com", "$research.org", "$data.io"])
2. path402_evaluate() on promising finds
3. path402_acquire() undervalued tokens
4. path402_serve() to users who request content
```

### 2. API Gateway Agent

```
Agent manages API access for a team:

1. path402_acquire("$api.service.com", 1000)
2. path402_wallet() to track usage
3. path402_serve() when team members need API calls
4. path402_acquire() more when balance runs low
```

### 3. Research Agent

```
Agent gathers information from paywalled sources:

1. path402_discover() research databases
2. path402_economics() to evaluate cost/benefit
3. path402_acquire() access to valuable sources
4. Compile research using acquired content
```

### 4. Revenue-Generating Agent

```
Agent that pays for itself:

1. path402_acquire() tokens at low prices
2. path402_servable() to list inventory
3. path402_serve() to other agents
4. path402_wallet() to track profits
5. Reinvest profits into more tokens
```

---

## Supported Networks

| Network | Status | Assets |
|---------|--------|--------|
| BSV | Primary | BSV, BSV-20 tokens |
| Base | Supported | USDC, ETH |
| Solana | Supported | USDC, SOL |
| Ethereum | Supported | USDC, ETH, USDT |

BSV is the settlement layer. Payments from other chains are verified and inscribed on BSV for permanent proof.

---

## API Reference

### PATH402.com Endpoints

**$PATH402 Token (PATH402's own token)**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token/stats` | GET | $PATH402 statistics & pricing |
| `/api/token/buy` | POST | Acquire $PATH402 tokens |
| `/api/token/holding` | GET | User's $PATH402 holdings |

**Multi-Tenant Marketplace (any $address)**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tokens` | GET | List all registered tokens |
| `/api/tokens` | POST | Register new $address |
| `/api/tokens/[address]` | GET | Token details + price schedule |
| `/api/tokens/[address]` | POST | Acquire tokens |
| `/api/tokens/holdings` | GET | User's holdings (all tokens) |
| `/api/tokens/transfer` | POST | Transfer tokens |
| `/api/tokens/history` | GET | Transaction history |

**x402 Facilitator (payment verification)**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/x402.json` | GET | Discovery document |
| `/api/x402/verify` | POST | Verify payment |
| `/api/x402/settle` | POST | Settle payment |
| `/api/x402/inscription` | GET/POST | Inscription management |
| `/api/x402/stats` | GET | Facilitator statistics |

---

## Development

### Running Locally

```bash
git clone https://github.com/b0ase/path402-mcp-server
cd path402-mcp-server
npm install
npm run dev
```

### Testing

```bash
npm test
npm run test:integration
```

### Building

```bash
npm run build
```

---

## Roadmap

### v1.0.0 (Current)
- ✅ 10 core tools
- ✅ sqrt_decay pricing
- ✅ Budget management
- ✅ Simulated acquisition/serving

### v1.1.0 (In Progress)
- 🔲 Live HTTP client for path402.com
- 🔲 x402 facilitator tools (verify, settle, inscription)
- 🔲 Real payment integration

### v1.2.0 (Planned)
- 🔲 Transfer and history tools
- 🔲 Multi-agent coordination
- 🔲 Persistent storage

### v1.3.0 (Planned)
- 🔲 Creator tools (register)
- 🔲 Advanced analytics
- 🔲 Agent marketplace integration

---

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

```bash
# Fork the repo
git checkout -b feature/your-feature
# Make changes
npm test
git commit -m "Add your feature"
git push origin feature/your-feature
# Open a PR
```

---

## License

[Open BSV License version 4](LICENSE)

---

## Links

- **Website**: [path402.com](https://path402.com)
- **Whitepaper**: [path402.com/402](https://path402.com/402)
- **Exchange**: [path402.com/exchange](https://path402.com/exchange)
- **Documentation**: [path402.com/docs](https://path402.com/docs)
- **GitHub**: [github.com/b0ase/path402-mcp-server](https://github.com/b0ase/path402-mcp-server)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/b0ase/path402-mcp-server/issues)
- **Email**: hello@b0ase.com
- **Twitter**: [@b0ase](https://twitter.com/b0ase)

---

**Built by [b0ase.com](https://b0ase.com)** | **Powered by BSV**
