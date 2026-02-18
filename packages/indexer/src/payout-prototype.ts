
/**
 * Path402 Indexer Prototype: Payout Distribution
 * 
 * Objectives:
 * 1. Fetch token holders from 1sat/GorillaPool API.
 * 2. Calculate pro-rata dividend shares.
 * 3. Output a payment plan (JSON).
 */

const BASE_URL = 'https://ordinals.gorillapool.io/api';

export interface Holder {
    address: string;
    balance: number;
}

export interface PayoutPlan {
    token: string;
    totalDividend: number;
    recipients: {
        address: string;
        amount: number;
        percentage: number;
    }[];
}

/**
 * Fetch holders for a BSV21 ticker
 */
async function fetchHolders(ticker: string): Promise<Holder[]> {
    const cleanTicker = ticker.startsWith('$') ? ticker.slice(1) : ticker;
    console.log(`\n--- Fetching data for ${cleanTicker} ---`);

    try {
        // 1. Fetch Ticker Info first (Optional context)
        const infoUrl = `${BASE_URL}/market/tickers/${cleanTicker}`;
        await fetch(infoUrl).catch(() => { }); // Fire and forget logging

        // 2. Fetch Holders
        // Verified Endpoint: /bsv20/tick/{ticker}/holders
        const url = `${BASE_URL}/bsv20/tick/${cleanTicker}/holders`;
        console.log(`Querying Holders: ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            console.log(`✅ Success! Found ${data.length} holders.`);
            return data.map((h: any) => ({
                address: h.address,
                balance: parseInt(h.amt, 10) // Parse 'amt' string to integer
            }));
        } else {
            console.error("Unexpected API response structure.");
            return [];
        }
    } catch (error) {
        console.error("Fetch error:", error);
        return [];
    }
}

/**
 * Calculate Dividends
 */
export function calculatePayouts(token: string, totalDividendSatoshis: number, holders: Holder[]): PayoutPlan {
    const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);

    if (totalSupply === 0) {
        return { token, totalDividend: totalDividendSatoshis, recipients: [] };
    }

    const recipients = holders.map(h => {
        const share = h.balance / totalSupply;
        const amount = Math.floor(totalDividendSatoshis * share);
        return {
            address: h.address,
            amount: amount,
            percentage: share * 100
        };
    }).filter(r => r.amount > 0);

    return {
        token,
        totalDividend: totalDividendSatoshis,
        recipients
    };
}

// === MAIN EXECUTION ===
async function main() {
    const TEST_TICKER = 'HODL'; // Verified existing token
    const DIVIDEND_AMOUNT = 10000;

    console.log("Starting Payout Prototype...");

    const holders = await fetchHolders(TEST_TICKER);

    if (holders.length > 0) {
        const plan = calculatePayouts(TEST_TICKER, DIVIDEND_AMOUNT, holders);

        console.log("\n=== PAYOUT PLAN (First 5 Recipients) ===");
        console.log(JSON.stringify(plan.recipients.slice(0, 5), null, 2));
        console.log(`... and ${plan.recipients.length - 5} more.`);
    } else {
        console.error("Failed to find holders.");
    }
}

main().catch(console.error);
