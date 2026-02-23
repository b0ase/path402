import { NextRequest, NextResponse } from 'next/server';
import { BSVWallet } from '@b0ase/path402-core/wallet';
import { Config } from '@b0ase/path402-core';
import { validateSymbol, DEFAULT_ACCESS_RATE } from '@b0ase/path402-core/token';

// ── Types (matches MintFormData from mint page UI) ────────────────

interface MintFormData {
    type: 'domain' | 'email' | 'paymail' | 'content';
    identifier: string;
    paymentAddress: string;
    dividendRate: number;       // 0-100 (percentage to stakers)
    supply: string;
    accessRate: number;
    timeUnit: 'seconds' | 'minutes' | 'hours';
    accessMode: 'burn' | 'continuous' | 'returnable';
    description?: string;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Derive token symbol from identifier (same logic as UI's getTokenSymbol)
 */
function deriveSymbol(identifier: string): string {
    if (!identifier) return '$TOKEN';
    const raw = identifier.replace(/[@\.]/g, '_').split('/')[0].toUpperCase().slice(0, 10);
    return `$${raw}`;
}

/**
 * Validate BSV address (P2PKH: starts with '1', base58check, 25-34 chars)
 */
function isValidBsvAddress(address: string): boolean {
    return /^1[a-km-zA-HJ-NP-Z1-9]{24,33}$/.test(address);
}

/**
 * Get the node's BSV wallet for minting.
 * Checks: PATHD_WALLET_KEY env → ~/.pathd/config.json → auto-generate.
 */
let mintWallet: BSVWallet | null = null;

function getMintWallet(): BSVWallet {
    if (mintWallet) return mintWallet;

    const config = new Config();

    if (config.walletKey) {
        mintWallet = new BSVWallet(config.walletKey);
    } else {
        throw new Error(
            'No wallet key found. Visit /wallet to set up your node wallet first.'
        );
    }

    return mintWallet;
}

// ── Route Handler ─────────────────────────────────────────────────

/**
 * POST /api/mint
 *
 * Accepts MintFormData from the mint page UI.
 * Builds a BSV-21 inscription, broadcasts to BSV, indexes locally.
 *
 * Requires PATHD_WIF env var with a funded BSV private key.
 */
export async function POST(request: NextRequest) {
    try {
        const body: MintFormData = await request.json();

        // ── Validate required fields ──────────────────────────────
        if (!body.identifier || !body.paymentAddress) {
            return NextResponse.json(
                { error: 'Missing required fields: identifier and paymentAddress' },
                { status: 400 }
            );
        }

        // ── Derive and validate symbol ────────────────────────────
        const symbol = deriveSymbol(body.identifier);
        const validation = validateSymbol(symbol);
        if (!validation.valid) {
            return NextResponse.json(
                { error: `Invalid token symbol "${symbol}": ${validation.error}` },
                { status: 400 }
            );
        }

        // ── Validate payment address ──────────────────────────────
        if (!isValidBsvAddress(body.paymentAddress)) {
            return NextResponse.json(
                { error: 'Invalid BSV address. Must be a P2PKH address starting with 1.' },
                { status: 400 }
            );
        }

        // ── Validate numeric fields ──────────────────────────────
        const dividendRate = body.dividendRate ?? 0;
        if (dividendRate < 0 || dividendRate > 100) {
            return NextResponse.json(
                { error: 'Dividend rate must be between 0 and 100' },
                { status: 400 }
            );
        }

        const supply = body.supply || '1000000000';
        if (BigInt(supply) <= BigInt(0)) {
            return NextResponse.json(
                { error: 'Supply must be greater than 0' },
                { status: 400 }
            );
        }

        const accessRate = body.accessRate || DEFAULT_ACCESS_RATE;

        // ── Get server wallet ─────────────────────────────────────
        const wallet = getMintWallet();
        await wallet.connect();

        const issuerAddress = await wallet.getAddress();
        const issuerPubkey = wallet.getPublicKeyString();

        // ── Build BSV-21 inscription JSON ─────────────────────────
        const inscription = {
            p: 'bsv-21',
            op: 'deploy+mint',
            amt: supply,
            sym: symbol,
            path402: {
                paymentAddress: body.paymentAddress,
                issuerPubkey,
                dividendRate,
                type: body.type,
                accessRate,
                timeUnit: body.timeUnit || 'seconds',
                accessMode: body.accessMode || 'burn',
                protocol: 'path402',
                version: '3.0.0',
            },
            metadata: {
                description: body.description || `Access token for ${body.identifier}`,
                identifier: body.identifier,
            },
        };

        // ── Broadcast ordinals inscription to BSV ─────────────────
        const txid = await wallet.inscribeContent(
            Buffer.from(JSON.stringify(inscription)),
            'application/bsv-20'
        );

        const tokenId = `${txid}_0`;

        // ── Index in local pathd database (best-effort) ───────────
        try {
            const { upsertToken } = await import('@b0ase/path402-core/db');
            upsertToken({
                token_id: tokenId,
                name: symbol,
                description: body.description || `Access token for ${body.identifier}`,
                issuer_address: issuerAddress,
                content_type: body.type,
                verification_status: 'verified',
                discovered_via: 'self-mint',
            });
        } catch {
            // SQLite not available (e.g. Vercel serverless) — skip indexing
            console.log('[Mint] Local DB indexing skipped');
        }

        return NextResponse.json({
            success: true,
            txid,
            tokenId,
            symbol,
            inscription,
            issuerAddress,
        });
    } catch (error: any) {
        console.error('[Mint] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to mint token' },
            { status: 500 }
        );
    }
}
