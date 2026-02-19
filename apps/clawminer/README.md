# ClawMiner — $402 Proof-of-Indexing Miner

A Go daemon that joins the $402 gossip network, indexes work, and mines Proof-of-Indexing blocks. Designed for embedded/mobile deployment on the ClawMiner hardware (~$100 rugged Android device).

## Quick Start

```bash
# Build
make build

# Run (creates ~/.clawminer/ on first run)
./build/clawminerd

# Check health
curl http://127.0.0.1:8402/health
```

## Configuration

Copy `clawminer.yaml.example` to `~/.clawminer/clawminer.yaml` and edit:

```yaml
wallet:
  key: "your-WIF-private-key"
mining:
  token_id: "your-HTM-contract-txid"
```

Or use environment variables:
- `CLAWMINER_WALLET_KEY` — WIF private key
- `HTM_TOKEN_ID` — HTM contract transaction ID
- `CLAWMINER_DATA_DIR` — override data directory

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Uptime, version, peer count |
| `GET /status` | Full node status |
| `GET /api/tokens` | Known token list |
| `GET /api/portfolio` | Holdings summary |
| `GET /api/peers` | Connected peers |
| `GET /api/mining/status` | Blocks mined, hash rate |

## Architecture

```
cmd/clawminerd/     → Entry point, signal handling
internal/config/    → YAML config + env overlay
internal/daemon/    → Lifecycle orchestrator
internal/db/        → SQLite (embedded schema)
internal/gossip/    → Protocol, node, handler
internal/mining/    → PoW, block templates, service
internal/wallet/    → Key loading
internal/server/    → HTTP JSON API
```

## Cross-Compilation

```bash
make build-darwin-arm64   # macOS Apple Silicon
make build-linux-amd64    # Linux x86_64
make build-android        # Android ARM64 (requires NDK)
```

## Network Compatibility

Joins the same gossip network as TypeScript nodes. Key constants:

- **Topics**: `$402/tokens/v1`, `$402/transfers/v1`, `$402/stamps/v1`, `$402/chat/v1`, `$402/content/v1`
- **Protocol version**: `0.1.0`
- **Gossip port**: `4020`
- **HTTP API**: `8402`
- **Max message**: 64KB, TTL: 300s, Max hops: 10
