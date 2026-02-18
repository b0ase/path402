# $402 Proof-of-Indexing: Hash-to-Mint Specification

> **Version**: 4.0.0
> **Status**: Design Specification
> **Date**: February 2026
> **Supersedes**: `402-POW20-TOKEN.md` (inscription-based approach)
> **Built On**: BSV-21, sCrypt Hash-to-Mint, libp2p GossipSub

---

## Abstract

$402 is a Proof-of-Work token on the BSV blockchain that incentivizes operators of the Path402 overlay network. Operators run the path402 client, which simultaneously mines $402 tokens and indexes BSV-21 content token activity. The mining challenge requires miners to commit to a **work commitment** — a merkle root of indexing work performed — as part of the PoW hash preimage. This commitment is verified on-chain by an sCrypt Hash-to-Mint (HTM) smart contract, creating a permanent, auditable record of network activity. Peers verify the claimed work off-chain via gossip consensus.

This design eliminates dependency on centralized indexers (GorillaPool, WhatsOnChain) by making the path402 client network itself the overlay indexing layer, economically incentivized to stay online and honest.

---

## 1. Design Goals

1. **Trustless mining** — PoW verification happens on-chain in Bitcoin Script, enforced by BSV miners. No off-chain indexer can fake or censor mints.
2. **Proof of Indexing** — Every minted $402 token is permanently linked to a merkle root of claimed indexing work, creating an auditable chain of network activity.
3. **No securities classification** — 100% of tokens distributed via PoW. No pre-mine, no ICO, no treasury. The 402 corporation deploys the contract and walks away.
4. **Decentralized overlay** — The client network replaces centralized API providers. Nodes index BSV-21 tokens, serve content, and relay transactions as a side effect of mining.
5. **Regulatory clarity** — $402 is a commodity-like PoW token. Content tokens ($KWEGWONG, $FNEWS, etc.) are separate instruments with their own regulatory profiles managed by their own issuers.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  BSV L1 (Source of Truth)                               │
│  ├── $402 HTM Contract (sCrypt BSV20V2)                 │
│  │   └── mint(dest, amount, nonce, workCommitment)      │
│  │       → verifies SHA256² meets difficulty             │
│  │       → decrements on-chain supply                    │
│  │       → records workCommitment permanently            │
│  ├── Content Tokens (BSV-21 standard)                   │
│  │   ├── $KWEGWONG.com                                  │
│  │   ├── $FNEWS.online                                  │
│  │   └── ... (each deployed by content issuers)         │
│  └── All token state: on-chain, trustless               │
├─────────────────────────────────────────────────────────┤
│  Path402 Overlay L2 (Gossip Network)                    │
│  ├── $402/mining/v1    — PoW solutions + work proofs    │
│  ├── $402/tokens/v1    — Token discovery + pricing      │
│  ├── $402/transfers/v1 — Transfer event propagation     │
│  ├── $402/stamps/v1    — Ticket stamp chains            │
│  ├── $402/content/v1   — Content request/offer          │
│  └── $402/chat/v1      — Node communication             │
├─────────────────────────────────────────────────────────┤
│  path402 Client (Single Binary)                         │
│  ├── $402 Miner        — HTM PoW mining engine          │
│  ├── Work Collector    — Tracks indexing work items      │
│  ├── BSV-21 Indexer    — Indexes content token activity  │
│  ├── Content Store     — Downloads/serves content P2P   │
│  ├── Marketplace       — Token trading (1sat + local)    │
│  ├── AI Agent          — Content quality evaluation      │
│  └── HTTP API + GUI    — User interface                  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Token Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Protocol** | BSV-21 (deploy+mint) | On-chain smart contract, not inscription |
| **Symbol** | `402` | |
| **Max Supply** | 21,000,000 | Bitcoin-inspired cap |
| **Decimals** | 0 | Whole tokens only |
| **Mint Limit** | 1,000 per solution | Per successful PoW |
| **Initial Difficulty** | 5 leading zero hex chars | ~1 in 1,048,576 chance per hash |
| **Hash Algorithm** | Double SHA-256 | `SHA256(SHA256(preimage))` |
| **Halving** | Every 10,500 solutions | Supply halves: 1000 → 500 → 250 → ... |
| **Total Solutions** | ~41,979 | Until supply exhausted |
| **Distribution** | 100% to miners | 0% team, 0% treasury, 0% investors |

### Supply Schedule

```
Era 1:  Solutions     1 – 10,500  →  1,000 per solution  =  10,500,000
Era 2:  Solutions 10,501 – 21,000  →    500 per solution  =   5,250,000
Era 3:  Solutions 21,001 – 31,500  →    250 per solution  =   2,625,000
Era 4:  Solutions 31,501 – 42,000  →    125 per solution  =   1,312,500
...continued halving until 21,000,000 reached
```

---

## 4. HTM Smart Contract

### 4.1 Contract Design

The $402 token is deployed as a BSV-21 smart contract using the `scrypt-ord` library's `BSV20V2` base class. The entire 21M supply is locked in the contract UTXO at deployment. Tokens are released only when a caller provides a valid Proof-of-Work solution.

```typescript
import { BSV20V2 } from 'scrypt-ord'
import {
    Addr, assert, ByteString, hash256, method, prop,
    toByteString, Utils, byteString2Int, reverseByteString,
    slice, len
} from 'scrypt-ts'

export class Path402HTM extends BSV20V2 {
    // ═══ Stateful (change each mint) ═══
    @prop(true)
    supply: bigint              // Remaining unminted supply

    @prop(true)
    mintCount: bigint           // Total mints so far (for halving)

    // ═══ Immutable (set at deploy) ═══
    @prop()
    lim: bigint                 // Base mint amount (1000)

    @prop()
    difficulty: bigint          // Leading zero bytes required

    @prop()
    halvingInterval: bigint     // Mints per halving era (10500)

    constructor(
        id: ByteString,
        sym: ByteString,
        max: bigint,
        dec: bigint,
        lim: bigint,
        difficulty: bigint,
        halvingInterval: bigint
    ) {
        super(id, sym, max, dec)
        this.init(...arguments)
        this.supply = max
        this.mintCount = 0n
        this.lim = lim
        this.difficulty = difficulty
        this.halvingInterval = halvingInterval
    }

    @method()
    public mint(
        dest: Addr,
        nonce: ByteString,
        workCommitment: ByteString
    ) {
        // ── 1. Verify work commitment is 32 bytes ──
        assert(len(workCommitment) == 32n, 'workCommitment must be 32 bytes')

        // ── 2. Verify nonce is non-empty ──
        assert(len(nonce) > 0n, 'nonce must be non-empty')

        // ── 3. Build PoW challenge ──
        // preimage = prevTxId || workCommitment || dest || nonce
        // Including dest prevents mempool front-running
        // Including prevTxId chains to contract state
        const challenge: ByteString =
            this.ctx.utxo.outpoint.txid +   // 32 bytes: previous contract txid
            workCommitment +                  // 32 bytes: merkle root of work
            dest +                            // 20 bytes: miner's address
            nonce                             // variable: miner's solution

        // ── 4. Double SHA-256 ──
        const h = hash256(challenge)

        // ── 5. Verify difficulty (leading zero bytes) ──
        assert(
            slice(h, 0n, this.difficulty) ==
                toByteString('0000000000000000000000000000000000000000', 0n)
                // ^ sliced to this.difficulty bytes by the comparison
        , 'hash does not meet difficulty target')
        // NOTE: Implementation detail — the comparison above is conceptual.
        // In practice, convert hash to integer and compare against target:
        //   hashInt = byteString2Int(reverseByteString(h, 32n) + toByteString('00'))
        //   assert(hashInt < target)
        // The difficulty prop would store the target as a bigint instead.

        // ── 6. Calculate mint amount (with halving) ──
        // amount = lim >> (mintCount / halvingInterval)
        const era = this.mintCount / this.halvingInterval
        let amount = this.lim
        // Right-shift by era (halving)
        // era 0: amount = lim, era 1: lim/2, era 2: lim/4, ...
        assert(era < 64n, 'mining complete')
        // Manual halving loop (sCrypt doesn't support variable shifts)
        if (era >= 1n) { amount = amount / 2n }
        if (era >= 2n) { amount = amount / 2n }
        if (era >= 3n) { amount = amount / 2n }
        if (era >= 4n) { amount = amount / 2n }
        if (era >= 5n) { amount = amount / 2n }
        if (era >= 6n) { amount = amount / 2n }
        if (era >= 7n) { amount = amount / 2n }
        // ... extend as needed (8 eras covers >99.6% of supply)

        assert(amount > 0n, 'mint amount is zero')

        // ── 7. Decrement supply ──
        this.supply -= amount
        assert(this.supply >= 0n, 'supply exhausted')

        // ── 8. Increment mint counter ──
        this.mintCount += 1n

        // ── 9. Build outputs ──
        let outputs = toByteString('')

        // Output 0: State continuation (if supply remains)
        if (this.supply > 0n) {
            outputs += this.buildStateOutputFT(this.supply)
        }

        // Output 1: Transfer minted tokens to miner
        outputs += BSV20V2.buildTransferOutput(dest, this.id, amount)

        // Output 2+: Change
        outputs += this.buildChangeOutput()

        // ── 10. Enforce output integrity ──
        assert(
            hash256(outputs) == this.ctx.hashOutputs,
            'hashOutputs mismatch'
        )
    }
}
```

### 4.2 What the Contract Enforces (On-Chain)

| Rule | Enforcement |
|------|-------------|
| PoW difficulty met | `hash256(challenge) < target` verified in Script |
| Miner address bound to solution | `dest` is part of the hash preimage |
| Work commitment recorded | `workCommitment` is part of the hash preimage |
| Supply cap (21M) | `this.supply -= amount; assert(supply >= 0)` |
| Halving schedule | `amount = lim / 2^era` computed on-chain |
| Output integrity | `hash256(outputs) == hashOutputs` |
| Single-spend | UTXO model — contract UTXO can only be spent once per block |

### 4.3 What the Contract Does NOT Enforce

| Rule | Where Enforced |
|------|----------------|
| Work commitment is honest | L2 gossip — peers verify merkle roots |
| Indexing work was actually done | L2 gossip — peers compare index state |
| Nonce uniqueness across miners | Not needed — each mint spends a unique UTXO |
| Difficulty adjustment | Off-chain — new contract deployed per era (or stateful adjustment) |

### 4.4 Deployment

```typescript
// Deploy: locks entire supply in contract
const htm = new Path402HTM(
    toByteString(''),              // id: empty at genesis
    toByteString('402', true),     // sym
    21_000_000n,                   // max supply
    0n,                            // decimals
    1_000n,                        // mint limit (base)
    5n,                            // difficulty (leading zero bytes)
    10_500n                        // halving interval
)

await htm.connect(signer)
const tokenId = await htm.deployToken()
// tokenId = "<txid>_0" — this is the canonical $402 token ID
```

The deployment transaction creates a single UTXO containing the full 21M supply, locked by the contract script. This is the genesis of the $402 token.

---

## 5. Proof of Indexing Protocol

### 5.1 Work Items

Every path402 client continuously performs useful work for the network. Each unit of work is recorded as a `WorkItem`:

```typescript
interface WorkItem {
    id: string          // SHA-256 of (type + data + timestamp)
    type: WorkType
    data: string        // Type-specific proof data
    timestamp: number   // Unix ms
}

type WorkType =
    | 'tx_indexed'      // Indexed a BSV-21 token transfer
    | 'content_served'  // Served content to a peer (Proof of Serve)
    | 'stamp_validated' // Validated a ticket stamp chain
    | 'peer_relayed'    // Relayed a gossip message
    | 'market_indexed'  // Indexed a 1sat market listing/sale
```

### 5.2 Work Item Details

#### `tx_indexed` — Transaction Indexing
Triggered when the client observes and indexes a BSV-21 token transfer on-chain.

```typescript
{
    id: sha256("tx_indexed|<txid>|<timestamp>"),
    type: "tx_indexed",
    data: JSON.stringify({
        txid: "abc123...",          // The indexed transaction
        tokenId: "def456..._0",    // BSV-21 token ID
        from: "1Alice...",
        to: "1Bob...",
        amount: 500
    }),
    timestamp: 1707264000000
}
```

#### `content_served` — Content Delivery
Triggered when the client serves content to a peer who presented a valid ticket.

```typescript
{
    id: sha256("content_served|<requester>|<contentHash>|<timestamp>"),
    type: "content_served",
    data: JSON.stringify({
        contentHash: "sha256:abcdef...",
        requesterPeerId: "12D3KooW...",
        bytesServed: 15728640,       // 15 MB
        ticketTokenId: "kwegwong_token_id",
        stampSignature: "304402..."  // Proof of Serve signature
    }),
    timestamp: 1707264000000
}
```

#### `stamp_validated` — Stamp Chain Validation
Triggered when the client validates a ticket's stamp chain (verifies all signatures in the chain).

```typescript
{
    id: sha256("stamp_validated|<ticketUtxo>|<timestamp>"),
    type: "stamp_validated",
    data: JSON.stringify({
        ticketUtxo: "abc123:0",
        chainLength: 7,             // Number of stamps verified
        isValid: true,
        tokenId: "kwegwong_token_id"
    }),
    timestamp: 1707264000000
}
```

#### `market_indexed` — Market Activity
Triggered when the client indexes a listing or sale on 1sat.market.

```typescript
{
    id: sha256("market_indexed|<listingTxid>|<timestamp>"),
    type: "market_indexed",
    data: JSON.stringify({
        listingTxid: "abc123...",
        tokenId: "def456..._0",
        action: "list" | "buy" | "cancel",
        priceSats: 5000
    }),
    timestamp: 1707264000000
}
```

#### `peer_relayed` — Message Relay
Triggered when the client forwards a valid gossip message to peers.

```typescript
{
    id: sha256("peer_relayed|<messageHash>|<timestamp>"),
    type: "peer_relayed",
    data: JSON.stringify({
        messageHash: "abc123...",
        messageType: "TRANSFER_EVENT",
        relayedTo: 3                 // Number of peers forwarded to
    }),
    timestamp: 1707264000000
}
```

### 5.3 Work Commitment Construction

Work items accumulate in an in-memory mempool. When the mempool reaches a threshold (minimum 5 items), the miner constructs a **work commitment**:

```
1. Collect up to 10 work items from mempool
2. Sort items by ID (deterministic ordering)
3. Compute merkle root:

   Items: [A, B, C, D]

   Level 0: H(A)    H(B)    H(C)    H(D)
              \     /          \     /
   Level 1:  H(AB)            H(CD)
                \             /
   Level 2:     H(ABCD) = merkleRoot

4. workCommitment = merkleRoot (32 bytes)
```

The merkle tree uses SHA-256 at each level. For odd numbers of leaves, the last leaf is duplicated.

### 5.4 Mining Loop

```
┌──────────────────────────────────────────────────────────┐
│                    MINING LOOP                            │
│                                                          │
│  1. Wait for mempool.size >= MIN_WORK_ITEMS (5)          │
│                                                          │
│  2. Take up to 10 items from mempool                     │
│                                                          │
│  3. Compute workCommitment = merkleRoot(items)           │
│                                                          │
│  4. Build challenge:                                     │
│     preimage = contractTxId                              │
│              + workCommitment                             │
│              + minerAddress                               │
│              + nonce                                      │
│                                                          │
│  5. Mine: find nonce where                               │
│     hash256(preimage) has N leading zero bytes            │
│                                                          │
│  6. On solution found:                                   │
│     a. Submit to HTM contract on-chain                   │
│        → $402 tokens minted to minerAddress              │
│        → workCommitment recorded on-chain permanently    │
│                                                          │
│     b. Broadcast to gossip ($402/mining/v1):             │
│        → Solution details                                │
│        → Work item list (for peer verification)          │
│                                                          │
│     c. Remove mined items from mempool                   │
│                                                          │
│  7. Return to step 1                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 6. L2 Verification (Gossip Consensus)

The HTM contract ensures PoW is valid on-chain. The gossip network ensures the **work commitment is honest**.

### 6.1 Mining Announcement

When a node mines a block, it broadcasts to `$402/mining/v1`:

```typescript
interface MiningAnnouncement {
    // On-chain reference
    mintTxId: string             // The HTM contract spend txid
    contractUtxo: string         // Which contract UTXO was spent

    // PoW solution
    nonce: string                // The winning nonce (hex)
    workCommitment: string       // The 32-byte merkle root (hex)
    minerAddress: string         // Reward recipient

    // Work proof (for peer verification)
    workItems: WorkItem[]        // The actual items behind the merkle root
    merkleProof: string[]        // Merkle tree intermediate hashes

    // Metadata
    timestamp: number
    signature: string            // Signed by miner's key
}
```

### 6.2 Peer Verification

Receiving peers perform these checks:

```
1. MERKLE VERIFICATION
   Recompute merkleRoot from workItems
   Assert: computedRoot == workCommitment
   If mismatch: flag miner as dishonest, reduce reputation

2. WORK ITEM PLAUSIBILITY
   For each work item:
   - tx_indexed: Do we have this txid in our index? Is the data correct?
   - content_served: Is the stamp signature valid?
   - market_indexed: Does this listing exist on 1sat?
   - peer_relayed: Did we see this message hash?

   Score: (verified items / total items)
   If score < 0.5: flag as suspicious

3. CROSS-REFERENCE
   Compare our local index state with the miner's claimed work
   Honest miners should see ~80%+ overlap with our own observations
   (Not 100% because nodes see different subsets of network activity)

4. REPUTATION UPDATE
   If verified: increase miner's peer reputation score
   If suspicious: decrease reputation
   If dishonest: add to local ban list
```

### 6.3 Economic Security

Dishonest mining is economically irrational:

| Action | On-Chain Result | L2 Result |
|--------|----------------|-----------|
| Valid PoW + honest work | $402 minted | Full peer trust, trading access |
| Valid PoW + fake work | $402 minted | Peers reject, no trading partners |
| Valid PoW + empty work | $402 minted | Peers deprioritize, reduced reputation |
| Invalid PoW | Transaction rejected | N/A |

A miner who submits fake work commitments can technically mint $402, but they'll be excluded from the content marketplace — which is where the real profit is. The $402 tokens they mine become harder to sell because peers won't trade with them.

---

## 7. Content Token Economy

### 7.1 Separation of Concerns

| Token | Type | Created By | Purpose | Regulation |
|-------|------|------------|---------|------------|
| $402 | BSV-21 HTM (PoW) | Smart contract | Mining reward | Commodity (no issuer) |
| $KWEGWONG | BSV-21 (standard) | kwegwong.com | Content access | Issuer's responsibility |
| $FNEWS | BSV-21 (standard) | fnews.online | Content access | Issuer's responsibility |

$402 never touches the content economy directly. It is earned by mining and sold for BSV. Content tokens are bought with BSV and used as tickets to access content.

### 7.2 Ticket Model

Content tokens function as **tickets with provenance** (see `STAMP_CHAIN_SPEC.md`):

```
1. Issuer mints $KWEGWONG (BSV-21 deploy+mint)
2. User buys ticket with BSV on 1sat.market
3. User presents ticket to a node serving kwegwong.com content
4. Node validates ticket ownership (on-chain check)
5. Node serves content → stamps the ticket (Proof of Serve)
6. Ticket now has a stamp chain: [issued → bought → served]
7. Node can resell the stamped ticket
8. Next buyer gets a ticket with provenance (proven valuable content)
```

### 7.3 What Nodes Index

The path402 client indexes:

1. **BSV-21 token transfers** — Who holds what content tokens
2. **1sat.market activity** — Listings, sales, prices for content tokens
3. **Ticket stamp chains** — Provenance and circulation velocity
4. **Content availability** — Which peers have which content
5. **$402 contract state** — Current supply, mint count, recent solutions

This indexing work generates `WorkItem`s that feed the mining mempool (Section 5).

---

## 8. Node Economics

### 8.1 Revenue Streams

| Stream | Currency | Mechanism |
|--------|----------|-----------|
| Mining | $402 → sell for BSV | PoW hash solutions via HTM contract |
| Content trading | BSV | Buy undervalued content tokens, resell at profit |
| Content serving | BSV (via ticket resale) | Serve content, collect stamped tickets, resell |
| Market making | BSV | Arbitrage across 1sat.market and local marketplace |

### 8.2 Cost Structure

| Cost | Typical | Notes |
|------|---------|-------|
| VPS hosting | ~$5-20/month | Hetzner, DigitalOcean, etc. |
| BSV transaction fees | ~0.5 sat/byte | ~$0.001 per mint transaction |
| Bandwidth | Variable | Content serving is the main cost |
| Electricity (PoW) | Negligible | CPU mining, not GPU/ASIC |

### 8.3 Break-Even Analysis

```
Monthly cost: ~$10 (VPS)
$402 price needed to break even from mining alone:
  At difficulty 5: ~1 solution per hour ≈ 720 solutions/month
  720 × 1000 $402 = 720,000 $402/month
  Break-even price: $10 / 720,000 = $0.0000139 per $402

  With content trading adding 2-5x revenue,
  the node is profitable at almost any $402 price > 0.
```

---

## 9. Difficulty Adjustment

### 9.1 Target Rate

```
Target: 1 solution per minute (1,440 per day)
Adjustment period: Every 144 solutions (~2.4 hours at target rate)
```

### 9.2 Mechanism

Difficulty adjustment happens off-chain at the overlay level. The HTM contract has a fixed difficulty. When the network determines adjustment is needed (via gossip consensus), a **new contract UTXO** is created with updated difficulty, and remaining supply is migrated.

Alternative: make `difficulty` a `@prop(true)` (stateful) with an on-chain adjustment rule based on `mintCount` and block timestamps. This is more trustless but increases contract complexity.

### 9.3 Algorithm

```typescript
const TARGET_SOLUTIONS_PER_PERIOD = 144
const ADJUSTMENT_PERIOD = 144  // solutions

function shouldAdjust(mintCount: number): boolean {
    return mintCount % ADJUSTMENT_PERIOD === 0
}

function newDifficulty(
    currentDifficulty: number,
    actualTime: number,      // seconds for last 144 solutions
    targetTime: number       // 144 * 60 = 8640 seconds
): number {
    const ratio = actualTime / targetTime
    if (ratio < 0.5) return currentDifficulty + 1  // Too fast → harder
    if (ratio > 2.0) return currentDifficulty - 1  // Too slow → easier
    return currentDifficulty                        // Within tolerance
}
```

---

## 10. Implementation Plan

### 10.1 Contract Development

| Step | Description | Dependency |
|------|-------------|------------|
| 1 | Install `scrypt-ts` and `scrypt-ord` in monorepo | None |
| 2 | Write `Path402HTM` contract (Section 4.1) | Step 1 |
| 3 | Write contract unit tests (mock mining, supply tracking) | Step 2 |
| 4 | Deploy to BSV testnet | Step 3 |
| 5 | Integration test: mine from client → verify on-chain | Step 4 |
| 6 | Deploy to BSV mainnet | Step 5 |

### 10.2 Client Migration

| Step | Description | Files |
|------|-------------|-------|
| 7 | Add `htmContractTxid` to config | `pathd/config.ts` |
| 8 | Replace `broadcastMint()` with contract call | `services/mining.ts` |
| 9 | Wire `ProofOfIndexingService` into daemon | `pathd/daemon.ts` |
| 10 | Feed serve_log events as work items | `pathd/daemon.ts` |
| 11 | Add `$402/mining/v1` gossip topic | `gossip/node.ts`, `gossip/protocol.ts` |
| 12 | Add mining announcement message type | `gossip/protocol.ts` |
| 13 | Add peer verification logic | `gossip/node.ts` |

### 10.3 Existing Code Reuse

| Component | Current State | HTM Migration |
|-----------|---------------|---------------|
| `mining/pow.ts` | Double SHA-256, difficulty check | **Keep** — algorithm is identical |
| `mining/block.ts` | Work items, merkle root, mempool | **Keep** — merkle root becomes workCommitment |
| `services/mining.ts` | Full mining service with mempool | **Modify** — replace `broadcastMint()` only |
| `token/deploy-pow20.ts` | Inscription-based config | **Replace** — with sCrypt contract deployment |
| `gossip/node.ts` | libp2p with GossipSub | **Extend** — add mining topic + verification |
| `gossip/protocol.ts` | Message types and validation | **Extend** — add MINING_ANNOUNCEMENT type |
| `pathd/daemon.ts` | Stub `startMining()` | **Implement** — instantiate ProofOfIndexingService |
| `pathd/config.ts` | `powEnabled`, `powThreads` | **Extend** — add `htmContractTxid` |
| `db/schema.sql` | `content_cache`, `serve_log` | **Extend** — add `mining_blocks` table |

---

## 11. Gossip Protocol Extensions

### 11.1 New Topic

```
$402/mining/v1  — Mining announcements and work proof verification
```

### 11.2 New Message Types

```typescript
enum MessageType {
    // ... existing types ...
    MINING_ANNOUNCEMENT = 'MINING_ANNOUNCEMENT',
    WORK_CHALLENGE = 'WORK_CHALLENGE',
    WORK_RESPONSE = 'WORK_RESPONSE'
}
```

#### MINING_ANNOUNCEMENT
Broadcast when a node successfully mines a block.

```typescript
interface MiningAnnouncementPayload {
    mint_txid: string
    nonce: string
    work_commitment: string
    work_items: WorkItem[]
    merkle_proof: string[]
    miner_address: string
    era: number
    amount: number
}
```

#### WORK_CHALLENGE
Sent peer-to-peer to spot-check a miner's claimed work.

```typescript
interface WorkChallengePayload {
    challenge_id: string
    target_mint_txid: string
    requested_item_ids: string[]  // "Prove you indexed these specific txids"
}
```

#### WORK_RESPONSE
Response to a work challenge.

```typescript
interface WorkResponsePayload {
    challenge_id: string
    proofs: {
        item_id: string
        merkle_path: string[]     // Path from item to root
        item_data: string         // The actual work item data
    }[]
}
```

---

## 12. Database Schema Extensions

```sql
-- Track locally mined blocks
CREATE TABLE IF NOT EXISTS mining_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_hash TEXT NOT NULL UNIQUE,
    prev_hash TEXT NOT NULL,
    merkle_root TEXT NOT NULL,          -- The workCommitment
    nonce TEXT NOT NULL,
    difficulty INTEGER NOT NULL,
    work_item_count INTEGER NOT NULL,
    mint_txid TEXT,                     -- On-chain HTM mint transaction
    mint_amount INTEGER,               -- $402 tokens earned
    era INTEGER NOT NULL DEFAULT 0,
    mined_at TEXT NOT NULL DEFAULT (datetime('now')),
    broadcast_at TEXT,
    confirmed_at TEXT
);

-- Track work items and their mining status
CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY,                -- SHA-256 hash
    type TEXT NOT NULL,                 -- tx_indexed, content_served, etc.
    data TEXT NOT NULL,                 -- JSON payload
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    mined_in_block TEXT,               -- FK to mining_blocks.block_hash
    FOREIGN KEY (mined_in_block) REFERENCES mining_blocks(block_hash)
);

-- Track peer mining reputation
CREATE TABLE IF NOT EXISTS miner_reputation (
    peer_id TEXT PRIMARY KEY,
    total_announcements INTEGER DEFAULT 0,
    verified_honest INTEGER DEFAULT 0,
    verified_dishonest INTEGER DEFAULT 0,
    last_announcement_at TEXT,
    reputation_score REAL DEFAULT 50.0,  -- 0-100
    is_banned INTEGER DEFAULT 0
);

-- HTM contract state cache
CREATE TABLE IF NOT EXISTS htm_contract (
    contract_txid TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    remaining_supply INTEGER NOT NULL,
    mint_count INTEGER NOT NULL,
    current_difficulty INTEGER NOT NULL,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 13. Security Considerations

### 13.1 Attack Vectors

| Attack | Severity | Mitigation |
|--------|----------|------------|
| Fake work commitments | Medium | L2 peer verification + reputation system |
| Mempool front-running (steal nonce) | Prevented | `dest` (miner address) is in hash preimage |
| Pre-computation of solutions | Low | `contractTxId` changes each mint (UTXO chain) |
| Race condition (parallel mints) | Medium | Only one spend per UTXO; losers retry |
| Contract UTXO contention | Medium | Consider parallel contract instances |
| Eclipse attack on gossip | Medium | Multiple bootstrap peers, diverse connectivity |
| Sybil attack (many fake nodes) | Low | PoW cost makes spam expensive |

### 13.2 Contract UTXO Contention

Since the HTM contract is a single UTXO chain, only one mint can succeed per block. In high-competition scenarios:

**Mitigation**: Deploy multiple parallel contract UTXOs at genesis, each holding a fraction of the supply. Miners target different UTXOs, reducing contention.

```
Genesis TX:
  Output 0: Contract A (7,000,000 supply)
  Output 1: Contract B (7,000,000 supply)
  Output 2: Contract C (7,000,000 supply)
```

### 13.3 Difficulty Gaming

If difficulty is adjusted off-chain, a malicious majority could vote to lower difficulty.

**Mitigation**: Anchor difficulty adjustment to on-chain data (block timestamps of mint transactions). Peers independently calculate expected difficulty and reject announcements from miners using wrong difficulty.

---

## 14. Comparison with Previous Approach

| Dimension | Previous (Inscription) | New (HTM) |
|-----------|----------------------|-----------|
| PoW validation | Off-chain indexer | On-chain Bitcoin Script |
| Supply enforcement | Off-chain indexer | On-chain contract state |
| Work commitment | Local block only | On-chain (permanent record) |
| Front-run protection | None | Address in hash preimage |
| Indexer dependency | Critical | Minimal (standard BSV-21 indexer) |
| Token standard | Custom `pow-20` inscription | BSV-21 (native ecosystem support) |
| 1sat.market listing | Manual/unsupported | Automatic (BSV-21 compatible) |
| Trustlessness | Trust the indexer | Trust Bitcoin consensus |
| Existing code reuse | N/A | ~80% of mining code unchanged |

---

## 15. Open Questions

1. **On-chain vs off-chain difficulty adjustment** — Stateful contract property is more trustless but adds complexity. Off-chain is simpler but requires gossip consensus.

2. **Parallel contract UTXOs** — How many? Fixed at genesis or splittable later?

3. **Minimum work quality** — Should heartbeat-only work items be excluded from mining to prevent empty-work mining?

4. **Work item expiry** — Should work items expire if not mined within N minutes?

5. **Cross-chain verification** — Can a node verify another node's `tx_indexed` claims by querying WhatsOnChain, or does this reintroduce centralized dependency?

6. **sCrypt compilation target** — Need to verify that the contract compiles to a script size feasible for BSV transactions (~10KB limit soft, 10MB hard).

---

## References

- [sCrypt BSV20V2 Base Class](https://github.com/sCrypt-Inc/scrypt-ord)
- [sCrypt Boilerplate Contracts](https://github.com/sCrypt-Inc/boilerplate)
- [BSV-21 Token Standard](https://docs.1satordinals.com/fungible-tokens/bsv-21)
- [POW-20 Protocol](https://protocol.pow20.io/)
- [Lock-to-Mint Gist (msinkec)](https://gist.github.com/msinkec/6389a7943ed054fa5c74ba8f79bf730e)
- [pow20-miner (Rust)](https://github.com/yours-org/pow20-miner)
- [bsv21-overlay](https://github.com/b-open-io/bsv21-overlay)
- [sCrypt Academy: Ordinals](https://academy.scrypt.io)
- [Ticket Stamp Chain Spec](./STAMP_CHAIN_SPEC.md)
- [$402 Protocol Spec](./PROTOCOL_SPEC.md)
