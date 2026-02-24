#!/usr/bin/env node
/**
 * HTM Mint Service — CLI entry point.
 *
 * Reads configuration from environment variables or ClawMiner's SQLite DB,
 * then starts the HTTP mint server.
 *
 * Environment variables:
 *   HTM_PRIVATE_KEY_WIF — Miner private key (WIF format)
 *   HTM_TOKEN_ID        — BSV-21 token origin (default: $402 mainnet token)
 *   HTM_MINT_PORT       — Listen port (default: 8403)
 *   HTM_MINT_HOST       — Bind address (default: 127.0.0.1)
 *
 * If HTM_PRIVATE_KEY_WIF is not set, attempts to read from ~/.clawminer/clawminer.db
 * using the sqlite3 CLI.
 */

import { execSync } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { createMintServer } from './server'

const DEFAULT_TOKEN_ID =
    '32ae25f861192f286bdbaf28f50b8ac1cd5ec4ff0b23a9831fa821acf91e5d02_0'

function getWifFromDb(): string | null {
    const dbPath = path.join(os.homedir(), '.clawminer', 'clawminer.db')

    if (!fs.existsSync(dbPath)) {
        return null
    }

    try {
        const result = execSync(
            `sqlite3 "${dbPath}" "SELECT value FROM config WHERE key = 'wallet_wif' LIMIT 1"`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim()

        return result || null
    } catch {
        return null
    }
}

function main(): void {
    console.log('[htm-mint] HTM Mint Service starting...')

    // Resolve WIF
    let wif = process.env.HTM_PRIVATE_KEY_WIF

    if (!wif) {
        console.log(
            '[htm-mint] HTM_PRIVATE_KEY_WIF not set, checking ~/.clawminer/clawminer.db...'
        )
        wif = getWifFromDb() ?? undefined

        if (wif) {
            console.log('[htm-mint] WIF loaded from ClawMiner database')
        }
    } else {
        console.log('[htm-mint] WIF loaded from environment variable')
    }

    if (!wif) {
        console.error(
            '[htm-mint] ERROR: No private key found. Set HTM_PRIVATE_KEY_WIF or ensure ~/.clawminer/clawminer.db has wallet_wif.'
        )
        process.exit(1)
    }

    const tokenId = process.env.HTM_TOKEN_ID || DEFAULT_TOKEN_ID
    const port = parseInt(process.env.HTM_MINT_PORT || '8403', 10)
    const host = process.env.HTM_MINT_HOST || '127.0.0.1'

    createMintServer({
        privateKeyWif: wif,
        tokenId,
        port,
        host,
    })
}

main()
