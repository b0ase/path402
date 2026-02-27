/**
 * $401 Identity Service — Fetch and cache identity strands from path402.com
 *
 * Syncs $401 identity data from the public API and caches it in local SQLite.
 * Falls back to cached data if the API is unreachable.
 */

import {
  upsertIdentity401Strand,
  getIdentity401Strands,
  getIdentity401StrandCount,
  clearIdentity401Cache,
  type Identity401Strand,
} from '../db/index.js';

// Inline strength types — avoids cross-package dependency on @b0ase/path402-types
// Canonical source: path401-com/lib/strand-strength.ts
type StrengthLevel = 'none' | 'basic' | 'verified' | 'strong' | 'sovereign';

interface StrengthScore {
  score: number;
  level: StrengthLevel;
  levelNumber: number;
  label: string;
  strandTypes: string[];
}

const STRAND_POINTS: Record<string, number> = {
  'TLDRAW': 1, 'CAMERA': 1, 'VIDEO': 2, 'DOCUMENT': 1, 'SEALED_DOCUMENT': 2,
  'oauth/github': 2, 'oauth/google': 2, 'oauth/twitter': 1, 'oauth/discord': 1,
  'oauth/linkedin': 2, 'oauth/microsoft': 1, 'oauth/handcash': 2,
  'registered_signature': 3, 'profile_photo': 1,
  'id_document/passport': 5, 'id_document/driving_licence': 5, 'id_document/proof_of_address': 5,
  'self_attestation': 3, 'paid_signing': 3, 'peer_attestation/cosign': 5, 'ip_thread': 2, 'kyc/veriff': 10,
};

function calculateStrength(strands: Array<{ provider: string; strand_type?: string; strand_subtype?: string | null }>): StrengthScore {
  if (strands.length === 0) return { score: 0, level: 'none', levelNumber: 0, label: 'None', strandTypes: [] };
  let score = 0;
  const types: string[] = [];
  for (const s of strands) {
    const key = s.strand_type && s.strand_type !== 'oauth'
      ? (s.strand_subtype ? `${s.strand_type}/${s.strand_subtype}` : s.strand_type)
      : `oauth/${s.provider}`;
    types.push(key);
    score += STRAND_POINTS[key] || 1;
  }
  if (types.some(t => t.startsWith('kyc/'))) return { score, level: 'sovereign', levelNumber: 4, label: 'Sovereign', strandTypes: types };
  if (types.includes('paid_signing') || types.some(t => t.startsWith('peer_attestation/'))) return { score, level: 'strong', levelNumber: 3, label: 'Strong', strandTypes: types };
  if (types.some(t => t.startsWith('id_document/') || t === 'CAMERA' || t === 'VIDEO') || types.includes('self_attestation')) return { score, level: 'verified', levelNumber: 2, label: 'Verified', strandTypes: types };
  return { score, level: 'basic', levelNumber: 1, label: 'Basic', strandTypes: types };
}

const IDENTITY_API_BASE = process.env.IDENTITY_API_URL || 'https://path402.com';

interface Identity401Response {
  handle: string;
  identity: {
    symbol: string;
    tokenId: string;
    broadcastStatus: string;
  } | null;
  strength: {
    level: string;
    levelNumber: number;
    label: string;
    score: number;
  };
  strandCount: number;
  strands: Array<{
    provider: string;
    strandType: string;
    strandSubtype: string | null;
    label: string | null;
    source: string;
    onChain: boolean;
  }>;
}

export interface CachedIdentity401 {
  strands: Identity401Strand[];
  strandCount: number;
  strength: StrengthScore;
  cachedAt: number | null;
}

/**
 * Sync $401 identity strands from path402.com public API.
 * Caches results locally for offline access.
 */
export async function syncIdentity401(handle: string): Promise<CachedIdentity401> {
  try {
    const res = await fetch(`${IDENTITY_API_BASE}/api/identity/${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Identity401] API returned ${res.status} for handle: ${handle}`);
      return getCachedIdentity401(handle);
    }

    const data: Identity401Response = await res.json();

    if (!data.identity) {
      return {
        strands: [],
        strandCount: 0,
        strength: { score: 0, level: 'none', levelNumber: 0, label: 'None', strandTypes: [] },
        cachedAt: null,
      };
    }

    // Clear old cache and write fresh strands
    clearIdentity401Cache(data.identity.tokenId);

    for (const s of data.strands) {
      upsertIdentity401Strand({
        identity_token_id: data.identity.tokenId,
        provider: s.provider,
        strand_type: s.strandType,
        strand_subtype: s.strandSubtype,
        label: s.label,
        source: s.source,
        on_chain: s.onChain,
        broadcast_status: data.identity.broadcastStatus,
      });
    }

    const cachedStrands = getIdentity401Strands(data.identity.tokenId);
    const strength = calculateStrength(cachedStrands.map(s => ({
      provider: s.provider,
      strand_type: s.strand_type,
      strand_subtype: s.strand_subtype,
    })));

    return {
      strands: cachedStrands,
      strandCount: cachedStrands.length,
      strength,
      cachedAt: Math.floor(Date.now() / 1000),
    };
  } catch (err) {
    console.warn(`[Identity401] Sync failed for ${handle}, using cache:`, err);
    return getCachedIdentity401(handle);
  }
}

/**
 * Get cached $401 identity data with live strength calculation.
 * Returns empty result if no cache exists.
 */
export function getCachedIdentity401(identityTokenId: string): CachedIdentity401 {
  const strands = getIdentity401Strands(identityTokenId);

  if (strands.length === 0) {
    return {
      strands: [],
      strandCount: 0,
      strength: { score: 0, level: 'none', levelNumber: 0, label: 'None', strandTypes: [] },
      cachedAt: null,
    };
  }

  const strength = calculateStrength(strands.map(s => ({
    provider: s.provider,
    strand_type: s.strand_type,
    strand_subtype: s.strand_subtype,
  })));

  const cachedAt = strands.length > 0 ? strands[0].fetched_at : null;

  return {
    strands,
    strandCount: strands.length,
    strength,
    cachedAt,
  };
}
