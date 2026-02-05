# Token Minting Implementation

## Overview

This implementation provides a complete BSV-21 token minting system for the $402 protocol, including spec documentation, UI, and API scaffolding.

## 1. Protocol Specification Update

**File**: `docs/PROTOCOL_SPEC.md`

Added comprehensive BSV-21 mint specification with path402 extensions:

### Key Fields

```json
{
  "p": "bsv-21",
  "op": "deploy+mint",
  "id": "<txid>:<vout>",
  "amt": "100",
  "sym": "ALICE",
  "path402": {
    "paymentAddress": "1AliceXYZ...",    // ← Canonical payment routing
    "issuerPubkey": "03abc123...",       // ← Signature verification
    "dividendRate": 5,                    // ← % of ALL sales → stakers
    "domain": "alice.com",                // ← Optional DNS binding
    "accessRate": 1,                      // ← Tokens per second
    "protocol": "path402",
    "version": "3.0.0"
  }
}
```

### Payment Routing

All token sales are routed through the canonical `paymentAddress`:

```
Sale for 200 sats, dividendRate = 5%
  ├─ 190 sats → Seller (market profit)
  └─ 10 sats → Staker pool (dividends)
```

## 2. Minting UI

**File**: `apps/web/src/app/mint/page.tsx`

### Features

- **Industrial Design**: Matches existing aesthetic (sharp, monochrome, high-contrast)
- **Multi-Step Flow**:
  1. Form (required + optional fields)
  2. Confirmation (review all details)
  3. Minting (loading state)
  4. Success (transaction ID + next steps)

### Form Fields

#### Required
- Token Symbol (e.g., ALICE)
- Total Supply (immutable)
- Payment Handle (Paymail/HandCash/BSV address)
- Dividend Rate (0-20%, slider)

#### Optional
- Domain Binding (with TXT record instructions)
- Description
- Access Rate (tokens/second)

### DNS Binding

If domain is specified, UI displays required TXT record:

```
path402-token=<tokenId>:<paymentAddress>
```

## 3. Mint API Endpoint

**File**: `apps/web/src/app/api/mint/route.ts`

### Endpoint

```
POST /api/mint
```

### Request Body

```json
{
  "symbol": "ALICE",
  "supply": "100",
  "paymentHandle": "alice@handcash.io",
  "dividendRate": 5,
  "domain": "alice.com",
  "description": "Access to premium content",
  "accessRate": 1
}
```

### Response

```json
{
  "success": true,
  "txid": "abc123...",
  "tokenId": "abc123...:0",
  "inscription": { ... }
}
```

### Implementation TODOs

The API includes scaffolding for:

1. **Payment Handle Resolution**:
   - Paymail resolution (via DNS + HTTPS)
   - HandCash handle API
   - BSV address validation

2. **Wallet Integration**:
   - Get issuer public key from connected wallet
   - Sign transactions

3. **BSV Transaction Building**:
   - Create inscription script
   - Build 1-sat output
   - Broadcast to network

4. **Local Indexing**:
   - Store token in pathd database
   - Enable local querying

## Next Steps

### Immediate Tasks

1. **Implement Wallet Connection**:
   - Integrate BRC-103/104 authentication
   - Get public key from wallet
   - Sign transactions

2. **Implement Payment Resolution**:
   - Paymail DNS lookup + HTTPS request
   - HandCash API integration
   - BSV address validation

3. **Implement Transaction Builder**:
   - Use `@bsv/sdk` or similar library
   - Create inscription output
   - Broadcast via WhatsOnChain API

4. **Implement Local Indexing**:
   - Add tokens table to pathd.db
   - Query tokens by owner
   - Track staking status

### Future Enhancements

1. **Token Discovery**:
   - Browse all minted tokens
   - Search by symbol/domain
   - Trending tokens

2. **Staking Interface**:
   - Stake/unstake tokens
   - View dividend earnings
   - KYC integration for verified staking

3. **Market Making**:
   - List tokens for sale
   - Buy tokens from others
   - Order book UI

4. **Analytics**:
   - Token price history
   - Trading volume
   - Staker distribution

## Testing

### Manual Testing Flow

1. Navigate to `/mint`
2. Fill out form with test data
3. Review confirmation screen
4. Currently: API will return error (not implemented)
5. After implementation: Transaction will broadcast to BSV testnet

### Fields to Test

- Symbol validation (max 10 chars)
- Supply validation (must be positive number)
- Payment handle formats:
  - BSV address: `1AliceXYZ...`
  - Paymail: `alice@handcash.io`
  - HandCash: `$alice`
- Dividend rate slider (0-20%)
- Domain format validation
- Access rate bounds (1-100)

## Architecture Notes

### Why BSV-21 over BSV-20?

BSV-21 (formerly BSV-20 V2) provides:
- Single-transaction mint (deploy+mint)
- Tickerless mode (token ID = txid:vout)
- Better control over distribution
- Easier to trace token history

### Payment Routing

The `paymentAddress` field is critical:
- ALL sales route through this address
- Protocol enforces dividend split
- Prevents bypassing the system
- Enables trustless market making

### DNS Binding

Optional but powerful:
- Human-friendly discovery
- SEO benefits
- Trust signal
- Multi-token per domain support

## References

- [BSV-21 Standard](https://1satordinals.com/docs/bsv-21)
- [BRC-103 Authentication](https://github.com/bitcoin-sv/...)
- [BRC-105 Payment](https://github.com/bitcoin-sv/...)
- [Paymail Protocol](https://docs.moneybutton.com/docs/paymail-overview.html)
