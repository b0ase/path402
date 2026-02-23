import { NextResponse } from 'next/server';
import { BSVWallet } from '@b0ase/path402-core/wallet';
import { Config } from '@b0ase/path402-core';

// ── Singleton ─────────────────────────────────────────────────────

let nodeWallet: BSVWallet | null = null;
let nodeConfig: InstanceType<typeof Config> | null = null;

/**
 * Get or create the node's BSV wallet.
 *
 * Priority:
 *   1. PATHD_WALLET_KEY env var
 *   2. walletKey in ~/.pathd/config.json
 *   3. Auto-generate a fresh key and save it
 */
function getOrCreateNodeWallet(): { wallet: BSVWallet; isNew: boolean } {
    if (nodeWallet) return { wallet: nodeWallet, isNew: false };

    // Load config (reads env vars + ~/.pathd/config.json)
    nodeConfig = new Config();
    let isNew = false;

    if (nodeConfig.walletKey) {
        // Existing key found
        nodeWallet = new BSVWallet(nodeConfig.walletKey);
    } else {
        // No key anywhere — generate a fresh one
        nodeWallet = new BSVWallet();
        const generated = nodeWallet.generateKey();
        // Save to config file so it persists across restarts
        generated.then(({ privateKey }) => {
            nodeConfig!.walletKey = privateKey;
            try { nodeConfig!.save(); } catch { /* Vercel: no filesystem */ }
        });
        isNew = true;
    }

    return { wallet: nodeWallet, isNew };
}

// ── GET /api/wallet/node ──────────────────────────────────────────

/**
 * Returns the node's BSV address, balance, and funded status.
 * Auto-generates a key on first call if none exists.
 * NEVER exposes the private key.
 */
export async function GET() {
    try {
        const { wallet, isNew } = getOrCreateNodeWallet();
        await wallet.connect();

        const address = await wallet.getAddress();

        // Fetch balance from WhatsOnChain
        let balanceSats = 0;
        try {
            const balanceData = await wallet.getBalance();
            balanceSats = Number(balanceData.native.amount);
        } catch {
            // Network error — report 0
        }

        const funded = balanceSats > 0;

        return NextResponse.json({
            address,
            balanceSats,
            balanceBsv: (balanceSats / 100_000_000).toFixed(8),
            funded,
            isNew,
            qrData: address, // Client renders this as QR
        });
    } catch (error: any) {
        console.error('[Wallet/Node] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get node wallet' },
            { status: 500 }
        );
    }
}
