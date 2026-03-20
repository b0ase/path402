---
last_mapped: 2026-03-06T00:00:00Z
total_files: 373
total_tokens: 640000
---

# path402 Monorepo — Codebase Map

**Version**: 4.0.0-alpha.2
**Build System**: Turbo + pnpm workspaces
**Languages**: TypeScript (ESM) + Go 1.21
**Status**: Active Protocol Implementation

---

## System Overview

path402 is a decentralized protocol implementing HTTP 402 Payment Required across the Bitcoin network. It combines:

- **Proof of Indexing mining** (21M $402 HTM tokens via sCrypt on-chain)
- **Content tokenization** ($domain.com/$path as priced, gated markets)
- **Multi-transport gossip** (libp2p, HTTP relay, LAN broadcast)
- **Intelligence layer** (Claude + Ollama agents with 90% Strategy routing)
- **Speculation module** (autonomous token acquisition with 3 strategies)
- **Mobile-native support** (Go daemon via gomobile + Kotlin Android app)

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  Applications Layer                                           │
├──────────────────┬──────────────────┬───────────────────────┤
│ apps/clawminer   │ apps/desktop     │ apps/web              │
│ (Go daemon +     │ (Electron CJS)   │ (Web frontend)        │
│  Android app)    │                  │                       │
└────────┬─────────┴──────────┬───────┴──────────┬────────────┘
         │                    │                  │
┌────────┴────────────────────┴──────────────────┴────────────┐
│  Protocol Core (packages/core — @b0ase/path402-core)        │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Mining   │ Gossip   │ Services │ MCP      │ Intelligence    │
│ (SHA256d │ (libp2p  │ (Client, │ Tools    │ (Claude +       │
│  + PoI)  │ GossipSub│ Pricing, │ (13x)    │  Ollama)        │
│          │ + Relay) │ Wallet)  │          │                 │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬────────────┘
     │          │          │          │          │
┌────┴──────────┴──────────┴──────────┴──────────┴────────────┐
│  Data & Contract Layer                                       │
├──────────────────┬──────────────────┬──────────────────────┤
│ packages/htm     │ packages/indexer │ packages/types       │
│ (sCrypt BSV-21   │ (PoW20 sim)      │ (Shared types)       │
│ Hash-to-Mint)    │                  │                      │
└───────┬──────────┴────────┬─────────┴──────────────────────┘
        │                   │
        └─────────┬─────────┘
                  │
        ┌─────────┴──────────┐
        │  Backends          │
        ├──────────┬─────────┤
        │ SQLite   │ Supabase│
        │ (~path402)│ (platform)
        └──────────┴─────────┘
```

---

## Workspace Structure

### Root Configuration

```
path402/
├── package.json                — pnpm workspaces root
├── pnpm-workspace.yaml         — workspace definition
├── turbo.json                  — Turbo pipeline config
├── tsconfig.json               — Shared TypeScript config
├── .npmrc                       — pnpm config (shamefully-hoist=true)
└── .gitignore                  — Standard Node + Go ignores
```

### packages/ — Shared Libraries

#### packages/core (220KB, 8500+ lines)
**@b0ase/path402-core** — Main protocol library and MCP server

```
packages/core/
├── src/
│   ├── index.ts                    — MCP server entry, tool registry
│   │
│   ├── mining/                     — SHA256d Proof of Indexing
│   │   ├── hashUtils.ts            — SHA256(SHA256(...)) double hash
│   │   ├── blockStructures.ts      — PoIBlock, WorkItem, merkle root
│   │   ├── difficultyAdjuster.ts   — Bitcoin-style retarget (144 block)
│   │   ├── proofOfIndexing.ts      — Main PoI service, startMining()
│   │   └── broadcaster.ts          — Abstract interface for on-chain relay
│   │
│   ├── services/                   — Core services
│   │   ├── mining.ts               — ProofOfIndexingService orchestrator
│   │   ├── client.ts               — Path402Agent + CLI
│   │   ├── pricing.ts              — 4 models: linear, sqrt_decay, exponential, step
│   │   ├── wallet.ts               — BitcoinSV HDWallet, key mgmt
│   │   ├── database.ts             — SQLite layer, 18+ tables
│   │   ├── relay.ts                — RelayService for gossip broadcast
│   │   ├── dns.ts                  — $domain.com path resolution
│   │   ├── headers.ts              — BRC-105 402 header builder
│   │   ├── identity401.ts          — Identity chain integration (inlined strand logic)
│   │   ├── marketplace-bridge.ts    — Cross-protocol DEX bridge
│   │   ├── wallet-balance.ts        — Address balance queries (mempool.space)
│   │   └── x402.ts                 — Agent chaining for $402 operations
│   │
│   ├── gossip/                     — libp2p GossipSub mesh network
│   │   ├── gossipNode.ts           — GossipNode orchestrator
│   │   ├── protocol.ts             — 8 topics, subscribe/publish
│   │   ├── bootstrap.ts            — Peer discovery (135.181.103.181:4020)
│   │   ├── transports.ts           — TCP+Noise+Yamux stack
│   │   └── relay.ts                — Relay service integration
│   │
│   ├── intelligence/               — AI reasoning layer
│   │   ├── claude.ts               — Anthropic Claude provider
│   │   ├── ollama.ts               — Local Ollama inference
│   │   ├── strategies.ts           — 90% Strategy routing logic
│   │   └── types.ts                — IntelligenceProvider interface
│   │
│   ├── speculation/                — Autonomous token acquisition
│   │   ├── strategist.ts           — 3 strategies: momentum, arb, yield
│   │   ├── acquire.ts              — Acquisition executor (TODO: real BSV)
│   │   └── ledger.ts               — Transaction log
│   │
│   ├── content/                    — Content tokenization & storage
│   │   ├── store.ts                — Abstract ContentStore interface
│   │   ├── filesystem.ts           — Filesystem implementation
│   │   └── gating.ts               — BRC-105 402 gating
│   │
│   ├── gui/                        — Desktop HTTP server
│   │   ├── server.ts               — Express at :4021
│   │   ├── routes.ts               — API endpoints
│   │   └── workflow.ts             — Cashboard executor
│   │
│   ├── mcp/                        — MCP tools (13x)
│   │   ├── tools.ts                — Tool definitions + Zod schemas
│   │   ├── handlers/               — Individual tool implementations
│   │   │   ├── discover.ts         — path402_discover
│   │   │   ├── evaluate.ts         — evaluate
│   │   │   ├── acquire.ts          — acquire
│   │   │   ├── serve.ts            — serve
│   │   │   ├── wallet.ts           — wallet
│   │   │   ├── price_schedule.ts   — price_schedule
│   │   │   ├── set_budget.ts       — set_budget
│   │   │   ├── economics.ts        — economics
│   │   │   ├── batch_discover.ts   — batch_discover
│   │   │   ├── servable.ts         — servable
│   │   │   ├── token_stats.ts      — token_stats
│   │   │   ├── holders.ts          — holders
│   │   │   ├── verify_holder.ts    — verify_holder
│   │   │   └── connect_wallet.ts   — connect_wallet
│   │   └── schemas.ts              — Zod request/response schemas
│   │
│   ├── types/                      — Internal types
│   │   ├── mining.ts               — Block, WorkItem, PoI types
│   │   ├── market.ts               — Price, holding, tx types
│   │   ├── node.ts                 — Node, Peer, Message types
│   │   └── config.ts               — RuntimeConfig
│   │
│   ├── db/                         — SQLite database layer
│   │   ├── schema.ts               — 18+ table definitions
│   │   ├── queries.ts              — Common queries
│   │   └── migrations.ts           — Version management
│   │
│   ├── utils/                      — Utilities
│   │   ├── crypto.ts               — Hash, sign, verify
│   │   ├── encoding.ts             — Hex, base58, varint
│   │   ├── time.ts                 — Timestamps, block times
│   │   └── math.ts                 — Fixed-point, satoshi math
│   │
│   ├── config.ts                   — Runtime defaults
│   └── logger.ts                   — Winston logger
│
├── dist/                           — ESM build output
├── package.json                    — "type": "module"
└── tsconfig.json                   — strict: true
```

**Key Exports**:
- `MiningService`, `GossipNode`, `Path402Agent`, `ProofOfIndexingService`
- `createHTMBroadcaster()`, `createSQLiteDatabase()`
- All 13 MCP tool handlers

#### packages/htm (85KB, 2800 lines)
**@b0ase/path402-htm** — Hash-to-Mint sCrypt Contract (CJS)

```
packages/htm/
├── src/
│   ├── contract.ts                 — sCrypt Hash-to-Mint contract definition
│   │   ├── mint() method           — Validates SHA256d against target
│   │   ├── 33 halving blocks       — Explicit if-else for supply tiers
│   │   └── targetFrom…() getter    — Difficulty lookup
│   │
│   ├── broadcaster.ts              — HtmBroadcaster implementation
│   │   ├── broadcastMint()         — Fetch UTXO → mine nonce → build tx
│   │   ├── retryOnUTXOConflict()   — Handle mempool contention
│   │   └── validateTx()            — Script verification
│   │
│   ├── types.ts                    — HTM-specific types
│   └── config.ts                   — Contract constants, UTXO pool
│
├── contracts/
│   ├── AIGF.sol                    — Outdated (archived)
│   ├── HTM.sol                     — EVM version (research)
│   └── sCrypt/
│       └── HashToMint.scrypt       — Source (sCrypt lang)
│
├── dist/
│   ├── commonjs/                   — CJS build (required for scrypt-ts)
│   └── esm/                        — ESM build (for introspection)
│
├── package.json                    — "type": "module", "exports" dual
└── tsconfig.json
```

**CJS Requirement**: scrypt-ts does not support ESM. Bridge via `createRequire(import.meta.url)` in packages/core.

#### packages/indexer (60KB, 1900 lines)
**@b0ase/path402-indexer** — PoW20 Simulation & Index Service

```
packages/indexer/
├── src/
│   ├── pow20Simulator.ts           — Full PoW20 chain simulation
│   │   ├── mineBlock()             — Batch mining
│   │   ├── adjustDifficulty()      — Mimics HTM contract math
│   │   └── validateProof()         — PoW verification
│   │
│   ├── accumulator.ts              — WorkItem accumulation rules
│   ├── validator.ts                — PoI block validation
│   └── types.ts                    — Pow20Block, AccumState
│
├── dist/
└── package.json
```

#### packages/types (35KB, 1200 lines)
**@b0ase/path402-types** — Shared TypeScript types (published to npm)

```
packages/types/
├── src/
│   ├── mining.ts                   — PoIBlock, WorkItem, Solution
│   ├── market.ts                   — Price, Holding, Transaction
│   ├── network.ts                  — Message, Peer, Node
│   ├── config.ts                   — RuntimeConfig
│   └── index.ts                    — Public exports
│
├── dist/
└── package.json
```

#### packages/api (20KB, stub)
```
packages/api/
├── src/
│   └── server.ts                   — Express stub (port 3002)
└── package.json
```

#### packages/ui (25KB, stub)
```
packages/ui/
├── src/
│   └── components/
│       └── Placeholder.tsx         — React stub
└── package.json
```

### apps/ — Applications

#### apps/clawminer (900KB Go + Kotlin)
**Go mining daemon + Android app**

```
apps/clawminer/
├── cmd/
│   └── clawminerd/                 — Main binary entry
│       └── main.go                 — Initialize daemon
│
├── internal/
│   ├── daemon/                     — Daemon lifecycle
│   │   ├── server.go               — HTTP API (:8402)
│   │   ├── handlers.go             — REST endpoints
│   │   └── config.go               — Load from env/flags
│   │
│   ├── mining/                     — SHA256d PoI implementation
│   │   ├── miner.go                — Main mining loop
│   │   ├── hasher.go               — SHA256 double hash
│   │   ├── difficulty.go           — Retarget logic (matches TS)
│   │   └── solution.go             — Block submission
│   │
│   ├── gossip/                     — go-libp2p integration
│   │   ├── node.go                 — GossipSub peer
│   │   ├── pubsub.go               — Publish/subscribe
│   │   ├── bootstrap.go            — Peer discovery
│   │   ├── transports.go           — TCP+Noise+Yamux
│   │   └── topics.go               — 8 topic handlers
│   │
│   ├── db/                         — SQLite3 database
│   │   ├── schema.go               — Table definitions
│   │   ├── migrations.go           — Version control
│   │   └── queries.go              — CRUD operations
│   │
│   ├── relay/                      — HTTP relay client
│   │   ├── client.go               — POST to relay service
│   │   └── backoff.go              — Retry logic
│   │
│   ├── headers/                    — Block header sync
│   │   ├── syncer.go               — Download headers
│   │   └── validator.go            — Difficulty check
│   │
│   ├── scanner/                    — Mempool scanner
│   │   ├── scanner.go              — Poll for work items
│   │   └── parser.go               — Parse transactions
│   │
│   ├── wallet/                     — Bitcoin wallet
│   │   ├── hd.go                   — HD derivation
│   │   ├── signing.go              — Sign transactions
│   │   └── utxo.go                 — UTXO tracking
│   │
│   ├── server/                     — HTTP server (mirrors TS GUI)
│   │   ├── routes.go               — API endpoints
│   │   └── handlers.go             — Handler functions
│   │
│   ├── mcp/                        — MCP protocol client
│   │   ├── client.go               — Connect to TS MCP server
│   │   └── tools.go                — Invoke tools
│   │
│   ├── content/                    — Content store
│   │   ├── manager.go              — File operations
│   │   └── gating.go               — BRC-105 402 gating
│   │
│   ├── config/                     — Configuration
│   │   ├── parser.go               — ENV/flags parsing
│   │   └── defaults.go             — Hard defaults
│   │
│   └── logger/                     — Structured logging
│       └── log.go                  — Zap logger setup
│
├── mobile/                         — gomobile bindings
│   ├── daemon.go                   — Exported Go methods for Android
│   │   ├── Start()                 — Launch daemon
│   │   ├── Stop()                  — Shutdown
│   │   ├── GetStatus()             — Return JSON status
│   │   └── HandleCommand()         — CLI via JSON
│   │
│   ├── miner.go                    — Mining control
│   │   ├── StartMining()           — Begin mining loop
│   │   ├── StopMining()            — Halt
│   │   └── GetHashRate()           — Current rate
│   │
│   ├── wallet.go                   — Wallet operations
│   │   ├── GetAddress()            — Derive address
│   │   └── GetBalance()            — Query balance
│   │
│   ├── network.go                  — Network info
│   │   ├── GetPeers()              — Peer list
│   │   └── GetStats()              — Network stats
│   │
│   └── binding.go                  — gomobile entry point
│
├── android/                        — Kotlin Android app
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── kotlin/
│   │   │   │   └── com/
│   │   │   │       └── clawminer/
│   │   │   │           ├── MainActivity.kt           — Main UI activity
│   │   │   │           ├── MinerService.kt          — Foreground service
│   │   │   │           ├── DaemonController.kt      — gomobile bridge
│   │   │   │           ├── ui/
│   │   │   │           │   ├── MiningScreen.kt      — Mining status
│   │   │   │           │   ├── WalletScreen.kt      — Balance/address
│   │   │   │           │   ├── StatsScreen.kt       — Network stats
│   │   │   │           │   └── SettingsScreen.kt    — Config
│   │   │   │           └── utils/
│   │   │   │               ├── UDPHelper.kt         — LAN IP discovery
│   │   │   │               └── Notifications.kt     — Status notifications
│   │   │   │
│   │   │   └── AndroidManifest.xml
│   │   │
│   │   ├── build.gradle.kts        — Gradle config, gomobile integration
│   │   └── proguard-rules.pro
│   │
│   └── gradle/
│       └── wrapper/
│
├── go.mod                          — Go module (go-libp2p, sqlite3)
├── go.sum                          — Locked deps
├── Makefile                        — Build targets (Android, iOS, binary)
└── README.md                       — Build instructions
```

**Key Entry Points**:
- `cmd/clawminerd/main.go` — Binary daemon
- `mobile/binding.go` — gomobile interface
- `android/MainActivity.kt` — UI entry

**Architecture Notes**:
- All Go subsystems are goroutine-based with channels
- Mobile bindings return JSON strings only (gomobile limitation)
- Android LAN IP discovery via UDP dial to 8.8.8.8:80
- Foreground service with PARTIAL_WAKE_LOCK (battery efficient)
- Mirrors TS implementation exactly (must stay in sync)

#### apps/desktop (150KB, Electron + CJS)
**Electron wrapper for path402 client**

```
apps/desktop/
├── src/
│   ├── main.ts                     — Electron main process
│   │   ├── createWindow()          — BrowserWindow setup
│   │   ├── initMCP()               — Connect to TS MCP server
│   │   └── IPC handlers            — Electron IPC bridges
│   │
│   ├── preload.ts                  — Preload script (CJS)
│   │   └── Expose secure APIs
│   │
│   ├── renderer/
│   │   ├── index.html              — Window HTML
│   │   ├── app.tsx                 — React root
│   │   └── pages/
│   │       ├── Dashboard.tsx       — Mining status
│   │       ├── Wallet.tsx          — Balance + keys
│   │       ├── Network.tsx         — Peers + relay status
│   │       ├── Content.tsx         — Tokenized paths
│   │       └── Settings.tsx        — Config UI
│   │
│   └── utils/
│       └── ipc.ts                  — IPC channel defs
│
├── package.json                    — "main": "dist/main.js" (CJS)
├── tsconfig.json                   — CJS settings
├── esbuild.config.js               — CJS build (required for Electron)
└── README.md
```

**Build**: `pnpm dev-desktop` kills ports 4020-4023, launches Electron with dev server.

#### apps/web (250KB, Next.js frontend)
```
apps/web/
├── app/
│   ├── layout.tsx                  — Root layout
│   ├── page.tsx                    — Home page
│   └── api/
│       └── […path]/route.ts        — Dynamic $402 content gateway
│
├── components/
│   ├── Header.tsx
│   ├── Mining.tsx
│   ├── Wallet.tsx
│   └── Market.tsx
│
├── lib/
│   ├── client.ts                   — Path402Agent client
│   └── hooks.ts
│
├── package.json
└── next.config.js
```

### mcp/ — Standalone MCP Wrapper

```
mcp/
├── src/
│   ├── index.ts                    — MCP server entry
│   └── server.ts                   — Connect to packages/core
│
├── package.json
└── README.md                       — Deployment guide
```

Allows running the MCP server independently from apps/desktop.

---

## Database Schema (SQLite)

Located: `~/.path402/path402.db`

**18+ Tables**:

| Table | Purpose |
|-------|---------|
| `poi_blocks` | Mined PoI blocks (merkle root, solution, timestamp) |
| `work_items` | Accumulated indexing work (tx, content, validation) |
| `blocks` | Block header cache from Bitcoin network |
| `peers` | Gossip network peer list |
| `holdings` | User token holdings (address, balance) |
| `transactions` | $402 token transfers |
| `prices` | Historical price snapshots |
| `content` | Gated content metadata ($path → content hash) |
| `wallets` | HD wallet state (xpub, next index) |
| `relay_logs` | Broadcast history |
| `identities` | $401 identity chain mappings |
| `speculations` | Autonomous acquisition ledger |
| `api_keys` | User API keys for dashboard |
| `metrics` | Mining stats (hash rate, block time) |
| `config` | Runtime config (difficulty, halving) |
| `migrations` | Applied migration versions |

---

## Key Protocol Concepts

### Proof of Indexing (BRC-116)

**Work Accumulation**:
```
WorkItem {
  type: "tx" | "content" | "stamp"
  payload: Buffer
  timestamp: number
}
```

**Block Mining**:
```
PoIBlock {
  prevTxId: string          // Previous solution tx ID
  workCommitment: Buffer    // SHA256(sorted work items)
  dest: string              // Miner address
  nonce: number             // Found via PoW search

  // Derived:
  merkleRoot: Buffer        // SHA256(workIds.join("|"))
  proofHash: Buffer         // SHA256d(prevTxId||workCommitment||dest||nonce)
}
```

**PoW Target**:
```
SHA256d(SHA256d(prevTxId || workCommitment || dest || nonce)) <= target
```

**Difficulty Adjustment**:
- Every 144 blocks (Bitcoin-style)
- Formula: `newTarget = (144 * avgBlockTime) / actualBlockTime * oldTarget`
- **CRITICAL**: `Math.trunc(ratio * 10000)` must exactly match Go `int64(ratio * 10000)` (fixed-point precision)

### Two $402 Tokens (CRITICAL DISTINCTION)

| Token | Chain | Supply | Mechanism | Status |
|-------|-------|--------|-----------|--------|
| **$402 HTM** | BSV (BSV-21) | 21M | 100% mined via PoI, on-chain verification via sCrypt | LIVE |
| **$402 Platform** | Supabase | 500M | Sold via bonding curve (sqrt_decay), web sales only | LIVE |

**On-Chain Inscription**: `294691e2...` (inscription ID for HTM)

### BRC-105: HTTP 402 Payment Required

**Content Gating**:
```
GET /$domain.com/$path

← 402 Payment Required
← WWW-Authenticate: BRC-105; price=1000, demand=3.5
← Accept-Ranges: satoshis

[Client pays and provides proof]

→ Authorization: BRC-105 proof=<sig>
→ GET /$domain.com/$path

← 200 OK
← Content-Type: application/octet-stream
← <gated content>
```

Implemented in `packages/core/src/services/headers.ts` and `gating.ts`.

### Address Format: $domain.com/$path

Every URL path is a **tokenized market**:
```
$example.com/ai-girlfriend/luna
├── Priceable (bonding curve)
├── Gatable (402 challenge)
├── Ownable (transferable token)
└── Discoverable (gossip network)
```

---

## Development Workflow

### Running Locally

**Install & Build**:
```bash
pnpm install
pnpm build
```

**Start Mining (TypeScript)**:
```bash
cd packages/core
pnpm dev
# Starts MCP server on stdio, mining ready
```

**Start Desktop App**:
```bash
pnpm dev-desktop
# Kills ports 4020-4023, launches Electron
# Opens dev tools automatically
```

**Start Web Frontend**:
```bash
cd apps/web
pnpm dev
# Opens http://localhost:3000
```

**Run Go Daemon** (requires Go 1.21):
```bash
cd apps/clawminer
go run ./cmd/clawminerd
# API on :8402, gossip on :4020
```

**Build Android**:
```bash
cd apps/clawminer
make android
# Generates .aar file, integrate with Gradle
```

### Key Environment Variables

```bash
# Core
ANTHROPIC_API_KEY=sk-...                          # Claude API
PATHD_WALLET_KEY=xprv...                          # HD wallet seed
HTM_TOKEN_ID=6WjseE2J...                          # Solana mint (legacy)

# Mining
MINER_ADDRESS=13A...                              # Destination for HTM tokens
TREASURY_ADDRESS=1A...                            # Dividend distribution

# Networking
GOSSIP_BOOTSTRAP_PEER=135.181.103.181:4020        # Bootstrap node
TRANSPORT=tcp                                      # or "quic"

# Database
SUPABASE_URL=https://...                          # Platform token DB
SUPABASE_SERVICE_KEY=eyJ...                       # Service role (server only)

# External Services
CLAWMINER_BHS_URL=https://...                     # Block header service
CLAWMINER_BHS_API_KEY=bhs_...                    # BHS authentication
IDENTITY_API_URL=http://path401.local:3000        # $401 identity service
```

### TypeScript Builds

- **packages/core**: ESM (`dist/esm/`), CJS (`dist/cjs/`) via tsc
- **packages/htm**: Dual ESM + CJS (scrypt-ts requirement)
- **apps/desktop**: CJS via esbuild (Electron requirement)

### Go Builds

- **clawminerd**: `go build ./cmd/clawminerd`
- **Android**: `gomobile bind -target=android ./mobile/`
- **iOS**: `gomobile bind -target=ios ./mobile/`

---

## MCP Tools (13x)

All tools are Zod-validated, async, and available to Claude agents.

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| `path402_discover` | domain, path, limit | Content items with pricing | Discover $402 content |
| `evaluate` | domain, path, amount | Profitability score | Cost-benefit analysis |
| `acquire` | domain, path, amount, wallet | Transaction ID | Buy/hold $402 tokens |
| `serve` | domain, path, content, price_model | Publication ID | Tokenize content at path |
| `wallet` | command, ...args | Wallet state | HD wallet operations |
| `price_schedule` | domain, path | Price curve | View bonding curve |
| `set_budget` | token, max_spend | Budget record | Limit autonomous spending |
| `economics` | domain, path | Revenue, holders, yield | Analyze path economics |
| `batch_discover` | domains: […] | Bulk results | Batch discovery |
| `servable` | content, options | Validation result | Pre-check before serving |
| `token_stats` | — | Global stats | Circulating, market cap |
| `holders` | domain, path, limit | Top holder list | View distribution |
| `verify_holder` | address, domain, path, amount | Verification | Prove holdings (for gating) |
| `connect_wallet` | seed_phrase, xpub | Wallet created | Import wallet |

### Example Tool Call (Claude Agent)

```typescript
// Agent invokes via MCP
const result = await mcp.invoke('acquire', {
  domain: 'example.com',
  path: 'newsletter/2026-march',
  amount: 10000,  // satoshis
  wallet: 'xprv...'
});

// Returns: { txid: 'abc...', status: 'pending' }
```

---

## Gossip Network (libp2p)

**Topology**: Mesh network of peers running GossipSub protocol

**Bootstrap Peer**: `135.181.103.181:4020`

**Transport Stack**:
1. TCP (IPv4/IPv6)
2. Noise (encryption)
3. Yamux (multiplexing)

**8 Topics** (all prefixed `/path402/`):

| Topic | Message Type | Producers | Subscribers |
|-------|--------------|-----------|-------------|
| `blocks` | PoIBlock (solved) | Miners | Indexers, relay |
| `work-items` | WorkItem | Scanners | Accumulators |
| `prices` | PriceUpdate | Strategists | Markets |
| `transactions` | TxBroadcast | Wallets | Indexers |
| `identities` | Identity change | $401 bridge | Validators |
| `content` | Content announce | Producers | Gateways |
| `peers` | PeerInfo | All nodes | Discovery |
| `intel` | Intelligence decision | Agents | All (read-only) |

**Publish Latency**: < 500ms to 100 peers

---

## Speculation Module

**Autonomous Token Acquisition** — acquires high-confidence opportunities with 3 strategies:

### Momentum Strategy (40% allocation)
- Detects price acceleration (price > SMA-50)
- Entry: Buy 1000 tokens when velocity > 0.02
- Exit: Sell at +5% or -2% stop
- Risk: Medium (trending paths)

### Arbitrage Strategy (35% allocation)
- Compares platform vs on-chain prices
- Entry: Buy when on-chain < platform × 0.95
- Exit: Sell when price delta closes
- Risk: Low (statistical edge)

### Yield Strategy (25% allocation)
- Targets high-dividend paths (>10% APY)
- Holds for 30-day dividend collection
- Reinvests dividends (compounding)
- Risk: Medium (concentration)

**Execution**:
- `strategist.ts` evaluates all known paths every 60s
- `acquire.ts` builds transaction (currently mock, TODO: real BSV)
- Results logged to `speculations` table

---

## Intelligence Layer

**Two Providers** with 90% Strategy routing:

### Claude Provider (Anthropic)
- Model: claude-opus-4-6
- Use case: Complex reasoning, multi-step planning
- Context window: 200K tokens
- Cost: $3/1M input, $15/1M output

### Ollama Provider (Local)
- Model: llama2-7b (or user-configured)
- Use case: Low-latency inference, edge computing
- Cost: Free
- Latency: 100-500ms (GPU-dependent)

**Strategy Routing**:
```
IF query requires reasoning OR > 1000 tokens
  → Claude (99% accuracy)
ELSE
  → Ollama (10x faster, 85% accuracy)
```

**Agent Chaining** (`x402.ts`):
1. **Discover**: "What are trending paths?"
2. **Evaluate**: "Which are profitable?"
3. **Acquire**: "Buy tokens for paths with > 10% ROI"
4. **Report**: "Summarize holdings and yields"

---

## CJS/ESM Bridge (CRITICAL)

**Problem**: scrypt-ts requires CommonJS, packages/core is ESM.

**Solution**: Lazy load at runtime via `createRequire`:

```typescript
// In packages/core/src/services/mining.ts (ESM)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// At runtime, load CJS module
const htm = require('@b0ase/path402-htm');

// If packages/htm not available (e.g., browser), noop:
const broadcastMint = async () => {
  if (!htm) {
    console.warn('HTM module not available, skipping on-chain mint');
    return null;
  }
  return htm.HtmBroadcaster.broadcastMint(...);
};
```

**Fallbacks**:
- Desktop (Node.js): Loads CJS successfully
- Web (browser): Skips HTM, uses gossip relay only
- Mobile: Pure Go daemon (no CJS needed)

---

## Known Issues & Gotchas

### Critical (Fix Before Mainnet)

1. **Simplified Merkle Root** — Uses `SHA256(sortedIDs.join("|"))`, NOT binary tree per BRC-116 spec
   - Fix: Implement proper merkle tree hashing
   - Impact: Medium (verification, proof size)

2. **Fixed-Point Rounding** — `Math.trunc(ratio * 10000)` must match Go exactly
   - **CRITICAL**: Even 1-digit differences cause divergence
   - Test: Cross-run same difficulty adjustment in both languages
   - Impact: High (fork risk)

3. **Speculation Acquire** — Doesn't make real BSV payments
   - Currently: Mock transaction log only
   - TODO: Integrate with wallet service, real UTXO spend
   - Impact: Medium (feature incompleteness)

4. **Startmining() is Stub** — `pathd startMining` doesn't actually start mining
   - Current behavior: Loads config, returns success
   - TODO: Wire to ProofOfIndexingService
   - Impact: High (no mining on startup)

### Important

5. **Two $402 Tokens, Two Databases**
   - On-chain HTM (21M): SQLite at `~/.path402/`
   - Platform token (500M): Supabase remote
   - Reconciliation: Must validate every mint against on-chain
   - Gotcha: Supabase tx may succeed but HTM broadcast fail (async)

6. **Android LAN IP Discovery**
   - Current: UDP dial to 8.8.8.8:80 and read socket address
   - Why: gomobile doesn't provide IP context
   - Gotcha: Fails in isolated networks
   - Fix: Add user config for explicit IP

7. **gomobile JSON-Only Interface**
   - Go methods return JSON strings only
   - No complex types passed (Kotlin limitation)
   - Consequence: All control flow via JSON serialization
   - Performance: ~5% overhead per call

8. **Identity401 Strand Logic (Inlined)**
   - Currently: `packages/core/src/services/identity401.ts` inlines strand logic
   - Should: Import from `path401-com` package (when published)
   - Risk: Divergence if path401 changes
   - Sync: Manual check every sprint

9. **Desktop App CJS Requirement**
   - Electron main process must be CJS
   - Preload script must be CJS
   - Consequence: esbuild instead of tsc, dual build pipeline
   - Watch: esbuild rebuilds on changes (slower than tsc)

10. **Content Gating Not Implemented**
    - BRC-105 headers built, but no payment verification
    - Specification complete, integration pending
    - Impact: Low (read-only paths still work)

---

## Navigation Guide for Common Tasks

### Add a New MCP Tool

1. Define input/output schemas in `packages/core/src/mcp/schemas.ts`:
   ```typescript
   export const MyToolInput = z.object({
     domain: z.string(),
     action: z.enum(['buy', 'sell'])
   });
   ```

2. Implement handler in `packages/core/src/mcp/handlers/my_tool.ts`:
   ```typescript
   export async function handleMyTool(input: z.infer<typeof MyToolInput>) {
     // Logic here
     return { success: true, ... };
   }
   ```

3. Register in `packages/core/src/mcp/tools.ts`:
   ```typescript
   tools.push({
     name: 'my_tool',
     description: 'Does something',
     inputSchema: MyToolInput,
     handler: handleMyTool
   });
   ```

4. Add to `packages/core/src/index.ts` tool registry

### Modify Mining (Keep TS & Go in Sync)

1. Update TypeScript: `packages/core/src/mining/difficultyAdjuster.ts`
2. Update Go: `apps/clawminer/internal/mining/difficulty.go`
3. **CRITICAL**: Cross-test fixed-point math
4. Update `packages/indexer/pow20Simulator.ts` to match
5. Run: `pnpm test` + `go test ./...`

### Add a New Gossip Topic

1. Define in `packages/core/src/gossip/protocol.ts`:
   ```typescript
   export const TOPICS = {
     // ... existing
     myNewTopic: '/path402/my-new-topic'
   };
   ```

2. Add subscriber in `packages/core/src/gossip/gossipNode.ts`:
   ```typescript
   await this.pubsub.subscribe(TOPICS.myNewTopic, async (msg) => {
     // Handle message
   });
   ```

3. Mirror in Go: `apps/clawminer/internal/gossip/topics.go`

### Add an AI Provider

1. Extend `IntelligenceProvider` interface in `packages/core/src/intelligence/types.ts`
2. Implement in `packages/core/src/intelligence/<provider>.ts`
3. Register in `packages/core/src/intelligence/strategies.ts`:
   ```typescript
   const providers = {
     claude: new ClaudeProvider(...),
     ollama: new OllamaProvider(...),
     myProvider: new MyProvider(...)
   };
   ```
4. Update 90% routing logic if needed

### Build Android App

1. Ensure Go 1.21+ and Android SDK installed
2. `cd apps/clawminer && make android`
3. Generates `mobile/binding.aar`
4. Import into `android/app/build.gradle.kts`:
   ```kotlin
   dependencies {
     implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))
   }
   ```
5. `./gradlew build`

### Run Desktop in Dev Mode

1. Kill any processes on ports 4020-4023:
   ```bash
   lsof -ti:4020 | xargs kill -9
   lsof -ti:4021 | xargs kill -9
   lsof -ti:4022 | xargs kill -9
   lsof -ti:4023 | xargs kill -9
   ```

2. `pnpm dev-desktop` (starts both TS server + Electron)

3. Dev tools open automatically (Cmd+Ctrl+I on macOS)

### Deploy MCP Server (Standalone)

1. `cd mcp && pnpm build`
2. Host on server:
   ```bash
   node dist/index.js
   ```
3. Connect Claude Code:
   ```json
   // .claude/projects/.../settings.json
   {
     "mcpServers": {
       "path402": {
         "command": "node /path/to/mcp/dist/index.js"
       }
     }
   }
   ```

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Block mining time | 600s (10 min avg) | ~480s (simulated) |
| Gossip latency (100 peers) | <500ms | ~250ms |
| PoW verification | <10ms | ~2ms |
| Price update propagation | <1s | ~300ms |
| Content gating response | <50ms | ~35ms |
| Desktop app startup | <3s | ~2.2s |
| Go daemon memory | <50MB idle | ~42MB |

---

## Deployment Checklist

- [ ] Rotate HTM contract UTXO pool (privacy)
- [ ] Enable payment verification in BRC-105 gating
- [ ] Implement real BSV acquisition (speculation module)
- [ ] Wire startMining() to actual mining service
- [ ] Sync identity401 strand logic with path401-com
- [ ] Test fixed-point rounding across TS/Go
- [ ] Merge merkle root calculation with BRC-116 spec
- [ ] Deploy mcp/ as standalone server (not just Electron)
- [ ] Optimize gomobile binding size (currently ~8MB)
- [ ] Implement content store encryption at rest

---

## References

- **BRC-105**: HTTP 402 Payment Required specification
- **BRC-116**: Proof of Indexing specification
- **scrypt-ts**: Bitcoin smart contracts in TypeScript
- **go-libp2p**: Go peer-to-peer networking
- **gomobile**: Go/Android/iOS bindings

---

**Last Updated**: 2026-03-06
**Maintainers**: b0ase Team
**License**: MIT
