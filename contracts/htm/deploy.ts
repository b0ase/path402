import { Path402HTM } from './src/contracts/htm'
import { bsv, TestWallet, toByteString, DefaultProvider } from 'scrypt-ts'

/**
 * Deploy a TEST $402 Hash-to-Mint contract to BSV mainnet.
 *
 * Symbol: T402 (test — NOT the real $402 token)
 * Supply: 21,000 (small for testing, real will be 21,000,000)
 * Limit:  100 per mint (small for testing)
 * Difficulty target: very easy (for testing — just needs 1 leading zero byte)
 * Halving: every 100 mints
 */

// WIF private key — read from env or hardcode for testing
const WIF = process.env.PATHD_WALLET_KEY
    || process.env.PRIVATE_KEY
    || ''

if (!WIF) {
    console.error('No wallet key found. Set PATHD_WALLET_KEY or PRIVATE_KEY env var.')
    process.exit(1)
}

const privateKey = bsv.PrivateKey.fromWIF(WIF)
console.log('Deploying from address:', privateKey.toAddress().toString())

// Use DefaultProvider for mainnet with adequate fee rate
const provider = new DefaultProvider({ network: bsv.Networks.mainnet })
const signer = new TestWallet(privateKey, provider)

async function main() {
    // Load the compiled contract artifact
    await Path402HTM.loadArtifact()

    // Difficulty target for testing: 1 leading zero byte
    // This means hash must be < 0x00FFFFFF...FF (very easy, ~1 in 256)
    // Real deployment would use a much lower target
    const easyTarget = BigInt('0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')

    // Create the contract instance
    const instance = new Path402HTM(
        toByteString(''),                // id: empty at genesis (auto-set on first mint)
        toByteString('T402', true),      // sym: T402 (TEST token)
        21_000n,                         // max supply (small for testing)
        0n,                              // decimals: 0 (whole tokens)
        100n,                            // lim: 100 tokens per mint
        easyTarget,                      // difficulty target (very easy for testing)
        100n                             // halvingInterval: every 100 mints
    )

    // Connect signer
    await instance.connect(signer)

    console.log('Deploying T402 test contract...')
    console.log('  Symbol:      T402')
    console.log('  Max Supply:  21,000')
    console.log('  Per Mint:    100')
    console.log('  Difficulty:  1 leading zero byte (~1 in 256)')
    console.log('  Halving:     every 100 mints')
    console.log('')

    // Deploy — this creates the deploy+mint BSV-21 inscription
    // and locks the full supply in the contract UTXO
    const tokenId = await instance.deployToken()

    console.log('=== DEPLOYMENT SUCCESSFUL ===')
    console.log('')
    console.log('Token ID:', tokenId)
    console.log('View on 1sat: https://1satordinals.com/token/' + tokenId)
    console.log('')
    console.log('The entire 21,000 T402 supply is now locked in the contract.')
    console.log('Mining can begin immediately.')
}

main().catch((err) => {
    console.error('Deployment failed:', err)
    process.exit(1)
})
