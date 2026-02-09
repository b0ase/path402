import { BSV20V2 } from 'scrypt-ord'
import {
    Addr,
    assert,
    ByteString,
    hash256,
    method,
    prop,
    toByteString,
    Utils,
    byteString2Int,
    reverseByteString,
    len,
    slice,
} from 'scrypt-ts'

/**
 * BRC-114: Proof-of-Indexing Hash-to-Mint Contract
 *
 * A BSV-21 token where the entire supply is locked at deployment.
 * Tokens are released via Proof-of-Work mining.
 *
 * The PoW challenge includes a `workCommitment` — a 32-byte merkle root
 * of indexing work claimed by the miner. This is recorded on-chain
 * permanently and verified by L2 gossip peers.
 *
 * Anti-frontrun: `dest` (miner address) is part of the hash preimage.
 * Anti-precompute: `prevTxId` changes with every mint (UTXO chain).
 */
export class Path402HTM extends BSV20V2 {
    // ═══════════════════════════════════════════
    // Stateful properties (change each mint)
    // ═══════════════════════════════════════════

    /** Remaining unminted token supply */
    @prop(true)
    supply: bigint

    /** Total successful mints (used for halving calculation) */
    @prop(true)
    mintCount: bigint

    // ═══════════════════════════════════════════
    // Immutable properties (set at deploy)
    // ═══════════════════════════════════════════

    /** Base tokens per successful mint (before halving) */
    @prop()
    lim: bigint

    /**
     * PoW difficulty target (256-bit integer).
     * The hash256 of the challenge, interpreted as a big-endian
     * unsigned integer, must be strictly less than this value.
     * Lower target = harder difficulty.
     */
    @prop()
    target: bigint

    /** Number of mints per halving era */
    @prop()
    halvingInterval: bigint

    constructor(
        id: ByteString,
        sym: ByteString,
        max: bigint,
        dec: bigint,
        lim: bigint,
        target: bigint,
        halvingInterval: bigint
    ) {
        super(id, sym, max, dec)
        this.init(...arguments)
        this.supply = max
        this.mintCount = 0n
        this.lim = lim
        this.target = target
        this.halvingInterval = halvingInterval
    }

    /**
     * Mint tokens by providing a valid PoW solution.
     *
     * @param dest - Miner's P2PKH address (receives minted tokens)
     * @param nonce - The PoW solution nonce
     * @param workCommitment - 32-byte SHA-256 merkle root of claimed indexing work
     */
    @method()
    public mint(
        dest: Addr,
        nonce: ByteString,
        workCommitment: ByteString
    ) {
        // ── 1. Input validation ──
        assert(len(workCommitment) == 32n, 'workCommitment must be 32 bytes')
        assert(len(nonce) > 0n, 'nonce required')

        // ── 2. Build PoW challenge ──
        // prevTxId:       32 bytes — changes each mint, prevents pre-computation
        // workCommitment: 32 bytes — commits to indexing work
        // dest:           20 bytes — prevents mempool front-running
        // nonce:          variable — the miner's solution
        const challenge: ByteString =
            this.ctx.utxo.outpoint.txid +
            workCommitment +
            dest +
            nonce

        // ── 3. Double SHA-256 (same as Bitcoin block hashing) ──
        const h = hash256(challenge)

        // ── 4. Verify PoW meets difficulty target ──
        // Convert hash to big-endian unsigned integer.
        // Append 0x00 to ensure positive interpretation in Script number encoding.
        const hashInt = byteString2Int(
            reverseByteString(h, 32n) + toByteString('00')
        )
        assert(hashInt >= 0n, 'hash overflow')
        assert(hashInt < this.target, 'hash does not meet difficulty')

        // ── 5. Calculate mint amount with halving ──
        // Mirrors Bitcoin exactly: 33 halving eras (~132 years at 10 min blocks).
        // Era 0: full reward. Era 33+: reward = 0, mining complete.
        // With 8 decimals and lim = 5,000,000,000 (50 coins):
        //   Era 0: 50, Era 1: 25, Era 2: 12.5, ... Era 32: 1 sat, Era 33: 0
        const era = this.mintCount / this.halvingInterval
        let amount = this.lim

        if (era >= 1n) { amount = amount / 2n }
        if (era >= 2n) { amount = amount / 2n }
        if (era >= 3n) { amount = amount / 2n }
        if (era >= 4n) { amount = amount / 2n }
        if (era >= 5n) { amount = amount / 2n }
        if (era >= 6n) { amount = amount / 2n }
        if (era >= 7n) { amount = amount / 2n }
        if (era >= 8n) { amount = amount / 2n }
        if (era >= 9n) { amount = amount / 2n }
        if (era >= 10n) { amount = amount / 2n }
        if (era >= 11n) { amount = amount / 2n }
        if (era >= 12n) { amount = amount / 2n }
        if (era >= 13n) { amount = amount / 2n }
        if (era >= 14n) { amount = amount / 2n }
        if (era >= 15n) { amount = amount / 2n }
        if (era >= 16n) { amount = amount / 2n }
        if (era >= 17n) { amount = amount / 2n }
        if (era >= 18n) { amount = amount / 2n }
        if (era >= 19n) { amount = amount / 2n }
        if (era >= 20n) { amount = amount / 2n }
        if (era >= 21n) { amount = amount / 2n }
        if (era >= 22n) { amount = amount / 2n }
        if (era >= 23n) { amount = amount / 2n }
        if (era >= 24n) { amount = amount / 2n }
        if (era >= 25n) { amount = amount / 2n }
        if (era >= 26n) { amount = amount / 2n }
        if (era >= 27n) { amount = amount / 2n }
        if (era >= 28n) { amount = amount / 2n }
        if (era >= 29n) { amount = amount / 2n }
        if (era >= 30n) { amount = amount / 2n }
        if (era >= 31n) { amount = amount / 2n }
        if (era >= 32n) { amount = amount / 2n }

        assert(amount > 0n, 'mining complete: amount is zero')

        // ── 6. Decrement supply ──
        this.supply -= amount
        assert(this.supply >= 0n, 'supply exhausted')

        // ── 7. Increment mint counter ──
        this.mintCount += 1n

        // ── 8. Build transaction outputs ──
        let outputs = toByteString('')

        // Output 0: State continuation (if supply remains)
        if (this.supply > 0n) {
            outputs += this.buildStateOutputFT(this.supply)
        }

        // Output 1: Transfer minted tokens to miner's address
        outputs += BSV20V2.buildTransferOutput(dest, this.id, amount)

        // Output 2+: Change (for transaction fees)
        outputs += this.buildChangeOutput()

        // ── 9. Enforce output integrity ──
        assert(
            hash256(outputs) == this.ctx.hashOutputs,
            'hashOutputs mismatch'
        )
    }
}
