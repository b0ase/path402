import { Path402HTM } from '../../packages/htm/src/contracts/htm'
import { bsv, TestWallet, toByteString, DefaultProvider } from 'scrypt-ts'

/**
 * PRODUCTION DEPLOYMENT: $402 Hash-to-Mint Token
 *
 * This deploys the REAL $402 token to BSV mainnet.
 * Parameters mirror Bitcoin exactly.
 *
 * ┌──────────────────────────────────────────────┐
 * │  Symbol:         402                          │
 * │  Max Supply:     21,000,000.00000000           │
 * │  Decimals:       8 (like Bitcoin satoshis)     │
 * │  Per Mint:       50.00000000 (era 0)           │
 * │  Halving:        Every 210,000 mints (~4 yrs)  │
 * │  Difficulty:     5 leading zero hex chars       │
 * │  Total Eras:     33 (~132 years)               │
 * │  Distribution:   100% mined, 0% pre-mine       │
 * └──────────────────────────────────────────────┘
 *
 * Emission schedule (matches Bitcoin):
 *   Era 0:  210,000 × 50       = 10,500,000
 *   Era 1:  210,000 × 25       =  5,250,000
 *   Era 2:  210,000 × 12.5     =  2,625,000
 *   Era 3:  210,000 × 6.25     =  1,312,500
 *   Era 4:  210,000 × 3.125    =    656,250
 *   ...
 *   Era 32: 210,000 × 0.00000001 = 0.00210000
 *   Era 33: reward = 0, mining ends
 *
 * After deployment, add DNS TXT record to path402.com:
 *   _bsv-token.path402.com TXT "token_id=<TOKEN_ID>"
 *
 * ⚠️  THIS IS A ONE-WAY OPERATION. ONCE DEPLOYED, THE CONTRACT IS IMMUTABLE.
 *     DOUBLE-CHECK ALL PARAMETERS BEFORE RUNNING.
 */

const WIF = process.env.PATHD_WALLET_KEY || process.env.PRIVATE_KEY || ''
if (!WIF) {
    console.error('No wallet key. Set PATHD_WALLET_KEY env var.')
    process.exit(1)
}

const privateKey = bsv.PrivateKey.fromWIF(WIF)
const deployAddress = privateKey.toAddress().toString()

// BSV mainnet
const provider = new DefaultProvider({ network: bsv.Networks.mainnet })
const signer = new TestWallet(privateKey, provider)

// ═══════════════════════════════════════════════════════════
// PRODUCTION PARAMETERS — MIRROR BITCOIN EXACTLY
// ═══════════════════════════════════════════════════════════

// 21,000,000 tokens with 8 decimal places
// Internal representation: 21M × 10^8 = 2,100,000,000,000,000
const MAX_SUPPLY = 2_100_000_000_000_000n

// 8 decimal places (same as Bitcoin satoshis)
const DECIMALS = 8n

// 50 tokens per mint = 5,000,000,000 in smallest unit
const LIMIT_PER_MINT = 5_000_000_000n

// Halving every 210,000 mints (same as Bitcoin)
// At ~1 mint per 10 min block: 210,000 × 10 min ≈ 4 years
const HALVING_INTERVAL = 210_000n

// Difficulty: 5 leading zero hex characters
// Hash must be < 0x00000FFFFF...FF
// ~1 in 1,048,576 per hash attempt
// At 1M H/s ≈ 1 solution per second (single CPU thread)
const DIFFICULTY_TARGET = BigInt(
    '0x00000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
)

async function main() {
    await Path402HTM.loadArtifact()

    const instance = new Path402HTM(
        toByteString(''),                  // id: empty at genesis
        toByteString('402', true),         // sym: 402
        MAX_SUPPLY,                        // max: 2,100,000,000,000,000
        DECIMALS,                          // dec: 8
        LIMIT_PER_MINT,                    // lim: 5,000,000,000 (50 coins)
        DIFFICULTY_TARGET,                 // 5 leading zero hex chars
        HALVING_INTERVAL                   // 210,000 mints per era
    )

    await instance.connect(signer)

    console.log('')
    console.log('╔══════════════════════════════════════════════╗')
    console.log('║     $402 MAINNET DEPLOYMENT                  ║')
    console.log('╠══════════════════════════════════════════════╣')
    console.log('║                                              ║')
    console.log(`║  Deployer:    ${deployAddress}`)
    console.log('║  Symbol:      402                            ║')
    console.log('║  Supply:      21,000,000.00000000            ║')
    console.log('║  Decimals:    8                              ║')
    console.log('║  Per Mint:    50.00000000                    ║')
    console.log('║  Halving:     every 210,000 mints (~4 yrs)  ║')
    console.log('║  Eras:        33 (~132 years total)          ║')
    console.log('║  Difficulty:  5 leading zero hex chars       ║')
    console.log('║  Pre-mine:    0%                             ║')
    console.log('║                                              ║')
    console.log('╚══════════════════════════════════════════════╝')
    console.log('')
    console.log('⚠️  THIS IS IRREVERSIBLE. Press Ctrl+C within 10 seconds to abort.')
    console.log('')

    // Safety delay
    for (let i = 10; i > 0; i--) {
        process.stdout.write(`  Deploying in ${i}...\r`)
        await new Promise(r => setTimeout(r, 1000))
    }

    console.log('\n  Deploying...\n')

    const tokenId = await instance.deployToken({
        domain: 'path402.com',
        desc: 'PoW20 Hash-to-Mint token for the $402 network. 100% mined, 0% pre-mine.',
    })

    console.log('╔══════════════════════════════════════════════╗')
    console.log('║     DEPLOYMENT SUCCESSFUL                    ║')
    console.log('╠══════════════════════════════════════════════╣')
    console.log(`║  Token ID: ${tokenId}`)
    console.log(`║  View:     https://1satordinals.com/token/${tokenId}`)
    console.log('╠══════════════════════════════════════════════╣')
    console.log('║                                              ║')
    console.log('║  NEXT STEPS:                                 ║')
    console.log('║                                              ║')
    console.log('║  1. Add DNS TXT record to path402.com:       ║')
    console.log(`║     _bsv-token.path402.com TXT "${tokenId}"`)
    console.log('║                                              ║')
    console.log('║  2. Set HTM_TOKEN_ID in client config:       ║')
    console.log(`║     export HTM_TOKEN_ID=${tokenId}`)
    console.log('║                                              ║')
    console.log('║  3. Start mining:                            ║')
    console.log('║     path402d start                           ║')
    console.log('║                                              ║')
    console.log('╚══════════════════════════════════════════════╝')
}

main().catch((err) => {
    console.error('DEPLOYMENT FAILED:', err)
    process.exit(1)
})
