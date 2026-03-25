# ClawMiner Daemon

The ClawMiner Go daemon (mining algorithm, wallet internals, MCP tools, mobile apps) has been moved to a **private repository** for security hardening.

## Why

The path402 monorepo is open-source. Exposing the PoW mining algorithm, wallet key handling, and MCP tool internals in a public repo created exploitation vectors. The daemon source now lives in a private repo where it can be developed safely.

## What remains public

- This README (pointer)
- The $402 protocol spec in `docs/`
- The MCP tool interface definitions in `packages/core/`

## Building

If you have access to the private repo (`Claw-Miner-App`):

```bash
cd /path/to/Claw-Miner-App
make build-daemon       # Build Go binary
make bind-android       # Android gomobile bindings
make bind-ios           # iOS gomobile bindings
make build-apk          # Android APK
```

## Network Compatibility

Joins the $402 gossip network:

- **Gossip port**: `4020`
- **HTTP API**: `8402`
- **Protocol version**: `0.1.0`

## Access

Contact the maintainer for access to the private daemon source.
