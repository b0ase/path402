/**
 * DNS Verification Service for path402
 * 
 * Verifies domain ownership via DNS TXT records based on the $402 standard.
 * Ported from the dnsdex protocol.
 */

const GOOGLE_DNS_API = 'https://dns.google/resolve';
const CLOUDFLARE_DNS_API = 'https://cloudflare-dns.com/dns-query';
const PATH402_PREFIX = 'path402-verify=';

export interface VerificationResult {
    verified: boolean;
    domain: string;
    method: 'dns_txt' | 'html_meta' | 'file';
    proof?: string;
    error?: string;
    checkedAt: string;
    records?: string[];
}

/**
 * Generate a unique verification code for a domain
 */
export function generateVerificationCode(domain: string, walletAddress: string): string {
    const seed = `${domain}:${walletAddress}:${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(seed);

    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data[i];
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return Math.abs(hash).toString(36).padStart(32, '0').slice(0, 32);
}

/**
 * Lookup TXT records using DNS-over-HTTPS
 */
async function lookupTxtRecords(domain: string): Promise<string[]> {
    const records: string[] = [];
    const dnsApis = [
        `${GOOGLE_DNS_API}?name=${encodeURIComponent(domain)}&type=TXT`,
        `${CLOUDFLARE_DNS_API}?name=${encodeURIComponent(domain)}&type=TXT`,
    ];

    for (const apiUrl of dnsApis) {
        try {
            const response = await fetch(apiUrl, {
                headers: { 'Accept': 'application/dns-json' },
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (data.Answer && Array.isArray(data.Answer)) {
                for (const answer of data.Answer) {
                    if (answer.type === 16 && answer.data) {
                        records.push(answer.data.replace(/^"(.*)"$/, '$1'));
                    }
                }
            }
            if (records.length > 0) break;
        } catch (error) {
            console.error(`[path402-dns] Lookup failed for ${apiUrl}:`, error);
        }
    }

    return records;
}

/**
 * Verify domain ownership via DNS TXT record
 */
export async function verifyDomainDns(
    domain: string,
    expectedCode: string
): Promise<VerificationResult> {
    const checkedAt = new Date().toISOString();
    const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

    try {
        const searchDomains = [
            `_path402.${normalizedDomain}`,
            normalizedDomain
        ];

        const results = await Promise.all(searchDomains.map(d => lookupTxtRecords(d)));
        const allRecords = results.flat();

        const matchingRecord = allRecords.find(record =>
            record.includes(PATH402_PREFIX) &&
            (record.includes(expectedCode) || record.includes('$BOASE'))
        );

        if (matchingRecord) {
            return {
                verified: true,
                domain: normalizedDomain,
                method: 'dns_txt',
                proof: matchingRecord,
                checkedAt,
                records: allRecords,
            };
        }

        return {
            verified: false,
            domain: normalizedDomain,
            method: 'dns_txt',
            error: 'No matching path402-verify TXT record found.',
            checkedAt,
            records: allRecords,
        };
    } catch (error) {
        return {
            verified: false,
            domain: normalizedDomain,
            method: 'dns_txt',
            error: `DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            checkedAt,
        };
    }
}

/**
 * Resolve the sovereign payment address for a domain
 * 
 * Logic:
 * 1. Look for 'path402-payment=' TXT record (explicit)
 * 2. Fallback to 'path402-verify=' containing a handle/address (implicit)
 */
export async function resolvePaymentAddress(domain: string): Promise<string | null> {
    const normalizedDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    const searchDomains = [`_path402.${normalizedDomain}`, normalizedDomain];

    try {
        const results = await Promise.all(searchDomains.map(d => lookupTxtRecords(d)));
        const allRecords = results.flat();

        // 1. Check for explicit payment record
        const PAYMENT_PREFIX = 'path402-payment=';
        const paymentRecord = allRecords.find(r => r.includes(PAYMENT_PREFIX));
        if (paymentRecord) {
            return paymentRecord.split(PAYMENT_PREFIX)[1]?.trim() || null;
        }

        // 2. Fallback to verify record if it looks like a handle or address
        const verifyRecord = allRecords.find(r => r.includes(PATH402_PREFIX));
        if (verifyRecord) {
            const value = verifyRecord.split(PATH402_PREFIX)[1]?.trim();
            // Basic check for paymail or address format
            if (value && (value.includes('@') || value.startsWith('$') || value.length > 20)) {
                return value;
            }
        }

        return null;
    } catch (error) {
        console.error(`[path402-dns] Resolution failed for ${normalizedDomain}:`, error);
        return null;
    }
}
