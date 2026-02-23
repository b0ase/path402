# Claude Agent Guide - path402 Monorepo

## The Big Picture

**path402** is a turbo monorepo implementing the $402 protocol — a system that turns any URL path into a priced, tokenised market on Bitcoin SV.

```
path402/
├── packages/core/    ← MCP Server + Token Minting + Content Store + Pricing
├── packages/htm/     ← Hash-to-Mint sCrypt smart contract
├── packages/indexer/ ← BSV-21 token transfer indexer
├── packages/api/     ← API server
├── packages/ui/      ← Shared UI components
├── apps/desktop/     ← Electron desktop client
├── apps/web/         ← Next.js web interface
├── apps/mobile/      ← Mobile app (planned)
├── contracts/        ← sCrypt smart contracts
├── mcp/              ← MCP configuration
└── docs/             ← Protocol documentation
```

## Critical Rules

### 1. Package Manager
**ALWAYS use pnpm.** This is a pnpm workspace monorepo.

```bash
pnpm install        # Install all deps
pnpm dev            # Start all apps in dev mode
pnpm build          # Build all packages
pnpm --filter core  # Target a specific package
```

### 2. Core Package (`packages/core/src/`)
This is the heart of the protocol. Key modules:

| Module | Purpose |
|--------|---------|
| `index.ts` | MCP Server with 13 tools (discover, acquire, serve, etc.) |
| `token/mint.ts` | BSV21 token minting + inscription generation |
| `content/fs-store.ts` | SHA-256 content-addressed storage |
| `services/pricing.ts` | ascending bonding curve pricing |
| `services/wallet.ts` | Agent wallet management |
| `services/mining.ts` | Proof-of-Indexing mining service |
| `services/dns.ts` | Domain verification for DNS-DEX |
| `client/agent.ts` | Autonomous P2P agent |
| `wallet/` | Multi-wallet manager (Metanet, HandCash, Yours, Manual) |

### 3. Token Standard
Tokens use **BSV-21** (fungible tokens via inscriptions):
- Default supply: 1,000,000,000 (1 billion)
- Symbol format: `$NAME` (uppercase, 1-20 chars)
- Reserved symbols: `$402`, `$BSV`, `$BTC`, `$ETH`, `$SOL`, `$USDT`, `$USDC`

### 4. MCP Tools (13 registered)
```
path402_discover        → Probe a $address for pricing
path402_evaluate        → Budget check before buying
path402_acquire         → Pay + receive token + content
path402_serve           → Serve content you hold (earn revenue)
path402_wallet          → View balance and portfolio
path402_price_schedule  → See pricing curve projections
path402_set_budget      → Configure spending limits
path402_economics       → Deep ROI/breakeven analysis
path402_batch_discover  → Discover multiple addresses
path402_servable        → List tokens you can serve
path402_token_stats     → On-chain token statistics
path402_holders         → List token holders
path402_verify_holder   → Verify someone holds a token
path402_connect_wallet  → Connect external wallet
```

### 5. Key Protocol Concepts
- **$address**: A dollar-prefixed path (e.g., `$b0ase.com/$blog`)
- **alice_bond: Price = c × n (ascending bonding curve — each token individually priced)
- **Proof of Serve**: Nodes earn by serving content, not wasting compute
- **Serving Rights**: Token holders can re-serve content and earn revenue

## Common Tasks

### Running the Agent
```bash
export HTM_TOKEN_ID=<contract_txid>_0
export PATHD_WALLET_KEY=<wif_key>
npx path402 agent start
```

### Minting a Token
```typescript
import { prepareMint } from '@b0ase/path402-core';
const result = prepareMint({
  symbol: '$MYTOKEN',
  issuerAddress: '1...',
  description: 'My token'
});
```

## Related Projects
- **pathd** (Go daemon): `b0ase.com/pathd/` — serves $402 content
- **path402.com**: Protocol website (`path402-com/`)
- **bit-sign.online**: Identity signer for $401
