# Ty Everett's Suggestion: AuthFetch + Payment Express Middleware for BRC-105

**Date:** 2026-02-07
**Status:** Noted — revisit after alpha.3 stabilization

## What Ty Said

> "Let's use AuthFetch and Payment Express Middleware for HTTP 402, as described in BRC-105."

## What This Means

### AuthFetch
- A user agent from `@bsv/sdk` that **automatically responds to HTTP 402 challenges**
- When a server returns `402 Payment Required`, AuthFetch constructs a BSV payment transaction and retries the request with the payment attached
- Client-side: replaces manual payment flows with automatic micropayment negotiation
- Package: `@bsv/sdk` (AuthFetch class)

### Payment Express Middleware
- An Express.js middleware from `@bsv/payment-express-middleware` (or `payment-express-middleware`)
- Server-side: wraps Express routes with automatic 402 payment gating
- Features:
  - Configurable pricing via `calculateRequestPrice` function
  - Nonce-based derivation to prevent replay attacks
  - Auth integration (BRC-103) to track who is paying
  - Automatic payment verification before passing request to handler
- Repo: https://github.com/bitcoin-sv/payment-express-middleware

### BRC-105 (HTTP Service Monetization Framework)
- Spec: https://github.com/bitcoin-sv/BRCs/blob/master/payments/0105.md
- Defines how a BRC-103-authenticated server requests and verifies BSV payment within a standard HTTP request-response cycle
- Flow: Client request → Server returns 402 with payment terms → Client (AuthFetch) constructs BSV tx → Client retries with payment → Server verifies and serves content

## How This Would Change path402

### Current Architecture
- Content serving uses our own `$402/content/v1` gossip topic
- Ticket/stamp system for access control
- Custom payment verification in content API routes

### With BRC-105 Integration
- Content API routes (`/api/content/serve/{hash}`) would use Payment Express Middleware
- Clients would use AuthFetch instead of custom ticket presentation
- Payment flow becomes standard HTTP 402 challenge/response
- Interoperable with ANY BRC-105 client, not just path402
- This is exactly what Bob Babbage asked for in the BRC-116 review (Section 6.2 now says "implementations SHOULD use BRC-105")

### Concrete Changes Needed
1. **Server side:** Add `payment-express-middleware` to `@b0ase/path402-core` GUI server
2. **Client side:** Use `AuthFetch` from `@bsv/sdk` in content requests
3. **Wallet integration:** AuthFetch needs a BRC-100 wallet to sign payment transactions — aligns with new Section 8 (BRC-100 Wallet Separation)
4. **Pricing:** Define `calculateRequestPrice` for content serving (could be based on content size, type, etc.)

## References
- Payment Express Middleware: https://github.com/bitcoin-sv/payment-express-middleware
- BRC-105 spec: https://github.com/bitcoin-sv/BRCs/blob/master/payments/0105.md
- BRC-103 (mutual auth): https://github.com/bitcoin-sv/BRCs/blob/master/peer-to-peer/0003.md
- Babbage docs: https://docs.projectbabbage.com/docs/quickstarts/micropayments-in-action
