/**
 * $402 Sovereign Publisher
 *
 * Consolidates 8+ scattered inscription scripts into a single
 * unified publishing flow:
 *
 *   Hash directory → Generate BSV21 inscription → Preview/Broadcast
 *
 * Usage:
 *   import { publishProject } from '@b0ase/path402-core/publish';
 *   const result = await publishProject({ dir: '.', dryRun: true });
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import {
    ProjectManifestSchema,
    parseManifest,
    createManifestFromFlags,
    generateManifestTemplate,
    type ProjectManifest,
} from './manifest.js';
import {
    prepareMint,
    generateTokenId,
    generateBSV21Inscription,
    validateSymbol,
    DEFAULT_SUPPLY,
} from '../token/mint.js';

// ── Types ───────────────────────────────────────────────────────────

export interface PublishOptions {
    /** Project directory (default: cwd) */
    dir?: string;

    /** Explicit manifest overrides (used when no $402.json exists) */
    symbol?: string;
    path?: string;
    description?: string;
    identity?: string;
    pricing?: 'sqrt_decay' | 'flat' | 'linear';
    basePrice?: number;
    supply?: number;

    /** BSV issuer address for signing */
    issuerAddress?: string;

    /** If true, preview only — do not broadcast */
    dryRun?: boolean;

    /** Custom exclude patterns (merged with manifest defaults) */
    exclude?: string[];
}

export interface FileEntry {
    /** Relative path from project root */
    path: string;
    /** SHA-256 hash of file content */
    hash: string;
    /** File size in bytes */
    size: number;
}

export interface PublishResult {
    /** Whether this was a dry run */
    dryRun: boolean;

    /** The resolved project manifest */
    manifest: ProjectManifest;

    /** SHA-256 Merkle root of all project files */
    contentHash: string;

    /** Total files hashed */
    fileCount: number;

    /** Total bytes hashed */
    totalBytes: number;

    /** Individual file entries */
    files: FileEntry[];

    /** Deterministic token ID */
    tokenId: string;

    /** BSV21 inscription JSON (ready to broadcast) */
    inscription: string;

    /** Genesis inscription with content hash extension */
    genesisData: Record<string, unknown>;
}

// ── Glob Matching (simple) ──────────────────────────────────────────

function matchesPattern(filepath: string, pattern: string): boolean {
    // Handle exact directory names (e.g., "node_modules", ".git")
    const parts = filepath.split('/');
    if (parts.some((p) => p === pattern)) return true;

    // Handle extension globs (e.g., "*.log")
    if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1); // e.g., ".log"
        return filepath.endsWith(ext);
    }

    // Handle prefix globs (e.g., ".env*")
    if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return parts.some((p) => p.startsWith(prefix));
    }

    return filepath === pattern;
}

function isExcluded(filepath: string, excludes: string[]): boolean {
    return excludes.some((pattern) => matchesPattern(filepath, pattern));
}

// ── Directory Hashing ───────────────────────────────────────────────

/**
 * Walk a directory tree and hash all files, returning sorted file entries.
 * Excludes files matching the provided patterns.
 */
function walkAndHash(dir: string, rootDir: string, excludes: string[]): FileEntry[] {
    const entries: FileEntry[] = [];

    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = join(dir, item.name);
        const relativePath = relative(rootDir, fullPath);

        if (isExcluded(relativePath, excludes)) continue;

        if (item.isDirectory()) {
            entries.push(...walkAndHash(fullPath, rootDir, excludes));
        } else if (item.isFile()) {
            const content = readFileSync(fullPath);
            const hash = createHash('sha256').update(content).digest('hex');
            entries.push({
                path: relativePath,
                hash,
                size: content.length,
            });
        }
    }

    return entries;
}

/**
 * Compute a Merkle root from sorted file hashes.
 * Deterministic: same files → same root, regardless of OS.
 */
function computeMerkleRoot(files: FileEntry[]): string {
    // Sort by path for determinism
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

    if (sorted.length === 0) {
        return createHash('sha256').update('empty').digest('hex');
    }

    // Concatenate all "path:hash" pairs and hash the result
    const combined = sorted.map((f) => `${f.path}:${f.hash}`).join('\n');
    return createHash('sha256').update(combined).digest('hex');
}

// ── Main Publisher ──────────────────────────────────────────────────

/**
 * Publish a project directory as a $402 token.
 *
 * 1. Load or generate a $402.json manifest
 * 2. Walk the directory and hash all files
 * 3. Compute a Merkle root (content hash)
 * 4. Generate a BSV21 inscription linking the token to the content
 * 5. Return everything needed to broadcast (or preview in dry-run)
 */
export async function publishProject(opts: PublishOptions): Promise<PublishResult> {
    const dir = opts.dir || process.cwd();
    const dryRun = opts.dryRun ?? true; // Default to dry-run for safety

    // ── Step 1: Load or create manifest ──────────────────────────────

    let manifest: ProjectManifest;
    const manifestPath = join(dir, '$402.json');

    if (existsSync(manifestPath)) {
        const raw = readFileSync(manifestPath, 'utf-8');
        manifest = parseManifest(raw);
        console.log(`[publish] Loaded $402.json from ${manifestPath}`);
    } else if (opts.symbol && opts.path) {
        manifest = createManifestFromFlags({
            symbol: opts.symbol,
            path: opts.path,
            description: opts.description,
            identity: opts.identity,
            pricing: opts.pricing,
            basePrice: opts.basePrice,
            supply: opts.supply,
            issuerAddress: opts.issuerAddress,
        });
        console.log(`[publish] No $402.json found — using CLI flags`);
    } else {
        throw new Error(
            `No $402.json found in ${dir} and --symbol/--path not provided.\n` +
            `Run with --init to generate a template, or provide --symbol and --path flags.`
        );
    }

    // Apply issuer address override
    if (opts.issuerAddress) {
        manifest.issuerAddress = opts.issuerAddress;
    }

    // ── Step 2: Validate symbol ──────────────────────────────────────

    const validation = validateSymbol(manifest.symbol);
    if (!validation.valid) {
        throw new Error(`Invalid symbol "${manifest.symbol}": ${validation.error}`);
    }

    // ── Step 3: Hash project files ───────────────────────────────────

    const excludes = [
        ...manifest.exclude,
        ...(opts.exclude || []),
        '$402.json', // Don't hash the manifest itself
    ];

    console.log(`[publish] Hashing ${dir} (excluding: ${excludes.join(', ')})`);
    const files = walkAndHash(dir, dir, excludes);
    const contentHash = computeMerkleRoot(files);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    console.log(`[publish] ${files.length} files, ${(totalBytes / 1024).toFixed(1)}KB, hash: ${contentHash.slice(0, 16)}...`);

    // ── Step 4: Generate BSV21 inscription ───────────────────────────

    const issuerAddress = manifest.issuerAddress || 'UNSIGNED';
    const tokenId = generateTokenId(manifest.symbol, issuerAddress);

    const mintResult = prepareMint({
        symbol: manifest.symbol,
        issuerAddress,
        description: manifest.description,
        accessRate: 1,
        website: manifest.metadata?.website,
    });

    if (!mintResult.success) {
        throw new Error(`Mint preparation failed: ${mintResult.error}`);
    }

    // Extend the standard BSV21 inscription with content hash + path402 publish data
    const baseInscription = JSON.parse(mintResult.inscription!);
    const genesisData = {
        ...baseInscription,
        path402: {
            ...baseInscription.path402,
            publish: {
                contentHash,
                path: manifest.path,
                fileCount: files.length,
                totalBytes,
                pricing: manifest.pricing,
                basePrice: manifest.basePrice,
                identity: manifest.identity,
                permissions: manifest.permissions,
                publishedAt: new Date().toISOString(),
            },
        },
    };

    const inscription = JSON.stringify(genesisData);

    // ── Step 5: Summary ──────────────────────────────────────────────

    if (dryRun) {
        console.log(`\n[publish] DRY RUN — No transaction broadcast`);
        console.log(`[publish] Token: ${manifest.symbol}`);
        console.log(`[publish] Path: ${manifest.path}`);
        console.log(`[publish] Token ID: ${tokenId}`);
        console.log(`[publish] Content Hash: ${contentHash}`);
        console.log(`[publish] Inscription size: ${inscription.length} bytes`);
    }

    return {
        dryRun,
        manifest,
        contentHash,
        fileCount: files.length,
        totalBytes,
        files,
        tokenId,
        inscription,
        genesisData,
    };
}

/**
 * Initialize a $402.json template in a directory
 */
export function initManifest(dir: string, symbol: string, path: string): string {
    const manifestPath = join(dir, '$402.json');

    if (existsSync(manifestPath)) {
        throw new Error(`$402.json already exists at ${manifestPath}`);
    }

    const template = generateManifestTemplate(symbol, path);
    return template;
}
