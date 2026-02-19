import { Path402HTM } from './src/contracts/htm'
import { bsv, TestWallet, toByteString, DefaultProvider } from 'scrypt-ts'

/**
 * Deploy T402v2 — harder difficulty test contract.
 *
 * Symbol:    T402v2
 * Supply:    21,000,000 (real supply)
 * Per mint:  100
 * Difficulty: 2 leading zero bytes (~65,536 attempts, ~6ms on modern CPU)
 * Halving:   every 105,000 mints (mirrors Bitcoin's 4-year schedule)
 *
 * With UTXO contention (1 mint per ~10min block), full mining takes ~4 years.
 * Halving schedule (integer division):
 *   Era 0: 105,000 mints × 100 = 10,500,000
 *   Era 1: 105,000 × 50  = 5,250,000
 *   Era 2: 105,000 × 25  = 2,625,000
 *   Era 3: 105,000 × 12  = 1,260,000
 *   Era 4: 105,000 × 6   =   630,000
 *   Era 5: 105,000 × 3   =   315,000
 *   Era 6: 105,000 × 1   =   105,000
 *   Mintable total: ~20,685,000 (315,000 permanently locked due to integer division)
 */

const WIF = process.env.PATHD_WALLET_KEY || process.env.PRIVATE_KEY || ''
if (!WIF) {
    console.error('No wallet key. Set PATHD_WALLET_KEY env var.')
    process.exit(1)
}

const privateKey = bsv.PrivateKey.fromWIF(WIF)
console.log('Deploying from:', privateKey.toAddress().toString())

const provider = new DefaultProvider({ network: bsv.Networks.mainnet })
const signer = new TestWallet(privateKey, provider)

async function main() {
    await Path402HTM.loadArtifact()

    // 2 leading zero bytes: hash must be < 0x0000FFFF...FF
    const harderTarget = BigInt(
        '0x0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    )

    const instance = new Path402HTM(
        toByteString(''),                  // id: empty at genesis
        toByteString('T402v2', true),      // sym: T402v2
        21_000_000n,                       // max supply (real)
        0n,                                // decimals
        100n,                              // per mint
        harderTarget,                      // 2 leading zero bytes (~1 in 65,536)
        105_000n                           // halving every 105,000 mints
    )

    await instance.connect(signer)

    console.log('')
    console.log('Deploying T402v2 test contract...')
    console.log('  Symbol:      T402v2')
    console.log('  Max Supply:  21,000,000')
    console.log('  Per Mint:    100')
    console.log('  Difficulty:  2 leading zero bytes (~1 in 65,536)')
    console.log('  Halving:     every 105,000 mints')
    console.log('')

    const tokenId = await instance.deployToken()

    console.log('=== DEPLOYMENT SUCCESSFUL ===')
    console.log('')
    console.log('Token ID:', tokenId)
    console.log('View: https://1satordinals.com/token/' + tokenId)
    console.log('')

    // Now attempt a test mine
    console.log('Waiting 10s for indexer...')
    await new Promise((r) => setTimeout(r, 10000))

    console.log('Attempting test mine with harder difficulty...')

    const { OneSatApis, BSV20V2P2PKH } = await import('scrypt-ord')
    const { Addr } = await import('scrypt-ts')
    const crypto = await import('crypto')

    function doublesha256(buf: Buffer): Buffer {
        const h1 = crypto.createHash('sha256').update(buf).digest()
        return crypto.createHash('sha256').update(h1).digest()
    }

    const pubKeyHash = bsv.crypto.Hash.sha256ripemd160(privateKey.publicKey.toBuffer())
    const minerAddr = Addr(pubKeyHash.toString('hex'))

    const utxo = await OneSatApis.fetchLatestByOrigin(tokenId, bsv.Networks.mainnet)
    if (!utxo) {
        console.log('UTXO not indexed yet — run mine.ts manually with the token ID above.')
        return
    }

    const current = Path402HTM.fromUTXO(utxo)
    await current.connect(signer)

    console.log(`  Supply: ${current.supply}, Mints: ${current.mintCount}`)

    // Mine with harder difficulty
    const txidBuf = Buffer.from(utxo.txId, 'hex').reverse()
    const commitBuf = Buffer.alloc(32, 0)
    const nonceBuf = Buffer.alloc(4)
    let attempts = 0
    const start = Date.now()

    while (true) {
        attempts++
        nonceBuf.writeUInt32LE(attempts)
        const challenge = Buffer.concat([txidBuf, commitBuf, pubKeyHash, nonceBuf])
        const hash = doublesha256(challenge)

        // 2 leading zero bytes
        if (hash[0] === 0x00 && hash[1] === 0x00) {
            const elapsed = Date.now() - start
            console.log(`  Found nonce in ${attempts} attempts (${elapsed}ms)`)
            console.log(`  Hash: ${hash.toString('hex')}`)

            const amount = 100n
            const workCommitment = toByteString(commitBuf.toString('hex'))
            const nonceBS = toByteString(nonceBuf.toString('hex'))

            current.bindTxBuilder('mint', async (cur: Path402HTM, options: any, ...args: any[]) => {
                const dest = args[0]
                const next = cur.next()
                next.supply = cur.supply - amount
                next.mintCount = cur.mintCount + 1n
                const tid = cur.getTokenId()
                if (cur.id === toByteString('')) {
                    next.id = toByteString(tid, true)
                }
                next.setAmt(next.supply)

                const tx = new bsv.Transaction()
                tx.addInput(cur.buildContractInput())

                if (next.supply > 0n) {
                    tx.addOutput(new bsv.Transaction.Output({ script: next.lockingScript, satoshis: 1 }))
                }

                const p2pkh = new BSV20V2P2PKH(
                    toByteString(tid, true), cur.sym, cur.max, cur.dec, dest
                )
                p2pkh.setAmt(amount)
                tx.addOutput(new bsv.Transaction.Output({ script: p2pkh.lockingScript, satoshis: 1 }))

                const changeAddr = await cur.signer.getDefaultAddress()
                const feePerKb = await cur.provider?.getFeePerKb()
                tx.feePerKb(feePerKb as number)
                tx.change(changeAddr)

                const nexts = next.supply > 0n
                    ? [{ instance: next, balance: 1, atOutputIndex: 0 }]
                    : []

                return { tx, atInputIndex: 0, nexts }
            })

            const result = await current.methods.mint(minerAddr, nonceBS, workCommitment)
            console.log('')
            console.log('=== MINE SUCCESSFUL ===')
            console.log(`  TX: ${result.tx.id}`)
            console.log(`  Mined: ${amount} T402v2`)
            console.log(`  View: https://1satordinals.com/tx/${result.tx.id}`)
            break
        }

        if (attempts % 100000 === 0) {
            const rate = Math.round(attempts / ((Date.now() - start) / 1000))
            console.log(`  ${attempts} attempts... (${rate} H/s)`)
        }
    }
}

main().catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
})
