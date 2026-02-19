import { Path402HTM } from './src/contracts/htm'
import { BSV20V2P2PKH, OneSatApis } from 'scrypt-ord'
import {
    bsv,
    TestWallet,
    toByteString,
    DefaultProvider,
    Addr,
    ByteString,
    ContractTransaction,
    MethodCallOptions,
} from 'scrypt-ts'
import * as crypto from 'crypto'

/**
 * Mine T402 tokens from the deployed BRC-114 Hash-to-Mint contract.
 *
 * This script:
 * 1. Fetches the current contract UTXO from chain
 * 2. Reconstructs the contract state
 * 3. Finds a valid PoW nonce (easy difficulty: 1 leading zero byte)
 * 4. Submits the mint transaction
 */

const TOKEN_ID =
    '32ae25f861192f286bdbaf28f50b8ac1cd5ec4ff0b23a9831fa821acf91e5d02_0'

// Wallet key from env
const WIF =
    process.env.PATHD_WALLET_KEY || process.env.PRIVATE_KEY || ''

if (!WIF) {
    console.error(
        'No wallet key. Set PATHD_WALLET_KEY or PRIVATE_KEY env var.'
    )
    process.exit(1)
}

const privateKey = bsv.PrivateKey.fromWIF(WIF)
const pubKeyHash = bsv.crypto.Hash.sha256ripemd160(
    privateKey.publicKey.toBuffer()
)
const minerAddr = Addr(pubKeyHash.toString('hex'))

// ── Hashing ──

function doublesha256(buf: Buffer): Buffer {
    const h1 = crypto.createHash('sha256').update(buf).digest()
    return crypto.createHash('sha256').update(h1).digest()
}

// ── PoW Miner ──

function mineNonce(
    txidDisplay: string,
    workCommitment: Buffer,
    dest: Buffer,
    target: bigint
): { nonce: Buffer; hash: Buffer; attempts: number } {
    // txid in internal byte order (reversed from display format)
    // This matches what sCrypt's this.ctx.utxo.outpoint.txid returns
    const txidBuf = Buffer.from(txidDisplay, 'hex').reverse()

    let attempts = 0
    const nonceBuf = Buffer.alloc(4)

    const start = Date.now()

    while (true) {
        attempts++
        nonceBuf.writeUInt32LE(attempts)

        const challenge = Buffer.concat([
            txidBuf,
            workCommitment,
            dest,
            nonceBuf,
        ])
        const hash = doublesha256(challenge)

        // Check PoW: hash interpreted as big-endian integer must be < target
        // For easy target (0x00FF...FF), just check first byte is 0x00
        if (hash[0] === 0x00) {
            const elapsed = Date.now() - start
            console.log(
                `  Found in ${attempts} attempts (${elapsed}ms)`
            )
            return { nonce: nonceBuf, hash, attempts }
        }

        if (attempts % 10000 === 0) {
            process.stdout.write(`\r  Attempts: ${attempts}`)
        }
    }
}

// ── Calculate mint amount (replicates contract halving logic) ──

function calculateMintAmount(
    mintCount: bigint,
    halvingInterval: bigint,
    lim: bigint,
    supply: bigint
): bigint {
    const era = mintCount / halvingInterval
    let amount = lim
    if (era >= 1n) amount = amount / 2n
    if (era >= 2n) amount = amount / 2n
    if (era >= 3n) amount = amount / 2n
    if (era >= 4n) amount = amount / 2n
    if (era >= 5n) amount = amount / 2n
    if (era >= 6n) amount = amount / 2n
    if (era >= 7n) amount = amount / 2n

    if (amount > supply) amount = supply
    return amount
}

// ── Main ──

async function main() {
    // 1. Load compiled contract artifact
    await Path402HTM.loadArtifact()

    console.log('=== T402 Hash-to-Mint Miner ===')
    console.log('')
    console.log(
        'Miner address:',
        privateKey.toAddress().toString()
    )
    console.log('')

    // 2. Fetch current contract UTXO
    console.log('Fetching contract UTXO...')
    const utxo = await OneSatApis.fetchLatestByOrigin(
        TOKEN_ID,
        bsv.Networks.mainnet
    )
    if (!utxo) {
        throw new Error(
            'Contract UTXO not found. It may have been spent — try again.'
        )
    }
    console.log(`  UTXO: ${utxo.txId}:${utxo.outputIndex}`)

    // 3. Reconstruct contract from on-chain state
    const instance = Path402HTM.fromUTXO(utxo)

    console.log('')
    console.log('Contract state:')
    console.log(`  Supply remaining: ${instance.supply}`)
    console.log(`  Mints so far:    ${instance.mintCount}`)
    console.log(`  Per mint:        ${instance.lim}`)
    console.log(
        `  Target:          0x${instance.target.toString(16).slice(0, 8)}...`
    )
    console.log(
        `  Halving:         every ${instance.halvingInterval} mints`
    )

    const amount = calculateMintAmount(
        instance.mintCount,
        instance.halvingInterval,
        instance.lim,
        instance.supply
    )
    console.log(`  This mint:       ${amount} T402`)
    console.log('')

    if (amount <= 0n) {
        console.log('Mining complete — no more tokens to mint.')
        return
    }

    // 4. Connect signer + provider
    const provider = new DefaultProvider({ network: bsv.Networks.mainnet })
    const signer = new TestWallet(privateKey, provider)
    await instance.connect(signer)

    // 5. Work commitment (32 zero bytes for test — real miner uses merkle root)
    const workCommitmentBuf = Buffer.alloc(32, 0)
    const workCommitment = toByteString(
        workCommitmentBuf.toString('hex')
    )

    // 6. Mine — find valid PoW nonce
    console.log(
        'Mining... (difficulty: 1 leading zero byte, ~256 attempts expected)'
    )
    const { nonce, hash, attempts } = mineNonce(
        utxo.txId,
        workCommitmentBuf,
        pubKeyHash,
        instance.target
    )

    console.log(`  Nonce:  ${nonce.toString('hex')}`)
    console.log(`  Hash:   ${hash.toString('hex')}`)
    console.log('')

    const nonceBS = toByteString(nonce.toString('hex'))

    // 7. Bind custom tx builder for the mint method
    instance.bindTxBuilder(
        'mint',
        async (
            current: Path402HTM,
            options: MethodCallOptions<Path402HTM>,
            ...args: any[]
        ): Promise<ContractTransaction> => {
            const dest = args[0] as Addr

            // Build next contract state
            const nextInstance = current.next()
            nextInstance.supply = current.supply - amount
            nextInstance.mintCount = current.mintCount + 1n

            // Set token ID on genesis (first mint)
            const tokenId = current.getTokenId()
            if (current.id === toByteString('')) {
                nextInstance.id = toByteString(tokenId, true)
            }

            // Set BSV-21 transfer inscription for state continuation
            nextInstance.setAmt(nextInstance.supply)

            // Build transaction
            const tx = new bsv.Transaction()
            tx.addInput(current.buildContractInput())

            // Output 0: State continuation (contract UTXO with remaining supply)
            if (nextInstance.supply > 0n) {
                tx.addOutput(
                    new bsv.Transaction.Output({
                        script: nextInstance.lockingScript,
                        satoshis: 1,
                    })
                )
            }

            // Output 1: Transfer minted tokens to miner
            const p2pkh = new BSV20V2P2PKH(
                toByteString(tokenId, true),
                current.sym,
                current.max,
                current.dec,
                dest
            )
            p2pkh.setAmt(amount)

            tx.addOutput(
                new bsv.Transaction.Output({
                    script: p2pkh.lockingScript,
                    satoshis: 1,
                })
            )

            // Change output for fees
            const changeAddress =
                await current.signer.getDefaultAddress()
            const feePerKb = await current.provider?.getFeePerKb()
            tx.feePerKb(feePerKb as number)
            tx.change(changeAddress)

            const nexts = []
            if (nextInstance.supply > 0n) {
                nexts.push({
                    instance: nextInstance,
                    balance: 1,
                    atOutputIndex: 0,
                })
            }

            return {
                tx,
                atInputIndex: 0,
                nexts,
            }
        }
    )

    // 8. Execute the mint
    console.log('Submitting mint transaction...')
    const callResult = await instance.methods.mint(
        minerAddr,
        nonceBS,
        workCommitment
    )

    console.log('')
    console.log('=== MINING SUCCESSFUL ===')
    console.log('')
    console.log(`  TX:     ${callResult.tx.id}`)
    console.log(`  Mined:  ${amount} T402`)
    console.log(
        `  To:     ${privateKey.toAddress().toString()}`
    )
    console.log('')
    console.log(
        `  View: https://1satordinals.com/tx/${callResult.tx.id}`
    )
    console.log('')
    console.log(
        `  Remaining supply: ${instance.supply - amount}`
    )
    console.log(
        `  Total mints: ${instance.mintCount + 1n}`
    )
}

main().catch((err) => {
    console.error('Mining failed:', err)
    process.exit(1)
})
