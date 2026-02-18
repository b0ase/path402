# Project Publication Guide

> How to publish any project on-chain using the $402 protocol.

## Quick Start

### 1. Add a `$402.json` to your repo root

```json
{
  "version": "1.0",
  "symbol": "$MYPROJECT",
  "path": "/$myproject",
  "description": "What this project does",
  "pricing": "alice_bond",
  "basePrice": 100,
  "supply": 1000000000,
  "exclude": ["node_modules", ".git", ".next", "dist", "build", ".env*", "*.log"],
  "metadata": {
    "license": "MIT",
    "repository": "https://github.com/org/repo"
  }
}
```

### 2. Publish (Dry Run)

```typescript
import { publishProject } from '@path402/core/publish';

const result = await publishProject({
  dir: '/path/to/your/project',
  dryRun: true, // Preview first
});

console.log(result.contentHash);   // Merkle root of all files
console.log(result.tokenId);      // Deterministic token ID
console.log(result.inscription);  // BSV21 inscription JSON
console.log(result.fileCount);    // Number of files hashed
```

### 3. Publish (For Real)

```typescript
const result = await publishProject({
  dir: '/path/to/your/project',
  issuerAddress: '1YourBsvAddress...',
  dryRun: false,
});
// → Broadcast the `result.inscription` to the BSV network
```

## Without `$402.json` (CLI Flags)

```typescript
const result = await publishProject({
  dir: '.',
  symbol: '$KWEGWONG',
  path: '/$kwegwong',
  description: 'Interactive adventure platform',
  pricing: 'alice_bond',
  basePrice: 100,
  issuerAddress: '1...',
  dryRun: true,
});
```

## What Happens Under the Hood

1. **Load manifest** — Reads `$402.json` or uses CLI flags
2. **Validate symbol** — Must be `$UPPERCASE`, 1-20 chars, not reserved
3. **Hash files** — Walks directory, SHA-256 hashes each file (respecting excludes)
4. **Compute Merkle root** — Sorted file paths + hashes → deterministic content hash
5. **Generate BSV21 inscription** — Standard token deploy + content hash extension
6. **Return result** — Everything needed to broadcast or preview

## The `$402.json` Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | string | No | `"1.0"` | Schema version |
| `symbol` | string | **Yes** | — | Token symbol (`$UPPERCASE`) |
| `path` | string | **Yes** | — | Dollar-address path |
| `description` | string | **Yes** | — | Human-readable description |
| `identity` | string | No | — | $401 identity reference |
| `pricing` | enum | No | `alice_bond` | Pricing model |
| `basePrice` | number | No | `100` | Base price in satoshis |
| `supply` | number | No | `1,000,000,000` | Total token supply |
| `permissions` | object | No | — | $403 permission rules |
| `exclude` | string[] | No | See defaults | Glob patterns to exclude |
| `issuerAddress` | string | No | — | BSV address (set at publish) |
| `metadata` | object | No | — | Website, avatar, license, repo |

## Content Hash Guarantee

The content hash is **deterministic**: same files → same hash, regardless of OS or timing.

- Files are sorted by path before hashing
- Each file contributes `"path:sha256hash"` to the input
- The Merkle root is SHA-256 of the concatenated entries
- `$402.json` is excluded from the hash (it describes the project, not the content)

## Integration Points

| Protocol | How It Connects |
|----------|----------------|
| **$401** | Set `identity` in manifest → `pathd` verifies via `X-Path-Identity` header |
| **$402** | The generated BSV21 inscription IS the $402 token |
| **$403** | Set `permissions.rules` in manifest → `pathd` enforces access rules |
| **pathd** | Serves the content behind the published token |
| **Divvy** | Token holders receive dividend distributions |
| **DNS-DEX** | Published tokens can be listed for secondary trading |
