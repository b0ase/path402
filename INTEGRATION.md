# $402 MCP Server Integration

This MCP server enables AI agents (like Claude Code) to interact with the $402 protocol endpoints on b0ase.com.

## How It Works

1. **Middleware**: `middleware.ts` intercepts routes starting with `/$` (e.g., `/$b0ase.com/blog/slug`)
2. **402 Response**: Returns HTTP 402 with pricing info in headers and body
3. **MCP Tools**: AI agents use these tools to discover, evaluate, and acquire content

## Available Tools

| Tool | Purpose |
|------|---------|
| `path402_discover` | Probe a $address, get pricing and terms |
| `path402_evaluate` | Check budget, estimate ROI, get recommendation |
| `path402_acquire` | Pay and receive token + content |
| `path402_wallet` | View token portfolio and balance |
| `path402_price_schedule` | See how price changes with supply |
| `path402_set_budget` | Configure agent's spending budget |

## Configuration

The server is configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "path402": {
      "command": "node",
      "args": ["lib/mcp-servers/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

## Testing

### With Mock Server

The MCP server includes mock responses for testing without a live $402 endpoint:

```
$b0ase.com/$blog/$my-post → Mock 402 response with pricing
```

### With Live Server

Point to the actual b0ase.com $ routes:

```
$b0ase.com/blog/the-maths-of-viral-pricing → Real 402 response
```

## Integration with b0ase.com Middleware

The middleware (`middleware.ts`) creates 402 responses that match the $402 protocol:

```typescript
// Headers
X-Protocol: $402
X-Version: 0.1.0
X-Price: 1000
X-Currency: SAT
X-Payment-Address: $richardboase
X-Token-Address: $b0ase.com/blog/slug

// Body
{
  protocol: "$402",
  version: "0.1.0",
  dollarAddress: "$b0ase.com/blog/slug",
  pricing: { model: "fixed", basePrice: 1000, currency: "SAT" },
  revenue: { model: "fixed_issuer", issuerShare: 0.5 },
  currentSupply: 0,
  currentPrice: 1000,
  paymentAddress: "$richardboase",
  contentPreview: "...",
  children: []
}
```

## Payment Flow

1. Agent calls `path402_discover` to get pricing
2. Agent calls `path402_evaluate` to check budget
3. If approved, agent calls `path402_acquire` with payment
4. Middleware verifies `X-Payment-Proof` header
5. Content is served, token recorded

## Future Enhancements

- [ ] Real HandCash payment integration
- [ ] On-chain token recording (BSV inscriptions)
- [ ] Revenue sharing to token holders
- [ ] Dynamic pricing (sqrt decay)
