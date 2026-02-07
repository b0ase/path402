/**
 * HtmBroadcaster — Calls the BRC-114 HTM smart contract mint() on BSV mainnet.
 *
 * Encapsulates the proven mine.ts pattern:
 *   fetch UTXO → reconstruct contract → mine nonce → submit tx
 */

import { Path402HTM } from './contracts/htm'
import { BSV20V2P2PKH, OneSatApis } from 'scrypt-ord'
import {
    bsv,
    TestWallet,
    toByteString,
    DefaultProvider,
    Addr,
    ContractTransaction,
    MethodCallOptions,
} from 'scrypt-ts'
import * as crypto from 'crypto'
import * as path from 'path'

export interface MintBroadcasterResult {
    success: boolean
    txid?: string
    amount?: bigint
    error?: string
    action?: 'done' | 'retry' | 'stop'
}

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

        // Convert hash to big-endian integer and compare to target
        let hashInt = BigInt(0)
        for (let i = 0; i < 32; i++) {
            hashInt = (hashInt << 8n) | BigInt(hash[i])
        }
        if (hashInt < target) {
            const elapsed = Date.now() - start
            console.log(
                `[HTM] Nonce found in ${attempts} attempts (${elapsed}ms)`
            )
            return { nonce: nonceBuf, hash, attempts }
        }

        if (attempts % 50000 === 0) {
            console.log(`[HTM] Mining... ${attempts} attempts`)
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

// ── Broadcaster ──

export class HtmBroadcaster {
    private tokenId: string
    private privateKey: any // bsv.PrivateKey
    private pubKeyHash: Buffer
    private minerAddr: Addr
    private artifactLoaded = false

    constructor(tokenId: string, privateKeyWif: string) {
        this.tokenId = tokenId
        this.privateKey = bsv.PrivateKey.fromWIF(privateKeyWif)
        this.pubKeyHash = bsv.crypto.Hash.sha256ripemd160(
            this.privateKey.publicKey.toBuffer()
        )
        this.minerAddr = Addr(this.pubKeyHash.toString('hex'))
    }

    getMinerAddress(): string {
        return this.privateKey.toAddress().toString()
    }

    private async ensureArtifact(): Promise<void> {
        if (this.artifactLoaded) return
        const artifactPath = path.resolve(
            __dirname,
            '..',
            'artifacts',
            'htm.json'
        )
        Path402HTM.loadArtifact(artifactPath)
        this.artifactLoaded = true
    }

    async broadcastMint(
        merkleRoot: string
    ): Promise<MintBroadcasterResult> {
        try {
            await this.ensureArtifact()

            // 1. Fetch current contract UTXO
            console.log('[HTM] Fetching contract UTXO...')
            const utxo = await OneSatApis.fetchLatestByOrigin(
                this.tokenId,
                bsv.Networks.mainnet
            )
            if (!utxo) {
                return {
                    success: false,
                    error: 'Contract UTXO not found — may be spent, try again',
                    action: 'retry',
                }
            }
            console.log(`[HTM] UTXO: ${utxo.txId}:${utxo.outputIndex}`)

            // 2. Reconstruct contract from on-chain state
            const instance = Path402HTM.fromUTXO(utxo)

            const amount = calculateMintAmount(
                instance.mintCount,
                instance.halvingInterval,
                instance.lim,
                instance.supply
            )
            if (amount <= 0n) {
                return {
                    success: false,
                    error: 'Mining complete — no more tokens to mint',
                    action: 'stop',
                }
            }

            console.log(
                `[HTM] Supply: ${instance.supply}, Mints: ${instance.mintCount}, This mint: ${amount}`
            )

            // 3. Connect signer + provider
            const provider = new DefaultProvider({
                network: bsv.Networks.mainnet,
            })
            const signer = new TestWallet(this.privateKey, provider)
            await instance.connect(signer)

            // 4. Prepare work commitment from merkle root
            const workCommitmentBuf = Buffer.from(merkleRoot, 'hex')
            if (workCommitmentBuf.length !== 32) {
                return {
                    success: false,
                    error: `Invalid merkle root length: ${workCommitmentBuf.length} (expected 32 bytes)`,
                    action: 'done',
                }
            }
            const workCommitment = toByteString(merkleRoot)

            // 5. Mine — find valid PoW nonce
            console.log('[HTM] Mining PoW nonce...')
            const { nonce } = mineNonce(
                utxo.txId,
                workCommitmentBuf,
                this.pubKeyHash,
                instance.target
            )
            const nonceBS = toByteString(nonce.toString('hex'))

            // 6. Bind custom tx builder
            const minerAddr = this.minerAddr
            instance.bindTxBuilder(
                'mint',
                async (
                    current: Path402HTM,
                    options: MethodCallOptions<Path402HTM>,
                    ...args: any[]
                ): Promise<ContractTransaction> => {
                    const dest = args[0] as Addr

                    const nextInstance = current.next()
                    nextInstance.supply = current.supply - amount
                    nextInstance.mintCount = current.mintCount + 1n

                    const tokenId = current.getTokenId()
                    if (current.id === toByteString('')) {
                        nextInstance.id = toByteString(tokenId, true)
                    }

                    nextInstance.setAmt(nextInstance.supply)

                    const tx = new bsv.Transaction()
                    tx.addInput(current.buildContractInput())

                    if (nextInstance.supply > 0n) {
                        tx.addOutput(
                            new bsv.Transaction.Output({
                                script: nextInstance.lockingScript,
                                satoshis: 1,
                            })
                        )
                    }

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

                    return { tx, atInputIndex: 0, nexts }
                }
            )

            // 7. Execute the mint
            console.log('[HTM] Submitting mint transaction...')
            const callResult = await instance.methods.mint(
                minerAddr,
                nonceBS,
                workCommitment
            )

            const txid = callResult.tx.id
            console.log(`[HTM] MINT SUCCESS: ${txid} (${amount} tokens)`)

            return {
                success: true,
                txid,
                amount,
                action: 'done',
            }
        } catch (err: any) {
            const msg =
                err?.message || err?.toString() || 'Unknown error'

            // UTXO contention — another miner spent the UTXO first
            if (
                msg.includes('utxo_spent') ||
                msg.includes('txn-mempool-conflict') ||
                msg.includes('Missing inputs')
            ) {
                console.warn(
                    '[HTM] UTXO contention — will retry with fresh UTXO'
                )
                return {
                    success: false,
                    error: msg,
                    action: 'retry',
                }
            }

            console.error('[HTM] Mint failed:', msg)
            return {
                success: false,
                error: msg,
                action: 'done',
            }
        }
    }
}
