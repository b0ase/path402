/**
 * Demo Content Loader
 *
 * First-run loader that imports bundled demo videos into the ContentStore
 * and creates corresponding token/holding entries so they appear in the Library.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ContentStore } from './store.js';
import { DEMO_MANIFEST } from './demo-manifest.js';
import { upsertToken, upsertHolding, getContentByToken } from '../db/index.js';

const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

/**
 * Find the demo-content directory.
 * Searches multiple locations to support dev, packaged Electron, and CLI usage.
 */
function findDemoDir(): string | null {
  const candidates = [
    // Dev: relative to src/content/
    join(_dirname, '..', '..', 'demo-content'),
    // Built: relative to dist/content/
    join(_dirname, '..', '..', 'demo-content'),
    // Electron packaged: resources/demo-content
    join((process as any).resourcesPath || '', 'demo-content'),
    // Monorepo root relative
    join(_dirname, '..', '..', '..', 'demo-content'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, DEMO_MANIFEST[0].filename))) {
      return dir;
    }
  }
  return null;
}

/**
 * Load demo content into the content store.
 * Skips items that already exist in the DB.
 * Returns number of items loaded.
 */
export async function loadDemoContent(store: ContentStore): Promise<number> {
  const demoDir = findDemoDir();
  if (!demoDir) {
    console.log('[DemoLoader] Demo content directory not found, skipping');
    return 0;
  }

  let loaded = 0;

  for (const item of DEMO_MANIFEST) {
    // Skip if already in DB
    const existing = getContentByToken(item.tokenId);
    if (existing) continue;

    const filePath = join(demoDir, item.filename);
    if (!existsSync(filePath)) {
      console.warn(`[DemoLoader] Missing file: ${item.filename}`);
      continue;
    }

    console.log(`[DemoLoader] Importing ${item.name}...`);

    // Read file and store
    const data = readFileSync(filePath);
    await store.put(item.tokenId, data, item.contentType, 0);

    // Create token entry
    upsertToken({
      token_id: item.tokenId,
      name: item.name,
      description: `Demo content: ${item.name}`,
      content_type: item.contentType,
      base_price_sats: 500,
      pricing_model: 'fixed',
      current_supply: 1,
      verification_status: 'verified',
      discovered_via: 'demo'
    });

    // Create holding entry (we "own" demo content)
    upsertHolding(item.tokenId, 1, 0, false);

    loaded++;
  }

  if (loaded > 0) {
    console.log(`[DemoLoader] Loaded ${loaded} demo items`);
  }

  return loaded;
}
