# 402 Network: Content Serving Implementation Spec

> **Status**: Implementation-ready
> **Date**: 2026-03-24
> **For**: Bailey-Claw session / ClawMiner Go daemon team
> **Codebase**: `/Volumes/2026/Projects/path402/apps/clawminer/`

---

## Context

The ClawMiner daemon can mine $402 tokens, store content, and gossip with peers. But it can't yet **serve paid content** — the thing that makes the 402 Network a "BitTorrent that pays you." This spec covers the 5 gaps between what exists and a working paid content delivery network.

**What exists and works:**
- `content.Store` — hash-addressed filesystem with `Put()`, `Get()`, `GetStream()`, `LogServe()`
- `gossip.Node` — libp2p + GossipSub with `CONTENT_OFFER`, `CONTENT_REQUEST`, `UHRP_ADVERTISE` message types
- `mining.ProofOfIndexingService` — PoW mining with work commitments
- `wallet.Wallet` — secp256k1 signing, BSV address, AES-256-GCM encryption
- `server.Server` — HTTP API on :8402 with content routes (`POST /api/content`, `GET /api/content/{hash}`)
- `uhrp.Advertisement` — BRC-26 content addressing
- `db` — SQLite with `content` and `serves` tables

**What's missing:**
1. Paid HTTP 402 content serving
2. Proof of Serve
3. Content mesh (peer-to-peer transfers)
4. Discovery (find who has what)
5. Revenue splitting (creator vs node operator)

---

## Gap 1: Paid HTTP 402 Content Serving

### Problem
`GET /api/content/{hash}` serves content for free. It needs to return `402 Payment Required` and only deliver content after BSV payment.

### Where it plugs in
**File**: `internal/server/content_routes.go`

The existing `handleGetContent()` handler currently streams content directly. It needs a payment gate.

### Implementation

#### 1.1 New middleware: `paymentGate()`

```
Location: internal/server/payment.go (new file)

func paymentGate(next http.Handler, store *content.Store, wallet *wallet.Wallet) http.Handler

Flow:
1. Check X-PAYMENT header on request
2. If missing → respond 402 with payment requirements JSON
3. If present → verify BSV transaction:
   a. Decode raw tx hex from header
   b. Verify tx pays to this node's wallet address
   c. Verify amount >= content price (from DB content.price_paid_sats or per-hash config)
   d. Verify tx is valid (SPV: check merkle path or broadcast to network)
4. If valid → call next handler (serve content)
5. Log serve via store.LogServe() with txid
```

#### 1.2 Payment Required response format

```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "bsv",
    "maxAmountRequired": "5",
    "resource": "/api/content/{hash}",
    "payTo": "<this node's BSV address>",
    "asset": "BSV",
    "maxTimeoutSeconds": 300
  }],
  "contentHash": "{hash}",
  "contentType": "video/mp4",
  "contentSize": 12345678
}
```

Headers on 402 response:
```
HTTP/1.1 402 Payment Required
X-PAYMENT-REQUIRED: {"payTo":"<address>","amount":5,"network":"bsv"}
Content-Type: application/json
```

#### 1.3 Price resolution

Content price comes from one of:
- `content` table `price_paid_sats` field (set when content was pinned)
- Per-token pricing from `tokens` table
- Default price from config: `config.Content.DefaultPriceSats` (new config field)

Priority: per-content → per-token → default.

#### 1.4 Free content

Some content should be free (previews, thumbnails, metadata). Add a `free` flag to the content table. If `free = true`, skip payment gate.

#### 1.5 Config additions

```yaml
content:
  default_price_sats: 5          # default price per content request
  free_preview_bytes: 0          # serve first N bytes free (for streaming previews)
  max_upload_bytes: 104857600    # 100MB max upload
  payment_timeout_secs: 300      # how long to wait for payment
```

#### 1.6 Files to modify

| File | Change |
|------|--------|
| `internal/server/payment.go` | **NEW** — payment gate middleware |
| `internal/server/content_routes.go` | Wrap `handleGetContent` with `paymentGate` |
| `internal/server/routes.go` | Register middleware on content GET route |
| `internal/config/config.go` | Add `ContentConfig` struct |
| `internal/db/content.go` | Add `free` field, `GetContentPrice()` method |

---

## Gap 2: Proof of Serve

### Problem
Nodes claim they served content but there's no cryptographic evidence. Without proof, the mining reward system can be gamed — a node could claim serves it never made.

### Where it plugs in
**File**: `internal/content/store.go` — `LogServe()` already records serves. Extend it to generate proofs.

**File**: `internal/mining/block.go` — Work items already support type `"serve"`. Generate serve work items from proofs.

### Implementation

#### 2.1 Serve receipt generation

After every successful paid content delivery:

```
Location: internal/content/proof.go (new file)

type ServeProof struct {
    ContentHash    string    // SHA-256 of content served
    RequesterAddr  string    // BSV address of requester (from payment tx)
    NodeAddr       string    // This node's BSV address
    PaymentTxid    string    // BSV txid of the payment
    AmountSats     int       // Amount paid
    Timestamp      int64     // Unix timestamp
    Nonce          string    // Random nonce for uniqueness
    Signature      string    // Node signs: SHA256(contentHash|requesterAddr|paymentTxid|timestamp|nonce)
}

func GenerateServeProof(contentHash, requesterAddr, paymentTxid string,
                         amountSats int, wallet *wallet.Wallet) (*ServeProof, error)
```

The signature proves:
- This specific node served this specific content
- To this specific requester who paid this specific txid
- At this specific time

#### 2.2 Proof submission to mining mempool

After generating a serve proof, submit it as a work item:

```go
// In content_routes.go, after successful paid serve:
proof := content.GenerateServeProof(hash, requesterAddr, txid, amount, d.wallet)
workItem := mining.WorkItem{
    ID:        proof.PaymentTxid,
    Type:      "serve",
    Data:      proof.Serialize(),
    Timestamp: time.Now(),
}
d.miner.SubmitWork(workItem)
```

This means serve work feeds into the mining work commitment merkle root. Every minted $402 block now includes proof of content serves.

#### 2.3 Gossip broadcast of serve proofs

Broadcast serve proofs to peers for verification:

```
New gossip message type: MsgProofOfServe
Topic: $402/content/v1 (existing topic)
Payload: ServeProof JSON

Peers verify:
1. Signature is valid (node really signed it)
2. PaymentTxid exists on-chain (SPV verify via headers)
3. Payment went to the claimed node address
4. Amount matches claimed amount
5. Content hash matches a known content item
6. Timestamp is within acceptable range (±5 min)
```

#### 2.4 Peer verification and reputation

When a peer receives a `MsgProofOfServe`:
- If valid → increment reputation score for that node
- If invalid → decrement reputation, flag for review
- Reputation stored in `peers` table (new field: `serve_reputation int`)

#### 2.5 Files to create/modify

| File | Change |
|------|--------|
| `internal/content/proof.go` | **NEW** — ServeProof generation + serialization |
| `internal/content/store.go` | Call `GenerateServeProof()` from `LogServe()` |
| `internal/server/content_routes.go` | Submit serve work to mining mempool after paid serve |
| `internal/gossip/protocol.go` | Add `MsgProofOfServe` message type (ID: 25) |
| `internal/gossip/handler.go` | Add proof verification in `HandleMessage()` |
| `internal/db/peers.go` | Add `serve_reputation` field |
| `internal/mining/block.go` | Ensure `"serve"` work items are included in merkle root |

---

## Gap 3: Content Mesh (Peer-to-Peer Transfers)

### Problem
Currently content is served directly from the origin node via HTTP. If that node is slow, offline, or far away, the client has no alternative. Need peer-to-peer content transfers so multiple nodes can serve the same content.

### Where it plugs in
**File**: `internal/gossip/handler.go` — `CONTENT_REQUEST` and `CONTENT_OFFER` message types already exist but aren't wired to actual transfers.

**File**: `internal/content/store.go` — Already has `Put()` for receiving content.

### Implementation

#### 3.1 Content pinning

Nodes choose what content to pin (cache locally). Like BitTorrent seeders choosing what to seed.

```
Location: internal/content/pinner.go (new file)

type Pinner struct {
    store    *Store
    gossip   *gossip.Node
    maxBytes int64             // max storage allocated for pinned content
    strategy PinStrategy       // "popular", "profitable", "manual"
}

// Pin content from a peer
func (p *Pinner) Pin(contentHash string) error {
    1. Check if already pinned → return
    2. Broadcast CONTENT_REQUEST to gossip network
    3. Wait for CONTENT_OFFER responses (with peer addresses)
    4. Download from nearest/fastest peer via HTTP
    5. Verify SHA-256 hash matches
    6. Store locally via store.Put()
    7. Broadcast own CONTENT_OFFER to announce availability
}

// Auto-pin based on strategy
func (p *Pinner) AutoPin() {
    switch p.strategy {
    case "popular":   // pin content with most requests on gossip
    case "profitable": // pin content with highest price_sats
    case "manual":    // only pin explicit requests via API
    }
}
```

#### 3.2 Content transfer protocol

When Node A wants content that Node B has:

```
Node A → CONTENT_REQUEST (hash, maxPriceSats) → gossip network
         ↓
Node B has it, responds:
Node B → CONTENT_OFFER (hash, priceSats, nodeAddr, httpEndpoint) → gossip network
         ↓
Node A picks best offer (nearest, cheapest, fastest):
Node A → HTTP GET http://{nodeB_addr}:8402/api/content/{hash}
         with X-PAYMENT header (if price > 0)
         ↓
Node B serves content, logs serve proof
Node A stores content locally, announces own CONTENT_OFFER
```

#### 3.3 Gossip message payloads (update existing)

```go
// CONTENT_REQUEST payload (update protocol.go)
type MsgContentRequest struct {
    ContentHash  string `json:"contentHash"`
    MaxPriceSats int    `json:"maxPriceSats"`
    RequesterID  string `json:"requesterId"`    // libp2p peer ID
}

// CONTENT_OFFER payload (update protocol.go)
type MsgContentOffer struct {
    ContentHash  string `json:"contentHash"`
    ContentType  string `json:"contentType"`
    ContentSize  int    `json:"contentSize"`
    PriceSats    int    `json:"priceSats"`
    ServerAddr   string `json:"serverAddr"`     // HTTP endpoint
    PeerID       string `json:"peerId"`         // libp2p peer ID
    Signature    string `json:"signature"`      // node signs offer
}
```

#### 3.4 Replication factor

Config setting: how many copies of each piece of content should exist on the network.

```yaml
content:
  replication_target: 3    # aim for 3 nodes per content item
  pin_strategy: "profitable"
  max_pin_bytes: 10737418240  # 10GB max local storage
```

#### 3.5 Files to create/modify

| File | Change |
|------|--------|
| `internal/content/pinner.go` | **NEW** — Pinning logic, auto-pin strategies |
| `internal/gossip/protocol.go` | Update `MsgContentRequest` and `MsgContentOffer` payloads |
| `internal/gossip/handler.go` | Wire `ContentRequestObserver` to respond with offers; wire `ContentOfferObserver` to track available peers |
| `internal/daemon/daemon.go` | Initialize `Pinner`, wire to gossip and store |
| `internal/server/content_routes.go` | Add `POST /api/content/pin/{hash}` endpoint |
| `internal/config/config.go` | Add pin strategy, replication, max storage config |

---

## Gap 4: Content Discovery

### Problem
Clients need to find which nodes have which content. Currently UHRP advertisements exist but aren't queryable at scale. Need a discovery layer.

### Where it plugs in
**File**: `internal/gossip/node.go` — DHT is already initialized (Kademlia). Can use DHT provider records for content discovery.

**File**: `internal/uhrp/uhrp.go` — UHRP advertisements already have the right data structure.

### Implementation

#### 4.1 DHT-based content provider records

When a node pins content, it advertises itself as a provider in the Kademlia DHT:

```
Location: internal/content/discovery.go (new file)

type Discovery struct {
    dht   *dht.IpfsDHT        // from gossip.Node
    store *Store
}

// Announce that this node has content
func (d *Discovery) Announce(contentHash string) error {
    cid := hashToCID(contentHash)     // Convert SHA-256 to CID
    return d.dht.Provide(ctx, cid, true)  // Advertise as provider
}

// Find nodes that have content
func (d *Discovery) FindProviders(contentHash string) ([]peer.AddrInfo, error) {
    cid := hashToCID(contentHash)
    return d.dht.FindProviders(ctx, cid)
}
```

This uses libp2p's built-in DHT provider records — no custom protocol needed. When a client wants content, it queries the DHT for providers, picks the best one, and downloads via HTTP.

#### 4.2 Content catalog gossip

Periodically broadcast a summary of pinned content:

```
New gossip message type: MsgContentCatalog
Topic: $402/content/v1

Payload:
{
    "peerId": "12D3Koo...",
    "serverAddr": "http://1.2.3.4:8402",
    "contentCount": 42,
    "totalBytes": 1073741824,
    "bloomFilter": "<hex>",       // Bloom filter of all content hashes
    "topContent": [               // 10 most popular items
        {"hash": "abc123", "serves": 150, "priceSats": 5},
        ...
    ]
}
```

The bloom filter lets peers quickly check "does this node probably have X?" without downloading the full catalog. False positives are fine — worst case you ask and they say no.

#### 4.3 Content search API

```
GET /api/content/search?q=razor-kisses
GET /api/content/providers/{hash}

Returns: list of peers that have the content, sorted by latency/reputation
```

#### 4.4 Files to create/modify

| File | Change |
|------|--------|
| `internal/content/discovery.go` | **NEW** — DHT provider records, FindProviders |
| `internal/gossip/protocol.go` | Add `MsgContentCatalog` (ID: 26) with bloom filter |
| `internal/gossip/handler.go` | Handle catalog messages, build peer content index |
| `internal/server/content_routes.go` | Add `/api/content/search`, `/api/content/providers/{hash}` |
| `internal/daemon/daemon.go` | Initialize Discovery, periodic catalog broadcast |

---

## Gap 5: Revenue Splitting (Creator vs Node Operator)

### Problem
When a client pays 5 sats to download content, who gets what? The content creator (who published it) and the node operator (who served it) both need to be paid. Currently all revenue is logged but not split.

### Where it plugs in
**File**: `internal/content/store.go` — `LogServe()` records revenue. Extend to split it.

**File**: `internal/wallet/wallet.go` — Needs to build BSV transactions that split payments.

### Implementation

#### 5.1 Revenue split configuration

Each content item has a revenue split defined at pin time:

```go
// In db/content.go, add to ContentItem:
type ContentItem struct {
    // ... existing fields ...
    CreatorAddr    string  // BSV address of content creator
    CreatorSplit   int     // basis points (e.g. 5000 = 60%)
    OperatorSplit  int     // basis points (e.g. 5000 = 40%)
}
```

Default split (configurable):
```yaml
content:
  default_creator_split_bps: 5000   # 50% to creator
  default_operator_split_bps: 5000  # 50% to node operator
```

#### 5.2 Payment routing

Two approaches, start with the simpler one:

**Approach A: Post-hoc splitting (simpler, implement first)**

Client pays full amount to node operator. Node operator accumulates revenue. Periodically (hourly/daily), node builds a BSV transaction that splits accumulated revenue to creators.

```
Location: internal/content/revenue.go (new file)

type RevenueManager struct {
    store  *Store
    wallet *wallet.Wallet
    db     *db.DB
}

// Accumulate revenue from serves
func (r *RevenueManager) RecordRevenue(contentHash string, amountSats int, txid string)

// Periodically settle accumulated revenue to creators
func (r *RevenueManager) Settle() error {
    1. Query DB for unsettled revenue grouped by creator address
    2. For each creator with >= minSettlementSats:
       a. Build BSV transaction: node → creator (their split)
       b. Sign with wallet
       c. Broadcast via relay or WhatsOnChain
       d. Mark revenue as settled in DB
    3. Log settlement txids
}
```

**Approach B: Direct splitting (future, more trustless)**

Use BSV script to enforce the split at payment time. The content's payment script is a multi-output script that splits incoming sats between creator and operator in a single transaction. This requires the client to build the split transaction (more complex client).

#### 5.3 Settlement schedule

```yaml
content:
  settlement_interval: 3600        # settle every hour
  min_settlement_sats: 100         # don't settle less than 100 sats
  settlement_fee_sats: 10          # BSV transaction fee
```

#### 5.4 Revenue dashboard

```
GET /api/revenue/summary
{
    "totalEarnedSats": 15000,
    "operatorShareSats": 5000,
    "creatorShareSats": 9000,
    "settledSats": 8000,
    "pendingSats": 7000,
    "settlements": [
        {"txid": "abc123", "creatorAddr": "1XYZ...", "amountSats": 4500, "settledAt": "..."},
        ...
    ]
}

GET /api/revenue/by-content
[
    {"contentHash": "abc", "totalServes": 150, "totalRevenueSats": 750, "operatorSats": 300, "creatorSats": 450},
    ...
]
```

#### 5.5 Integration with $DIVVY cascade

For NPGX content specifically, the creator's 50% share feeds into the $DIVVY cascade:

```
Client pays 100 sats
  → 50 sats (50%) to node operator (direct, immediate)
  → 50 sats (50%) to creator address
    → Creator address is the $DIVVY contract:
      → 50% to content token holders
      → 25% to character token holders
      → 12.5% to $NPGX holders
      → 6.25% to $NPG holders
      → 6.25% to $BOASE treasury
```

The node operator doesn't need to know about $DIVVY. It just pays the creator address. What happens after that is the creator's business.

#### 5.6 Files to create/modify

| File | Change |
|------|--------|
| `internal/content/revenue.go` | **NEW** — RevenueManager, settlement logic |
| `internal/content/store.go` | Update `LogServe()` to call `RevenueManager.RecordRevenue()` |
| `internal/db/content.go` | Add `creator_addr`, `creator_split_bps`, `operator_split_bps` fields; add `revenue_settlements` table |
| `internal/server/content_routes.go` | Add `/api/revenue/summary`, `/api/revenue/by-content` |
| `internal/daemon/daemon.go` | Initialize `RevenueManager`, start settlement ticker |
| `internal/config/config.go` | Add settlement config |

---

## Implementation Priority

```
                DEPENDENCY CHAIN

  [1. Paid Serving]  ←── everything depends on this
        ↓
  [2. Proof of Serve] ←── mining rewards depend on this
        ↓
  [5. Revenue Split]  ←── creators need to get paid
        ↓
  [3. Content Mesh]   ←── scaling depends on this
        ↓
  [4. Discovery]      ←── clients finding content depends on mesh
```

### Suggested order:

**Week 1: Gap 1 — Paid HTTP 402 Serving**
- `payment.go` middleware
- 402 response format
- Price resolution from DB
- Config additions
- Test: upload content, request without payment → 402, request with payment → content

**Week 2: Gap 2 — Proof of Serve**
- `proof.go` — generate cryptographic serve receipts
- Submit serve work items to mining mempool
- Gossip broadcast of proofs
- Peer verification
- Test: serve content, verify proof appears in next mined block's work commitment

**Week 3: Gap 5 — Revenue Split**
- `revenue.go` — accumulate and settle
- Creator/operator split config
- Settlement transactions (BSV)
- Revenue dashboard API
- Test: serve content, verify settlement tx pays creator

**Week 4: Gap 3 — Content Mesh**
- `pinner.go` — pin remote content
- Wire CONTENT_REQUEST/CONTENT_OFFER gossip handlers
- Peer-to-peer HTTP transfers
- Auto-pin strategies
- Test: Node A has content, Node B pins it, Node C downloads from Node B

**Week 5: Gap 4 — Discovery**
- `discovery.go` — DHT provider records
- Content catalog gossip with bloom filters
- Search API
- Test: client queries DHT for content providers, gets list of nodes

---

## Testing Strategy

Each gap has a clear integration test:

1. **Paid Serving**: `curl /api/content/{hash}` → 402. Add payment header → 200 + content bytes.
2. **Proof of Serve**: After paid serve, check `/api/blocks/latest` — work commitment includes serve proof hash.
3. **Revenue Split**: After N serves, check `/api/revenue/summary` — operator and creator shares correct. Check BSV explorer for settlement tx.
4. **Content Mesh**: Start 3 nodes. Upload to Node A. Pin on Node B. Download from Node B via Node C's request.
5. **Discovery**: Start 2 nodes with different content. Query `GET /api/content/providers/{hash}` — correct node returned.

---

## Summary

The ClawMiner daemon is 80% of the way there. The content store, gossip network, mining loop, and wallet all work. The 5 gaps are plumbing — connecting content to payments to proofs to the mesh. No new protocols, no new cryptography. Just wiring existing subsystems together with a payment gate, cryptographic receipts, and a settlement loop.

The end result: a ClawMiner that serves content, proves it served content, gets paid for serving content, and splits revenue with creators. That's the 402 Network.
