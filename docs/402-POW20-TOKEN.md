# $402 PoW20 Token: Indexer Incentive Economics

> **Status**: Design Draft  
> **Date**: 2026-02-05  
> **Built On**: BSV PoW20 Standard, BRC-62 (BEEF), UHRP Overlay Network

## Executive Summary

The $402 token is a **Proof-of-Work token** that rewards indexers in the Path402 overlay network. By using PoW for minting, we:

1. **Avoid securities classification** - No pre-mine, no ICO, fair distribution
2. **Ensure decentralization** - Anyone can earn by doing useful work
3. **Align incentives** - Indexers earn proportional to value they provide

## The Regulatory Problem

Traditional token issuance creates securities liability:

```
Bad (Securities Risk)           Good (Commodity-like)
────────────────────────        ─────────────────────
• Team pre-mines tokens         • All tokens locked at genesis
• ICO/token sale               • Tokens released only for work
• Promise of returns           • No expectation of profit from others
• Central party controls        • Decentralized distribution
```

**PoW solves this** because:
- There is no "issuer" benefiting from token distribution
- Tokens are earned through verifiable, measurable work
- Distribution is permissionless and decentralized

## Technical Architecture

### Building on BSV Standards

| Standard | Purpose | How We Use It |
|----------|---------|---------------|
| **PoW20** | Proof-of-Work token minting | $402 minting requires hash work |
| **BRC-62 (BEEF)** | SPV transaction format | Indexers prove work with merkle paths |
| **UHRP** | Content addressing | Address payment endpoints by hash |
| **BRC-22** | Overlay network topic | Gossip between indexer nodes |

### PoW20 Minting Mechanism

From the PoW20 spec (pow20.io):

```
TICK: $402
DIFFICULTY: 20 (leading zeros required)
MAX_SUPPLY: 21,000,000
MINT_AMOUNT: 1000 per valid solution

Solution = SHA256(SHA256(
  TICK + BTC_ADDRESS + START_BLOCK_HEADER + NONCE
))

Valid if: solution has `difficulty` leading zeros
```

### $402 Token Parameters

```json
{
  "p": "pow-20",
  "op": "deploy",
  "tick": "402",
  "max": "21000000",
  "lim": "1000",
  "diff": "20",
  "start": "<genesis_block_height>",
  "dec": "8"
}
```

## Indexer Work Definition

### What Counts as "Work"?

The $402 network defines **Proof of Indexing** (PoI):

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROOF OF INDEXING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. TRANSACTION INDEXING                                        │
│     - Watch blockchain for payments to registered endpoints    │
│     - Record payment in local database                          │
│     - Broadcast to overlay network peers                        │
│     - Proof: BEEF transaction + merkle path                     │
│                                                                 │
│  2. UHRP CONTENT HOSTING                                        │
│     - Store content referenced by UHRP hash                     │
│     - Serve content to requesters                               │
│     - Proof: Bandwidth logs + challenge responses               │
│                                                                 │
│  3. PEER RELAY                                                  │
│     - Forward transactions to other indexers                    │
│     - Maintain overlay network connectivity                     │
│     - Proof: Signed message acknowledgments                     │
│                                                                 │
│  4. UPTIME                                                      │
│     - Stay online and responsive                                │
│     - Handle queries from network                               │
│     - Proof: Heartbeat signatures + response latency            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Work-to-Token Pipeline

```
   Indexer does work     Work verified by peers     Tokens released
   ─────────────────     ────────────────────────   ────────────────
   
   ┌──────────────┐      ┌──────────────┐          ┌──────────────┐
   │ Index a      │      │ Submit proof │          │ Mint $402    │
   │ transaction  │─────▶│ to network   │─────────▶│ tokens       │
   │              │      │ for verify   │          │              │
   └──────────────┘      └──────────────┘          └──────────────┘
         │                     │                          │
         ▼                     ▼                          ▼
   PoW required:         Peers validate:           If valid:
   - Hash solution       - BEEF merkle proof       - Indexer mints
   - Difficulty target   - Timestamp range         - 1000 $402
   - Unique nonce        - No duplicate claim      - On-chain record
```

## Token Economics

### Supply Schedule

```
Max Supply:        21,000,000 $402
Mint per solution: 1,000 $402
Difficulty:        Adjusts based on network hashrate
Halving:           Every 210,000 blocks (matches BTC pattern)
```

### Distribution (No Pre-mine)

```
100% → Indexers who do work
  0% → Team
  0% → Investors
  0% → Treasury

This is the ONLY way tokens enter circulation.
```

### Difficulty Adjustment

Like Bitcoin, difficulty adjusts to maintain target block time:

```javascript
// Pseudocode
const TARGET_SOLUTIONS_PER_DAY = 1440; // ~1 per minute
const ADJUSTMENT_PERIOD = 144; // ~every 2.4 hours

function adjustDifficulty(recentSolutions, elapsedTime) {
  const actualRate = recentSolutions / elapsedTime;
  const targetRate = TARGET_SOLUTIONS_PER_DAY / 86400;
  
  if (actualRate > targetRate * 1.1) {
    difficulty += 1; // Make harder
  } else if (actualRate < targetRate * 0.9) {
    difficulty -= 1; // Make easier
  }
}
```

## Integration with Path402

### Payment Flow

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                       COMPLETE FLOW                              │
   └──────────────────────────────────────────────────────────────────┘

   1. Content Creator registers endpoint
      └── Domain: pay@b0ase.com
      └── Creates asset in divvy_assets
      └── Deploys $B0ASE token

   2. User purchases content
      └── Pays to pay@b0ase.com
      └── Transaction hits blockchain

   3. Indexer notices payment
      └── Indexes transaction
      └── Computes PoW solution
      └── Submits proof to overlay network

   4. Network validates
      └── Peers verify BEEF merkle path
      └── Confirm PoW solution
      └── Indexer mints $402 tokens

   5. divvyd distributes
      └── Payment recorded in divvy_payments
      └── Pro-rata split to $B0ASE holders
      └── Payouts via HandCash/paymail

   6. Indexer earns
      └── $402 tokens for indexing work
      └── Transaction fees for facilitating
```

### Staking & Reputation (Future)

```
Level 1: New Indexer      → Base rewards
Level 2: 10k $402 staked  → 1.5x rewards + priority routing
Level 3: 100k $402 staked → 2x rewards + governance voting
Level 4: 1M $402 staked   → "Supernode" status + fee sharing
```

## Implementation Roadmap

### Phase 1: Foundation (Current)
- [x] divvy_* schema deployed
- [x] divvyd daemon running
- [x] Path402 → Divvy integration
- [ ] Single indexer (centralized)

### Phase 2: PoW Token Launch
- [ ] Deploy $402 token (PoW20 spec)
- [ ] Build minting interface
- [ ] Create proof validation logic
- [ ] Lock all tokens until earned

### Phase 3: Overlay Network
- [ ] Peer gossip protocol (BRC-22)
- [ ] Multi-indexer coordination
- [ ] UHRP content hosting
- [ ] Proof aggregation

### Phase 4: Decentralization
- [ ] Difficulty adjustment
- [ ] Reputation system
- [ ] Governance voting
- [ ] Fee market

## Technical References

### BSV Standards to Follow

1. **PoW20 Protocol**
   - Site: https://pow20.io
   - Pattern: SHA256(SHA256(TICK + ADDRESS + BLOCK_HEADER + NONCE))

2. **BRC-62: BEEF Format**
   - Repo: https://github.com/bitcoin-sv/BRCs
   - Purpose: SPV-friendly transaction format

3. **UHRP: Universal Hash Resolution Protocol**
   - Purpose: Content addressing by SHA256 hash
   - Tools: NanoSeek (download), NanoStore-Publisher (upload)

4. **Overlay Networks (BRC-22)**
   - Topic-based pub/sub for BSV
   - UTXO-based advertisement tokens

### Key GitHub Repositories

```
git clone https://github.com/bitcoin-sv/bitcoin-sv        # Node
git clone https://github.com/bsv-blockchain/ts-sdk       # TypeScript SDK
git clone https://github.com/bsv-blockchain/go-sdk       # Go SDK
git clone https://github.com/bitcoin-sv/BRCs            # Standards
git clone https://github.com/sCrypt-Inc/scrypt-ord       # Ordinals contracts
```

## Security Considerations

### Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Fake indexing claims | BEEF merkle proofs required |
| Double-claiming work | Unique tx + nonce tracking |
| Sybil attacks | PoW cost makes spam expensive |
| Collusion | Multiple independent verifiers |

### Rate Limiting

```
Max claims per block: 100 per indexer
Cooldown period: 6 confirmations before claim
Proof expiry: Claims must be made within 144 blocks
```

## Conclusion

The $402 PoW20 token creates a self-sustaining economy for the Path402 overlay network:

- **Indexers earn** by doing useful work
- **Content creators earn** through dividend distribution
- **Token holders** can stake for enhanced rewards
- **No securities risk** because distribution is purely work-based

This aligns with BSV's vision of **"earn by doing, not by holding"** and builds on proven standards (PoW20, BEEF, UHRP).

---

## Summary for AI Readers

- $402 is a PoW20 token on BSV rewarding indexers
- Tokens minted only through proof-of-work, no pre-mine
- Proof-of-Indexing: validate payments, host content, relay data
- Uses BEEF (BRC-62) for SPV verification
- Uses UHRP for content addressing
- Integrates with divvyd for dividend distribution
- Avoids securities classification through fair distribution
