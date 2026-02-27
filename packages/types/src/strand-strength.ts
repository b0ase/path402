// Strand strength scoring per $401 spec — type-gated, not count-gated
// Levels: Lv.1 Basic (OAuth) → Lv.2 Verified → Lv.3 Strong → Lv.4 Sovereign

export type StrengthLevel = 'none' | 'basic' | 'verified' | 'strong' | 'sovereign';

export interface StrengthScore {
  score: number;
  level: StrengthLevel;
  levelNumber: number;
  label: string;
  strandTypes: string[];
}

// Point values per strand type (matches bit-sign identity-strands.ts)
export const STRAND_POINTS: Record<string, number> = {
  'TLDRAW': 1,
  'CAMERA': 1,
  'VIDEO': 2,
  'DOCUMENT': 1,
  'SEALED_DOCUMENT': 2,
  'oauth/github': 2,
  'oauth/google': 2,
  'oauth/twitter': 1,
  'oauth/discord': 1,
  'oauth/linkedin': 2,
  'oauth/microsoft': 1,
  'oauth/handcash': 2,
  'registered_signature': 3,
  'profile_photo': 1,
  'id_document/passport': 5,
  'id_document/driving_licence': 5,
  'id_document/proof_of_address': 5,
  'self_attestation': 3,
  'paid_signing': 3,
  'peer_attestation/cosign': 5,
  'ip_thread': 2,
  'kyc/veriff': 10,
};

function strandKey(type: string, subtype?: string | null): string {
  if (subtype) return `${type}/${subtype}`;
  return type;
}

function mapProviderToKey(provider: string, strandType?: string, strandSubtype?: string | null): string {
  if (strandType && strandType !== 'oauth') {
    return strandKey(strandType, strandSubtype);
  }
  return `oauth/${provider}`;
}

export function calculateStrength(strands: Array<{
  provider: string;
  strand_type?: string;
  strand_subtype?: string | null;
}>): StrengthScore {
  if (strands.length === 0) {
    return { score: 0, level: 'none', levelNumber: 0, label: 'None', strandTypes: [] };
  }

  let score = 0;
  const types: string[] = [];

  for (const s of strands) {
    const key = mapProviderToKey(s.provider, s.strand_type, s.strand_subtype);
    types.push(key);
    score += STRAND_POINTS[key] || 1;
  }

  const hasKyc = types.some(t => t.startsWith('kyc/'));
  const hasPeerAttestation = types.some(t => t.startsWith('peer_attestation/'));
  const hasPaidSigning = types.includes('paid_signing');
  const hasIdDocs = types.some(t =>
    t.startsWith('id_document/') || t === 'CAMERA' || t === 'VIDEO'
  );
  const hasSelfAttestation = types.includes('self_attestation');

  if (hasKyc) {
    return { score, level: 'sovereign', levelNumber: 4, label: 'Sovereign', strandTypes: types };
  }
  if (hasPaidSigning || hasPeerAttestation) {
    return { score, level: 'strong', levelNumber: 3, label: 'Strong', strandTypes: types };
  }
  if (hasIdDocs || hasSelfAttestation) {
    return { score, level: 'verified', levelNumber: 2, label: 'Verified', strandTypes: types };
  }
  return { score, level: 'basic', levelNumber: 1, label: 'Basic', strandTypes: types };
}
