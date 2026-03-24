# Three HTM Contracts: $401, $402, $403

> **Status**: Architecture Specification
> **Date**: 2026-03-24
> **Context**: $402 HTM contract exists and works. $401 and $403 do not yet exist.

---

## The Model

Three independent Hash-to-Mint contracts on BSV. Each produces a different "blank canvas" token. Each blank gets "printed" into a different class of instrument.

```
$401 blanks  →  printed into  →  identity documents
$402 blanks  →  printed into  →  content tickets
$403 blanks  →  printed into  →  securities instruments
```

All three contracts share the same mechanical foundation (sCrypt BSV20V2, PoW mining, halvings, work commitments) but differ in what counts as "work" and what the blanks are used for.

---

## What Exists

### $402 HTM Contract ✅ BUILT

**File**: `packages/htm/src/contracts/htm.ts` — `Path402HTM extends BSV20V2`

| Parameter | Value |
|-----------|-------|
| Symbol | `402` |
| Max Supply | 21,000,000 |
| Mint per solution | 1,000 (pre-halving) |
| Halvings | Every 10,500 solutions |
| PoW | Double SHA-256 with difficulty target |
| Work Commitment | 32-byte merkle root of indexing work |
| Anti-frontrun | `dest` (miner address) in hash preimage |
| Anti-precompute | `prevTxId` changes each mint (UTXO chain) |

**Mining work (Proof of Indexing):**
- Transaction indexing (watch chain for BSV-21 activity)
- UHRP content hosting (store + serve content by hash)
- Peer relay (forward transactions to other indexers)
- Uptime (heartbeat signatures + response latency)

**What $402 blanks become:**
Content tickets. A creator spends $402 tokens to mint content tokens like `$MV_RAZOR_KISSES`. The $402 is consumed — it becomes the substrate of the content ticket. This creates endogenous demand: more content published → more $402 consumed → deflationary pressure → mining is profitable.

### Path402Mint Contract ✅ BUILT

**File**: `packages/htm/src/contracts/path402-mint.ts` — `Path402Mint extends BSV20V2`

This is the **content ticket** contract (not the HTM mining contract). Each piece of content deploys its own instance. Users pay BSV on a sqrt-decay bonding curve to mint content tokens. Revenue splits between issuer and dividend pool.

---

## What Needs Building

### $401 HTM Contract — Identity Substrate

**Proposed file**: `packages/htm/src/contracts/path401-htm.ts` — `Path401HTM extends BSV20V2`

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Symbol | `401` | HTTP 401 Unauthorized → identity layer |
| Max Supply | 21,000,000 | Mirrors $402 for symmetry |
| Mint per solution | 1,000 | Same as $402 |
| Halvings | Every 10,500 solutions | Same schedule |
| PoW | Double SHA-256 | Same mechanism |
| Work Commitment | 32-byte merkle root of **identity verification work** | Different work domain |

**Mining work (Proof of Identity Verification):**

Instead of indexing content transactions, $401 miners verify identity claims. Their work commitment is a merkle root of verification actions performed:

```
IDENTITY VERIFICATION WORK
────────────────────────────
1. OAUTH STRAND VERIFICATION
   - Validate OAuth tokens from GitHub, Twitter, Discord, HandCash
   - Confirm strand links to correct $401 root inscription
   - Proof: signed OAuth challenge-response

2. DOCUMENT ATTESTATION
   - Witness self-attestation documents (ID photos, utility bills)
   - Hash document content, sign attestation
   - Proof: signed document hash + timestamp

3. KYC RELAY
   - Relay Veriff KYC results to the $401 overlay
   - Confirm Lv.4 identity transitions
   - Proof: Veriff session ID + result hash

4. TRUST GRAPH MAINTENANCE
   - Index peer attestations (Lv.3 "paid signing")
   - Compute trust scores from attestation graph
   - Proof: merkle root of trust graph state
```

**What $401 blanks become:**

Identity documents. An individual spends $401 tokens to mint their identity root inscription and add strands to it. The $401 is consumed — it becomes the substrate of the identity document.

- Lv.1 Basic identity (OAuth strand): costs 1 $401 token
- Lv.2 Self-attestation (ID docs): costs 5 $401 tokens
- Lv.3 Strong (peer attestation): costs 10 $401 tokens
- Lv.4 Sovereign (Veriff KYC): costs 50 $401 tokens

Higher trust levels cost more tokens, creating a hierarchy of identity value. A Lv.4 Sovereign identity is expensive to fake because it requires both KYC and significant $401 expenditure.

**Dependency**: $401 identity is required before a user can publish $402 content or trade $403 securities. This makes $401 the foundation of the entire stack — you need identity before anything else.

**Contract differences from $402 HTM:**

The contract code is nearly identical to `Path402HTM`. The only differences are:

1. **Symbol**: `401` instead of `402`
2. **Work commitment validation context**: gossip topic `$401/identity/v1` instead of `$402/tokens/v1`
3. **Deployment**: separate UTXO chain, separate supply

The on-chain contract doesn't know or care what the work commitment represents — it just verifies the PoW. The work validation happens off-chain via gossip peers on the $401 overlay, exactly like $402.

```typescript
// Path401HTM is mechanically identical to Path402HTM
// Only the deployment parameters and overlay context differ
export class Path401HTM extends BSV20V2 {
    // Same props: supply, mintCount, lim, target, halvingInterval
    // Same mint(): dest, nonce, workCommitment
    // Same PoW verification, same halving schedule
    // Different gossip network validates the work commitments
}
```

### $403 HTM Contract — Securities Substrate

**Proposed file**: `packages/htm/src/contracts/path403-htm.ts` — `Path403HTM extends BSV20V2`

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Symbol | `403` | HTTP 403 Forbidden → gated/compliance layer |
| Max Supply | 21,000,000 | Mirrors $401/$402 |
| Mint per solution | 1,000 | Same |
| Halvings | Every 10,500 solutions | Same |
| PoW | Double SHA-256 | Same |
| Work Commitment | 32-byte merkle root of **compliance verification work** | Different work domain |

**Mining work (Proof of Compliance Verification):**

$403 miners verify that securities instruments comply with regulations. Their work commitment is a merkle root of compliance checks performed:

```
COMPLIANCE VERIFICATION WORK
──────────────────────────────
1. JURISDICTION CHECK
   - Verify issuer and holder jurisdictions
   - Confirm securities comply with local regulations
   - Proof: jurisdiction lookup hash + result

2. KYC/AML RELAY
   - Relay identity verification status from $401 network
   - Confirm holders have required trust level for instrument class
   - Proof: $401 identity hash + trust level attestation

3. ACCREDITATION VERIFICATION
   - Verify accredited investor status where required
   - Check income/asset thresholds per jurisdiction
   - Proof: signed accreditation attestation

4. TRANSFER COMPLIANCE
   - Monitor $403 token transfers
   - Verify transfer doesn't violate holding restrictions
   - Block non-compliant transfers via overlay consensus
   - Proof: transfer validation hash + compliance result

5. REPORTING
   - Generate regulatory reports (cap table, transfer log)
   - Index all securities activity for audit trail
   - Proof: report hash + timestamp
```

**What $403 blanks become:**

Securities instruments. An issuer spends $403 tokens to mint shares, bonds, royalty splits, or other compliance-gated instruments. The $403 is consumed — it becomes the substrate of the security.

- Simple share issuance: costs 10 $403 tokens per share class
- Bond/note: costs 50 $403 tokens
- Complex instrument (convertible, derivatives): costs 100 $403 tokens

The cost scales with regulatory complexity. This isn't arbitrary — more complex instruments require more compliance verification work from the $403 network, so the token cost reflects real network load.

**Mandatory dependency**: $403 instruments REQUIRE a $401 Lv.4 (Sovereign/KYC) identity for both issuer and holder. No KYC = no securities. This is enforced at the overlay level — $403 miners reject any instrument where the parties don't have verified $401 identities.

**Contract differences from $402 HTM:**

Again, mechanically identical on-chain. Different overlay network validates the work.

```typescript
// Path403HTM is mechanically identical to Path401HTM and Path402HTM
export class Path403HTM extends BSV20V2 {
    // Same everything on-chain
    // $403/compliance/v1 gossip network validates work commitments
}
```

---

## The Three Overlay Networks

Each HTM contract has its own gossip network where peers validate work commitments:

| Network | Gossip Topic Prefix | Work Validated |
|---------|-------------------|----------------|
| $401 | `$401/identity/v1` | OAuth strands, document attestations, KYC relays, trust graph |
| $402 | `$402/tokens/v1` | Content indexing, UHRP hosting, peer relay, uptime |
| $403 | `$403/compliance/v1` | Jurisdiction checks, KYC relay, accreditation, transfer compliance |

ClawMiner runs all three miners concurrently. Adaptive resource allocation based on which token is most profitable to mine right now.

```
ClawMiner
├── $401 miner thread → earns $401 blanks → identity work
├── $402 miner thread → earns $402 blanks → content work
├── $403 miner thread → earns $403 blanks → compliance work
└── Scheduler: allocates CPU/bandwidth based on token profitability
```

---

## Token Lifecycle

### $401: Identity

```
Miner does identity verification work
  → earns $401 blanks

Individual wants an identity on the network
  → buys $401 blanks (from miners or DEX)
  → spends $401 to mint identity root + strands
  → $401 tokens consumed (burned into identity document)

More people need identities → more $401 demand → mining is profitable
```

### $402: Content

```
Miner does content indexing work
  → earns $402 blanks

Creator wants to publish content
  → buys $402 blanks (from miners or DEX)
  → spends $402 to mint content ticket ($MV_RAZOR_KISSES)
  → $402 tokens consumed (burned into content ticket)
  → content ticket deployed via Path402Mint (bonding curve)
  → users buy content tickets with BSV
  → BSV revenue flows to ticket holders + $DIVVY cascade

More content published → more $402 demand → mining is profitable
```

### $403: Securities

```
Miner does compliance verification work
  → earns $403 blanks

Issuer wants to issue securities
  → must have $401 Lv.4 identity (KYC'd)
  → buys $403 blanks (from miners or DEX)
  → spends $403 to mint security instrument
  → $403 tokens consumed (burned into security)
  → holders must also have $401 Lv.4 identity
  → transfers verified by $403 overlay for compliance

More securities issued → more $403 demand → mining is profitable
```

---

## Implementation Plan

### Phase 1: Deploy $401 HTM Contract (1-2 days)

The contract code is identical to `Path402HTM` — just change the symbol.

1. Copy `packages/htm/src/contracts/htm.ts` → `path401-htm.ts`
2. Rename class `Path401HTM`, change symbol to `401`
3. Deploy to BSV mainnet with same parameters (21M supply, 1000/mint, 10500 halving)
4. Add `$401/identity/v1` gossip topic to ClawMiner daemon
5. Define identity verification work items for the work commitment

### Phase 2: Deploy $403 HTM Contract (1-2 days)

Same process.

1. Copy `path401-htm.ts` → `path403-htm.ts`
2. Rename class `Path403HTM`, change symbol to `403`
3. Deploy to BSV mainnet
4. Add `$403/compliance/v1` gossip topic to ClawMiner daemon
5. Define compliance verification work items

### Phase 3: Multi-Token Mining in ClawMiner (3-5 days)

Update the Go daemon to mine all three tokens concurrently.

1. Add mining threads for $401 and $403 (currently only mines $402)
2. Implement adaptive scheduler — allocate hashrate based on token profitability
3. Add gossip subscriptions for `$401/` and `$403/` topic prefixes
4. Update status API to report all three mining states
5. Update mobile UI to show three token balances

### Phase 4: Token Consumption (Content/Identity/Securities Minting) (1-2 weeks)

Wire the "blank → printed" flow for each token type.

1. $401 consumption: spend $401 tokens to create identity inscriptions
2. $402 consumption: spend $402 tokens to deploy Path402Mint content contracts
3. $403 consumption: spend $403 tokens to issue securities instruments
4. Each consumption burns the blank token and creates the printed instrument

### Phase 5: Cross-Protocol Gating (1 week)

Enforce the dependency chain.

1. $402 content publishing requires a $401 Lv.1+ identity
2. $403 securities issuance requires a $401 Lv.4 identity
3. $403 securities holding requires a $401 Lv.4 identity
4. Enforcement happens at the overlay level (gossip peers reject non-compliant actions)

---

## Economics Summary

| Token | What Miners Do | What It Becomes | Who Buys Blanks |
|-------|---------------|-----------------|-----------------|
| $401 | Verify identities | Digital passports, KYC records | Individuals, businesses |
| $402 | Index content | Music videos, images, access passes | Content creators |
| $403 | Verify compliance | Shares, bonds, royalty splits | Securities issuers |

All three tokens: 21M supply, PoW mined, no pre-mine, consumed when used. Demand is endogenous — the network creates its own demand by requiring blanks for every action.

**The flywheel**: More activity → more blanks consumed → price rises → mining is profitable → more miners → more capacity → more activity.

**ClawMiner is the hardware**. One device, three revenue streams. $402 per device.

---

## Key Insight

The on-chain contracts are trivially simple — they're all the same PoW verifier. The complexity lives in the overlay networks where peers validate domain-specific work. This is by design: the blockchain is dumb settlement, the intelligence is in the network.

Deploying $401 and $403 HTM contracts is a copy-paste job. The real work is building the overlay validation logic for identity verification and compliance checking. But the contract deployment gives you a live token immediately — miners can start earning before the overlay is fully built, because the PoW works independently of work commitment validation.
