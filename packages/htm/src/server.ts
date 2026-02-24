/**
 * HTM Mint Service — HTTP server wrapping HtmBroadcaster for BSV-21 token minting.
 *
 * Provides a serial queue to prevent UTXO contention (contract UTXO is a chain —
 * only one mint transaction at a time).
 *
 * Endpoints:
 *   POST /mint   — Mint tokens for a mined block
 *   GET  /health — Liveness check
 *   GET  /status — Service stats
 */

import * as http from 'http'
import { HtmBroadcaster } from './broadcaster'

// ── Types ──

export interface MintServerConfig {
    /** WIF private key for the miner wallet */
    privateKeyWif: string
    /** BSV-21 token origin (e.g. "32ae25f...02_0") */
    tokenId: string
    /** Listen port (default 8403) */
    port?: number
    /** Bind address (default "127.0.0.1") */
    host?: string
}

interface MintRequest {
    merkle_root: string
    miner_address: string
    token_id: string
}

interface MintResponse {
    success: boolean
    txid?: string
    amount?: number
    error?: string
    action: string // "done" | "retry" | "stop"
}

// ── Serial Queue ──

class SerialQueue {
    private queue: (() => Promise<void>)[] = []
    private running = false

    enqueue<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    resolve(await fn())
                } catch (err) {
                    reject(err)
                }
            })
            this.drain()
        })
    }

    private async drain(): Promise<void> {
        if (this.running) return
        this.running = true
        while (this.queue.length > 0) {
            const task = this.queue.shift()!
            await task()
        }
        this.running = false
    }
}

// ── Mint Dedup Cache ──

interface CachedMint {
    response: MintResponse
    expiresAt: number
}

class MintDedupCache {
    private cache = new Map<string, CachedMint>()
    private readonly ttlMs: number

    constructor(ttlMs = 60_000) {
        this.ttlMs = ttlMs
    }

    get(merkleRoot: string): MintResponse | null {
        const entry = this.cache.get(merkleRoot)
        if (!entry) return null
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(merkleRoot)
            return null
        }
        return entry.response
    }

    set(merkleRoot: string, response: MintResponse): void {
        this.cache.set(merkleRoot, {
            response,
            expiresAt: Date.now() + this.ttlMs,
        })
        // Evict expired entries when cache grows
        if (this.cache.size > 200) {
            const now = Date.now()
            for (const [key, val] of this.cache) {
                if (now > val.expiresAt) this.cache.delete(key)
            }
        }
    }
}

// ── Server ──

export function createMintServer(config: MintServerConfig): http.Server {
    const {
        privateKeyWif,
        tokenId,
        port = 8403,
        host = '127.0.0.1',
    } = config

    const broadcaster = new HtmBroadcaster(tokenId, privateKeyWif)
    const mintQueue = new SerialQueue()
    const dedupCache = new MintDedupCache(60_000) // 60s TTL
    const minerAddress = broadcaster.getMinerAddress()

    let totalMints = 0
    let lastMintAt: string | null = null
    let dedupHits = 0

    console.log(`[htm-mint] Miner address: ${minerAddress}`)
    console.log(`[htm-mint] Token ID: ${tokenId}`)

    const server = http.createServer(async (req, res) => {
        // CORS / preflight
        res.setHeader('Content-Type', 'application/json')

        try {
            // ── GET /health ──
            if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200)
                res.end(JSON.stringify({ ok: true }))
                return
            }

            // ── GET /status ──
            if (req.method === 'GET' && req.url === '/status') {
                res.writeHead(200)
                res.end(
                    JSON.stringify({
                        token_id: tokenId,
                        miner_address: minerAddress,
                        total_mints: totalMints,
                        dedup_hits: dedupHits,
                        last_mint_at: lastMintAt,
                    })
                )
                return
            }

            // ── POST /mint ──
            if (req.method === 'POST' && req.url === '/mint') {
                const body = await readBody(req)
                let payload: MintRequest

                try {
                    payload = JSON.parse(body)
                } catch {
                    res.writeHead(400)
                    res.end(
                        JSON.stringify({
                            success: false,
                            error: 'Invalid JSON',
                            action: 'done',
                        } satisfies MintResponse)
                    )
                    return
                }

                if (!payload.merkle_root) {
                    res.writeHead(400)
                    res.end(
                        JSON.stringify({
                            success: false,
                            error: 'Missing merkle_root',
                            action: 'done',
                        } satisfies MintResponse)
                    )
                    return
                }

                console.log(
                    `[htm-mint] Mint request: merkle_root=${payload.merkle_root.slice(0, 16)}...`
                )

                // Dedup: return cached result if this merkle root was already processed
                const cached = dedupCache.get(payload.merkle_root)
                if (cached) {
                    dedupHits++
                    console.log(
                        `[htm-mint] Dedup hit for ${payload.merkle_root.slice(0, 16)}... (${dedupHits} total)`
                    )
                    res.writeHead(cached.success ? 200 : 500)
                    res.end(JSON.stringify(cached))
                    return
                }

                // Serialize through queue to prevent UTXO contention
                const result = await mintQueue.enqueue(() =>
                    broadcaster.broadcastMint(payload.merkle_root)
                )

                const response: MintResponse = {
                    success: result.success,
                    txid: result.txid,
                    amount: result.amount
                        ? Number(result.amount)
                        : undefined,
                    error: result.error,
                    action: result.action || 'done',
                }

                // Cache the result (both success and failure) to prevent duplicate broadcasts
                dedupCache.set(payload.merkle_root, response)

                if (result.success) {
                    totalMints++
                    lastMintAt = new Date().toISOString()
                    console.log(
                        `[htm-mint] Mint #${totalMints} success: txid=${result.txid}`
                    )
                }

                res.writeHead(result.success ? 200 : 500)
                res.end(JSON.stringify(response))
                return
            }

            // ── 404 ──
            res.writeHead(404)
            res.end(
                JSON.stringify({
                    error: 'Not found',
                })
            )
        } catch (err: any) {
            console.error('[htm-mint] Unhandled error:', err)
            res.writeHead(500)
            res.end(
                JSON.stringify({
                    success: false,
                    error: err?.message || 'Internal server error',
                    action: 'done',
                } satisfies MintResponse)
            )
        }
    })

    server.listen(port, host, () => {
        console.log(`[htm-mint] Listening on http://${host}:${port}`)
        console.log(`[htm-mint] Endpoints:`)
        console.log(`  POST /mint   — Submit mined block for BSV-21 minting`)
        console.log(`  GET  /health — Liveness check`)
        console.log(`  GET  /status — Service stats`)
    })

    return server
}

// ── Helpers ──

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        req.on('error', reject)
    })
}
