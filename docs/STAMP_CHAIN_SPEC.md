# Ticket Stamp Chain Specification

**Version:** 1.0.0  
**Status:** Draft  
**Date:** February 5, 2026

## Abstract

This specification defines the Ticket Stamp Chain mechanism for the $402 protocol. Stamp chains solve the indexer incentive problem by creating a cryptographically verifiable provenance trail for each ticket. Each stamp represents validation work performed by an indexer, creating a trust layer that enables decentralized content serving without requiring a bootstrap token.

## Motivation

### The Indexer Problem

When a user purchases a ticket to access `fred.com/$video`, the following problems arise:

1. **Validation Cost**: The serving indexer must validate the ticket's UTXO exists on-chain, which requires blockchain indexing infrastructure
2. **No Indexer Revenue**: If 100% of payment goes to the content creator (Fred), indexers have no economic incentive to validate and serve content
3. **DDoS Vulnerability**: Without economic filtering, malicious actors could create unlimited worthless tickets, forcing indexers to waste resources validating spam
4. **Trust Gap**: Fresh tickets have no provenance—users can't distinguish quality content from spam

### The Stamp Chain Solution

Stamp chains solve all four problems simultaneously:

1. **Indexers earn fees** for each validation (stamp) they add
2. **Economic filtering** emerges (unpopular content doesn't get stamped)
3. **Trust accumulates** over time (more stamps = more validation)
4. **Viral discovery** becomes possible (sort by stamp count)

## Architecture

### Ticket Structure

A ticket is a BSV-21 token (UTXO) with attached metadata including a stamp chain:

```json
{
  "version": "1.0.0",
  "ticket": {
    "utxo": "a1b2c3...:0",
    "path": "fred.com/$video",
    "issuer": {
      "domain": "fred.com",
      "pubkey": "03a1b2c3...",
      "inscription": "i1234567"
    },
    "issuedAt": 1738500000,
    "price": 1000,
    "indexerFee": 50
  },
  "stampChain": [
    {
      "seq": 1,
      "indexer": {
        "domain": "indexer-a.com",
        "pubkey": "03d4e5f6...",
        "paymentAddr": "1A1B2C..."
      },
      "owner": "03h7i8j9...",
      "timestamp": 1738500100,
      "blockHeight": 837492,
      "action": "validated_and_served",
      "feePaid": 50,
      "signature": "304402..."
    }
  ],
  "metadata": {
    "stampCount": 1,
    "lastStamped": 1738500100,
    "totalFeesGenerated": 50
  }
}
```

### Stamp Anatomy

Each stamp contains:

| Field | Type | Description |
|-------|------|-------------|
| `seq` | integer | Sequence number (increments by 1) |
| `indexer.domain` | string | Domain running the indexer |
| `indexer.pubkey` | string | Indexer's public key (from domain inscription) |
| `indexer.paymentAddr` | string | Address that received indexer fee |
| `owner` | string | Public key of ticket owner at time of stamp |
| `timestamp` | integer | Unix timestamp when stamp was created |
| `blockHeight` | integer | BSV block height at validation time |
| `action` | enum | `validated_and_served`, `returned`, `resold` |
| `feePaid` | integer | Satoshis paid to indexer for this stamp |
| `signature` | string | Indexer's signature over stamp data |

## Economics

### Fee Split Model

When a user purchases a ticket, payment is split:

```
Total Price: 1000 sats
  ├─ Creator (Fred): 950 sats (95%)
  └─ Indexer Fee: 50 sats (5%)
```

**Fee Determination**:
- Creator sets `indexerFee` in path inscription
- Market competition adjusts fees over time
- Higher fees attract more indexers (better availability)
- Lower fees may be acceptable for high-volume content

### Stamp Value Accumulation

Tickets gain value as stamp chains grow:

```
Fresh ticket (0 stamps):     1000 sats (base price)
After 10 stamps:             1100 sats (+10% trust premium)
After 100 stamps:            1300 sats (+30% popularity premium)
After 1000 stamps:           2000 sats (+100% viral premium)
```

**Trust Premium Factors**:
1. **Chain length**: More stamps = more validators agree content is valuable
2. **Indexer diversity**: Stamps from 10 different indexers > 10 stamps from 1 indexer
3. **Indexer reputation**: Stamps from high-reputation indexers worth more
4. **Age**: Older stamps with UTXO still valid = higher trust

## Protocol Flow

### 1. Initial Purchase & First Stamp

```
Alice requests fred.com/$video
  ↓
GET /$video HTTP/1.1
Host: fred.com
  ↓
HTTP/1.1 402 Payment Required
X-BSV-Price: 1000
X-BSV-Indexer-Fee: 50
X-BSV-Creator-Address: 1FredXYZ...
X-BSV-Indexer-Address: 1IndexerABC...
  ↓
Alice broadcasts transaction:
  Output 1: 950 sats → 1FredXYZ... (Fred)
  Output 2: 50 sats → 1IndexerABC... (indexer-a.com)
  Change: BSV-21 token → Alice's address
  ↓
Indexer-a validates transaction on-chain
  ↓
Indexer-a creates Stamp #1:
  {
    "seq": 1,
    "indexer": "indexer-a.com",
    "owner": "alice_pubkey",
    "action": "validated_and_served",
    "feePaid": 50,
    ...
  }
  ↓
Indexer-a signs stamp, adds to ticket.stampChain
  ↓
Alice receives stamped ticket + content
```

### 2. Ticket Return & Second Stamp

```
Alice finishes watching video
  ↓
Ticket automatically returns to Fred via BSV-21 mechanics
  ↓
Fred.com (running indexer) creates Stamp #2:
  {
    "seq": 2,
    "indexer": "fred.com",
    "owner": "fred_pubkey",
    "action": "returned",
    "feePaid": 0,
    ...
  }
  ↓
Ticket now has 2-stamp chain
```

### 3. Resale & Third Stamp

```
Bob wants to watch fred.com/$video
  ↓
Bob requests from indexer-b.com (different indexer)
  ↓
Bob pays: 950 sats to Fred + 50 sats to indexer-b
  ↓
Indexer-b validates UTXO + stamp chain
  ↓
Indexer-b creates Stamp #3:
  {
    "seq": 3,
    "indexer": "indexer-b.com",
    "owner": "bob_pubkey",
    "action": "validated_and_served",
    "feePaid": 50,
    ...
  }
  ↓
Ticket now has 3-stamp chain (validated by 2 different indexers)
```

### 4. Secondary Market Trading

```
Bob decides to sell his ticket
  ↓
Lists on secondary market for 900 sats
  (Discount because pre-validated)
  ↓
Carol buys from Bob (off-chain trade)
  ↓
Carol requests content from indexer-c.com
  ↓
Indexer-c validates existing stamp chain:
  - Verifies all 3 previous stamps
  - Checks UTXO still valid
  - Adds Stamp #4
  ↓
Ticket now has 4-stamp chain
```

## Validation Protocol

### Stamp Chain Validation Algorithm

```javascript
async function validateStampChain(ticket) {
  // 1. Verify UTXO exists and is unspent
  const utxo = await blockchain.getUTXO(ticket.utxo);
  if (!utxo || utxo.spent) {
    throw new Error('UTXO invalid or spent');
  }
  
  // 2. Verify issuer inscription
  const inscription = await blockchain.getInscription(
    ticket.issuer.inscription
  );
  if (inscription.domain !== ticket.path.split('/')[0]) {
    throw new Error('Issuer mismatch');
  }
  
  // 3. Validate each stamp in chain
  let previousStamp = null;
  for (const stamp of ticket.stampChain) {
    // 3a. Verify sequence number
    if (stamp.seq !== (previousStamp?.seq || 0) + 1) {
      throw new Error(`Invalid sequence at stamp ${stamp.seq}`);
    }
    
    // 3b. Verify indexer signature
    const indexerPubkey = await resolveIndexerPubkey(
      stamp.indexer.domain
    );
    const stampData = serializeStamp(stamp);
    const sigValid = verifySignature(
      stampData,
      stamp.signature,
      indexerPubkey
    );
    if (!sigValid) {
      throw new Error(`Invalid signature at stamp ${stamp.seq}`);
    }
    
    // 3c. Verify UTXO existed at claimed block height
    const utxoHistory = await blockchain.getUTXOHistory(
      ticket.utxo,
      stamp.blockHeight
    );
    if (!utxoHistory.existed) {
      throw new Error(`UTXO didn't exist at block ${stamp.blockHeight}`);
    }
    
    // 3d. Verify timestamp is reasonable
    const blockTime = await blockchain.getBlockTime(stamp.blockHeight);
    if (Math.abs(stamp.timestamp - blockTime) > 7200) {
      throw new Error(`Timestamp mismatch at stamp ${stamp.seq}`);
    }
    
    // 3e. Verify fee payment (if action was validated_and_served)
    if (stamp.action === 'validated_and_served') {
      const txValidated = await blockchain.verifyPayment(
        stamp.indexer.paymentAddr,
        stamp.feePaid,
        stamp.blockHeight
      );
      if (!txValidated) {
        throw new Error(`Fee payment not found for stamp ${stamp.seq}`);
      }
    }
    
    previousStamp = stamp;
  }
  
  return {
    valid: true,
    stampCount: ticket.stampChain.length,
    uniqueIndexers: new Set(
      ticket.stampChain.map(s => s.indexer.domain)
    ).size,
    totalFeesGenerated: ticket.stampChain.reduce(
      (sum, s) => sum + s.feePaid, 0
    )
  };
}
```

### Creating a New Stamp

```javascript
async function createStamp(ticket, currentOwner, indexerConfig) {
  const previousStamp = ticket.stampChain[ticket.stampChain.length - 1];
  
  const stamp = {
    seq: (previousStamp?.seq || 0) + 1,
    indexer: {
      domain: indexerConfig.domain,
      pubkey: indexerConfig.pubkey,
      paymentAddr: indexerConfig.paymentAddr
    },
    owner: currentOwner.pubkey,
    timestamp: Date.now(),
    blockHeight: await blockchain.getCurrentHeight(),
    action: 'validated_and_served',
    feePaid: ticket.indexerFee,
    signature: null // Added below
  };
  
  // Sign the stamp
  const stampData = serializeStamp(stamp);
  stamp.signature = await sign(stampData, indexerConfig.privateKey);
  
  return stamp;
}
```

## Indexer Discovery & Reputation

### Indexer Registration

Indexers register by inscribing their domain identity:

```json
{
  "protocol": "path402-indexer",
  "version": "1.0.0",
  "domain": "indexer-a.com",
  "pubkey": "03d4e5f6...",
  "paymentAddr": "1IndexerABC...",
  "dns": {
    "txt": "path402-indexer=03d4e5f6..."
  },
  "stake": {
    "amount": 100000,
    "lockScript": "..."
  }
}
```

**Registration Requirements**:
1. **Domain ownership**: Must control DNS for claimed domain
2. **TXT record**: Publish pubkey in DNS TXT record
3. **Stake**: Lock stake (optional but improves reputation)
4. **Inscription**: Inscribe identity on BSV blockchain

### Reputation Scoring

Indexer reputation is calculated from stamp history:

```javascript
function calculateReputation(indexer) {
  const stamps = getAllStampsBy(indexer.domain);
  
  // Reputation factors
  const totalStamps = stamps.length;
  const validStamps = stamps.filter(s => s.disputed === false).length;
  const uniqueContent = new Set(stamps.map(s => s.path)).size;
  const avgResponseTime = stamps.reduce((sum, s) => 
    sum + s.responseTime, 0) / totalStamps;
  const uptime = calculateUptime(indexer.domain);
  const stakeAmount = indexer.stake?.amount || 0;
  
  // Weighted score
  const score = (
    (validStamps / totalStamps) * 0.3 +        // 30%: accuracy
    Math.min(uniqueContent / 1000, 1) * 0.2 +  // 20%: diversity
    Math.max(1 - avgResponseTime / 5000, 0) * 0.2 + // 20%: speed
    uptime * 0.2 +                              // 20%: reliability
    Math.min(stakeAmount / 1000000, 1) * 0.1   // 10%: stake
  ) * 100;
  
  return {
    score: Math.round(score),
    totalStamps,
    validStamps,
    disputeRate: (totalStamps - validStamps) / totalStamps,
    uniqueContent,
    avgResponseTime,
    uptime,
    stakeAmount
  };
}
```

### Indexer Selection

Clients choose indexers based on:

```javascript
function selectIndexer(path, cachedIndexers) {
  // Filter indexers that have indexed this content before
  const experienced = cachedIndexers.filter(i => 
    i.indexedPaths.includes(path)
  );
  
  // If none have indexed this content, use any indexer
  const candidates = experienced.length > 0 
    ? experienced 
    : cachedIndexers;
  
  // Score candidates
  const scored = candidates.map(indexer => ({
    indexer,
    score: (
      indexer.reputation.score * 0.4 +           // 40%: reputation
      (100 - indexer.currentLoad) * 0.3 +        // 30%: availability
      (100 - indexer.feePercentage) * 0.2 +      // 20%: price
      (indexer.hasStamped(path) ? 20 : 0)        // 10%: experience bonus
    )
  }));
  
  // Return highest-scoring indexer
  scored.sort((a, b) => b.score - a.score);
  return scored[0].indexer;
}
```

## Anti-Fraud Mechanisms

### Preventing Fake Stamps

**Attack**: Malicious indexer adds stamp without validating UTXO

**Defense**: 
1. Stamps must include `blockHeight` and verifiable fee payment
2. Any client can re-validate stamp against blockchain
3. Disputed stamps damage indexer reputation permanently
4. Economic disincentive: indexer loses future revenue

### Preventing Chain Forgery

**Attack**: Create two different stamp chains for same ticket

**Defense**:
```javascript
// Each stamp includes hash of all previous stamps
stamp.chainHash = hash(JSON.stringify(ticket.stampChain));

// Clients reject tickets with forked chains
function detectFork(ticket) {
  for (let i = 1; i < ticket.stampChain.length; i++) {
    const recomputedHash = hash(
      JSON.stringify(ticket.stampChain.slice(0, i))
    );
    if (ticket.stampChain[i].chainHash !== recomputedHash) {
      throw new Error(`Fork detected at stamp ${i}`);
    }
  }
}
```

### Preventing Sybil Attacks

**Attack**: Create 1000 fake indexers to stamp your own content

**Defense**:
1. **Domain cost**: Each indexer needs unique domain ($10-15/year)
2. **Stake requirement**: New indexers must stake BSV to participate
3. **Reputation decay**: New indexers start with low reputation
4. **DNS verification**: Clients verify domain TXT records
5. **Diversity premium**: Stamps from diverse indexers worth more

### Preventing Replay Attacks

**Attack**: Reuse old stamps on new tickets

**Defense**:
```javascript
// Each stamp must reference specific UTXO
stamp.utxoRef = `${ticket.utxo.txid}:${ticket.utxo.vout}`;

// Validation checks UTXO match
if (stamp.utxoRef !== ticket.utxo) {
  throw new Error('Stamp UTXO mismatch');
}
```

## Network Effects

### 1. Trust Accumulation

As tickets are used, stamp chains grow:

```
Day 1:   100 tickets × 1 stamp each = 100 stamps total
Day 30:  100 tickets × 30 stamps each = 3,000 stamps total
Day 365: 100 tickets × 365 stamps each = 36,500 stamps total
```

**Effect**: Old, frequently-used tickets become MORE valuable than fresh tickets

### 2. Content Discovery

Users can discover quality content by stamp count:

```sql
SELECT path, COUNT(stamps) as popularity
FROM tickets
GROUP BY path
ORDER BY popularity DESC
LIMIT 100;
```

**Effect**: Viral content rises naturally through validation count

### 3. Indexer Competition

Popular content attracts indexers:

```
Hot video: 1000 requests/day
  ↓
10 indexers compete to serve it
  (Each earns 50 sats × 100 requests = 5000 sats/day)
  ↓
Competition improves speed, reliability
  ↓
Users get better service
```

**Effect**: Market forces improve infrastructure for popular content

### 4. Creator Incentives

Creators optimize for stamp accumulation:

```
Create viral content
  ↓
More people buy tickets
  ↓
More stamps accumulate
  ↓
Higher trust premium on secondary market
  ↓
Tickets resell at premium
  ↓
More revenue per ticket sold
```

**Effect**: Economic alignment between quality content and revenue

### 5. Secondary Market Liquidity

Pre-stamped tickets trade at different prices:

```
Fresh ticket (0 stamps):        1000 sats
Lightly-used (5 stamps):         950 sats (discount for no trust)
Popular (100 stamps):           1200 sats (premium for validation)
Viral hit (1000+ stamps):       1500 sats (premium for popularity)
```

**Effect**: Market-based pricing replaces central curation

## Implementation Considerations

### Storage Requirements

Stamp chains grow linearly with usage:

```
Stamp size: ~200 bytes
100 stamps: ~20 KB
1000 stamps: ~200 KB
10000 stamps: ~2 MB
```

**Solution**: Implement stamp chain pruning:
- Keep full chain for recent stamps (last 100)
- Keep merkle proof for older stamps
- Archive full chains off-chain for auditing

### Bandwidth Considerations

Clients must download stamp chains:

**Optimization 1**: Incremental sync
```javascript
// Client already has stamps 1-500
// Only download stamps 501-550
GET /ticket/metadata?from=500
```

**Optimization 2**: Stamp summaries
```javascript
{
  "stampSummary": {
    "totalStamps": 1000,
    "uniqueIndexers": 50,
    "firstStamp": "2026-01-01T00:00:00Z",
    "lastStamp": "2026-12-31T23:59:59Z",
    "merkleRoot": "abc123..."
  },
  "recentStamps": [...] // Last 10 stamps in full
}
```

### Scalability

For extremely popular content (millions of stamps):

**Solution**: Hierarchical stamping
```
Level 1: Individual stamps (1-1000)
Level 2: Batch summary stamps (groups of 1000)
Level 3: Archive stamps (groups of 100k)
```

## Comparison to Alternatives

### vs. PoW20 Bootstrap Token

| Aspect | Stamp Chains | PoW20 Token |
|--------|-------------|-------------|
| Complexity | Low | High |
| Bootstrap required | No | Yes |
| Economic alignment | Direct | Indirect |
| Market efficiency | High | Medium |
| Implementation cost | Low | High |

**Conclusion**: Stamp chains achieve same goals with pure Bitcoin economics

### vs. Central Indexer

| Aspect | Stamp Chains | Central Indexer |
|--------|-------------|------------------|
| Censorship resistance | High | Low |
| Single point of failure | None | Yes |
| Trust model | Distributed | Centralized |
| Scaling | Horizontal | Vertical |

**Conclusion**: Stamp chains enable trustless, decentralized indexing

### vs. No Indexers (Direct UTXO Check)

| Aspect | Stamp Chains | Direct Check |
|--------|-------------|--------------|
| Validation speed | Fast (cached) | Slow (on-chain) |
| Network required | Indexer network | Full BSV node |
| Trust premium | Emerges | None |
| Discovery | Enabled | Impossible |

**Conclusion**: Stamp chains make web-scale performance possible

## Future Extensions

### 1. Stamp Compression

Large stamp chains could be compressed using zk-SNARKs:

```javascript
{
  "stampProof": {
    "totalStamps": 10000,
    "zkProof": "...",  // Proves all 10k stamps valid
    "merkleRoot": "..."
  }
}
```

### 2. Cross-Chain Stamps

Stamps could reference validation on other chains:

```javascript
{
  "stamp": {
    "chain": "bsv",
    "crossChainValidation": {
      "chain": "ethereum",
      "proof": "..."
    }
  }
}
```

### 3. Stamp NFTs

Particularly valuable stamp chains could be NFT-ized:

```
Ticket to first-ever $402 video (stamp chain showing historical usage)
  → Collectible NFT
  → Sold at premium for historical value
```

### 4. Fractional Stamp Ownership

Popular content's stamp revenue could be fractionalized:

```
Own 1% of all stamp fees from fred.com/$video
  → Passive income from indexer fees
  → Speculation on content popularity
```

## Conclusion

Stamp chains solve the indexer incentive problem through pure Bitcoin economics, creating a self-sustaining network where:

1. **Indexers profit** from validation work
2. **Creators profit** from ticket sales AND trust premium accumulation
3. **Users benefit** from faster validation and better content discovery
4. **Network grows** through viral memecoin dynamics
5. **No bootstrap token needed** - pure BSV economics

The stamp chain is the missing piece that makes $402 economically viable at web scale.

---

## References

- BSV-21: Bitcoin Token Protocol
- BRC-100: Wallet-Application Interface
- $402 Protocol Specification
- Domain-based Identity Systems
