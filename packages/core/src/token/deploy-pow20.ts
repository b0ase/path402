/**
 * Deploy $402 PoW20 Token
 * 
 * This script creates the "Genesis" of the Path402 Indexer Economy.
 * It broadcasts a single BRC-20 style enrollment transaction that defines the rules.
 * 
 * TOKEN RULES:
 * - Ticker: 402
 * - Max Supply: 21,000,000
 * - Mint Limit: 1,000 per block
 * - Protocol: pow-20 (Requires SHA256^2 work)
 */

import { generateBSV21Inscription } from './mint.js'; // Re-using inscription logic
// Note: real broadcasting would happen via wallet manager

export interface PoW20Deploy {
    p: "pow-20";
    op: "deploy";
    tick: string;
    max: string;
    lim: string;
    diff: string; // Difficulty (number of leading zeros)
    work: "sha256";
}

export const PATH402_POW_CONFIG: PoW20Deploy = {
    p: "pow-20",
    op: "deploy",
    tick: "402",
    max: "21000000",
    lim: "1000",
    diff: "5",     // Start with 5 leading zeros (adjustable)
    work: "sha256"
};

export function getDeploymentInscription() {
    const data = JSON.stringify(PATH402_POW_CONFIG);
    return {
        contentType: "application/json",
        content: data
    };
}

// In a real run, this would be:
// 1. Build Tx with this JSON inscription
// 2. Broadcast to network
// 3. The txid becomes the Token ID
console.log("To deploy, inscribe this JSON: ", JSON.stringify(PATH402_POW_CONFIG, null, 2));
