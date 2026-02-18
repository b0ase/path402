/**
 * $402 Project Manifest Schema
 *
 * Defines the `$402.json` file that sits at the root of any project
 * that wants to be publishable on-chain via the $402 protocol.
 *
 * Inspired by repo-tokeniser's token.json but simplified for
 * the sovereign publisher workflow.
 */

import { z } from 'zod';

// ── Schema ──────────────────────────────────────────────────────────

export const ProjectManifestSchema = z.object({
    /** Manifest schema version */
    version: z.string().default('1.0'),

    /** Token symbol, e.g., "$KWEGWONG" */
    symbol: z.string().regex(/^\$[A-Z0-9_]{1,20}$/, 'Symbol must be $UPPERCASE (1-20 chars)'),

    /** Dollar-address path, e.g., "/$kwegwong" */
    path: z.string().startsWith('/'),

    /** Human-readable description */
    description: z.string(),

    /** $401 identity reference, e.g., "/$richard" */
    identity: z.string().optional(),

    /** Pricing model */
    pricing: z.enum(['sqrt_decay', 'flat', 'linear']).default('alice_bond'),

    /** Base price in satoshis */
    basePrice: z.number().int().positive().default(100),

    /** Total token supply */
    supply: z.number().int().positive().default(1_000_000_000),

    /** $403 permission rules */
    permissions: z.object({
        rules: z.array(z.string()).default([]),
    }).optional(),

    /** Glob patterns to exclude from content hashing */
    exclude: z.array(z.string()).default([
        'node_modules',
        '.git',
        '.next',
        'dist',
        'build',
        '.env*',
        '*.log',
    ]),

    /** Issuer BSV address (populated at publish time if not provided) */
    issuerAddress: z.string().optional(),

    /** Optional metadata */
    metadata: z.object({
        website: z.string().url().optional(),
        avatar: z.string().optional(),
        license: z.string().optional(),
        repository: z.string().url().optional(),
    }).optional(),
});

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Load and validate a $402.json manifest from a JSON string
 */
export function parseManifest(json: string): ProjectManifest {
    const data = JSON.parse(json);
    return ProjectManifestSchema.parse(data);
}

/**
 * Create a manifest from CLI flags (when no $402.json exists)
 */
export function createManifestFromFlags(flags: {
    symbol: string;
    path: string;
    description?: string;
    identity?: string;
    pricing?: 'sqrt_decay' | 'flat' | 'linear';
    basePrice?: number;
    supply?: number;
    issuerAddress?: string;
}): ProjectManifest {
    return ProjectManifestSchema.parse({
        version: '1.0',
        symbol: flags.symbol,
        path: flags.path,
        description: flags.description || `On-chain publication of ${flags.symbol}`,
        identity: flags.identity,
        pricing: flags.pricing,
        basePrice: flags.basePrice,
        supply: flags.supply,
        issuerAddress: flags.issuerAddress,
    });
}

/**
 * Generate a template $402.json for a project
 */
export function generateManifestTemplate(symbol: string, path: string): string {
    const template: Record<string, unknown> = {
        version: '1.0',
        symbol,
        path,
        description: `On-chain publication of ${symbol}`,
        pricing: 'alice_bond',
        basePrice: 100,
        supply: 1_000_000_000,
        exclude: [
            'node_modules',
            '.git',
            '.next',
            'dist',
            'build',
            '.env*',
            '*.log',
        ],
        metadata: {
            license: 'MIT',
        },
    };

    return JSON.stringify(template, null, 2);
}
