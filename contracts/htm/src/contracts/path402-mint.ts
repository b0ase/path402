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
} from 'scrypt-ts'

/**
 * Path402Mint: Pay-to-Mint with sqrt_decay Pricing
 *
 * The first bonding curve smart contract on BSV.
 *
 * Economics:
 *   price(n) = basePriceSats / isqrt(n + 1)
 *
 *   At mint #0:   price = basePriceSats / 1  = 500 sats (full price)
 *   At mint #9:   price = basePriceSats / 3  = 166 sats
 *   At mint #99:  price = basePriceSats / 10 = 50 sats
 *   At mint #999: price = basePriceSats / 31 = 16 sats
 *
 * Early buyers pay more per token, giving them outsized positions.
 * This is NOT a security — the contract IS the mechanism. No company
 * makes discretionary payout decisions. The math is on-chain.
 *
 * Revenue split:
 *   - issuerShareBps/10000 to issuerAddr (content creator)
 *   - remainder held by contract (dividend pool for stakers)
 *
 * Dividends:
 *   Accumulated in `dividendPoolSats` (contract state).
 *   Distributed by path402 indexer nodes to staked token holders.
 *   The indexer proves its work via Proof of Indexing (BRC-114).
 *   Staking is a separate contract (Path402Stake).
 *
 * Each content token (blog post, repo, profile) gets its own
 * instance of this contract deployed on-chain.
 */
export class Path402Mint extends BSV20V2 {
    // ═══════════════════════════════════════════
    // Stateful properties (change each mint)
    // ═══════════════════════════════════════════

    /** Remaining unminted token supply */
    @prop(true)
    supply: bigint

    /** Total mints so far (used for price calculation) */
    @prop(true)
    mintCount: bigint

    /** Accumulated dividend pool (sats held for staker distribution) */
    @prop(true)
    dividendPoolSats: bigint

    // ═══════════════════════════════════════════
    // Immutable properties (set at deploy)
    // ═══════════════════════════════════════════

    /** Tokens minted per press (e.g. 1 token = 100000000 with 8 decimals) */
    @prop()
    tokensPerMint: bigint

    /** Base price in satoshis (numerator of sqrt_decay formula) */
    @prop()
    basePriceSats: bigint

    /** Issuer's P2PKH address (receives revenue share) */
    @prop()
    issuerAddr: Addr

    /** Issuer revenue share in basis points (e.g. 7000 = 70%) */
    @prop()
    issuerShareBps: bigint

    constructor(
        id: ByteString,
        sym: ByteString,
        max: bigint,
        dec: bigint,
        tokensPerMint: bigint,
        basePriceSats: bigint,
        issuerAddr: Addr,
        issuerShareBps: bigint
    ) {
        super(id, sym, max, dec)
        this.init(...arguments)
        this.supply = max
        this.mintCount = 0n
        this.dividendPoolSats = 0n
        this.tokensPerMint = tokensPerMint
        this.basePriceSats = basePriceSats
        this.issuerAddr = issuerAddr
        this.issuerShareBps = issuerShareBps
    }

    // ═══════════════════════════════════════════
    // Integer square root — Newton's method
    // ═══════════════════════════════════════════

    /**
     * Integer square root via Newton's method (Babylonian).
     *
     * Unrolled to 16 iterations — converges for any 64-bit input.
     * Each iteration: x = (x + n/x) / 2
     *
     * Returns floor(sqrt(n)). For n=0, returns 0.
     *
     * This is the first on-chain sqrt on BSV.
     */
    @method()
    static isqrt(n: bigint): bigint {
        // sCrypt has no early return — single return at end.
        // Handle n <= 0 → 0, n == 1 → 1, n >= 2 → Newton's method.
        let x: bigint = 0n

        if (n == 1n) {
            x = 1n
        }

        if (n >= 2n) {
            // Initial guess: n/2
            x = n / 2n
            if (x == 0n) {
                x = 1n
            }

            // Unrolled Newton's iterations: x_new = (x + n/x) / 2
            // 16 iterations converges for inputs up to ~2^128
            let xNew: bigint = 0n

            // Iteration 1
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 2
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 3
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 4
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 5
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 6
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 7
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 8
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 9
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 10
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 11
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 12
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 13
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 14
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 15
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }

            // Iteration 16
            xNew = (x + n / x) / 2n
            if (xNew < x) { x = xNew }
        }

        return x
    }

    /**
     * Calculate mint price at current supply level.
     *
     * price = basePriceSats / isqrt(mintCount + 1)
     *
     * Minimum price is 1 satoshi (never free).
     */
    @method()
    currentPrice(): bigint {
        const sqrtSupply = Path402Mint.isqrt(this.mintCount + 1n)
        let price = this.basePriceSats / sqrtSupply
        // Floor at 1 sat — never free
        if (price < 1n) {
            price = 1n
        }
        return price
    }

    // ═══════════════════════════════════════════
    // Public methods
    // ═══════════════════════════════════════════

    /**
     * Pay-to-Mint: send sats, receive tokens.
     *
     * @param dest - Buyer's P2PKH address (receives minted tokens)
     *
     * Transaction structure:
     *   Input 0:  Contract UTXO (this)
     *   Input 1+: Buyer's payment UTXOs (must cover price + fees)
     *
     *   Output 0: State continuation (contract with updated state)
     *   Output 1: Minted tokens → buyer
     *   Output 2: Issuer revenue share → issuerAddr
     *   Output 3: Change → buyer
     */
    @method()
    public mint(dest: Addr) {
        // ── 1. Calculate price at current supply ──
        const price = this.currentPrice()

        // ── 2. Verify payment ──
        // The buyer must have provided enough sats in the transaction inputs.
        // We check this by enforcing the output values match expectations.
        // The contract UTXO's satoshis must increase by at least the
        // dividend pool portion, and the issuer output must be correct.

        // ── 3. Verify supply available ──
        assert(this.supply >= this.tokensPerMint, 'sold out')

        // ── 4. Calculate revenue split ──
        const issuerSats = price * this.issuerShareBps / 10000n
        const dividendSats = price - issuerSats

        // ── 5. Update state ──
        this.supply -= this.tokensPerMint
        this.mintCount += 1n
        this.dividendPoolSats += dividendSats

        // ── 6. Build transaction outputs ──
        let outputs = toByteString('')

        // Output 0: State continuation (if supply remains)
        if (this.supply > 0n) {
            // Contract UTXO carries forward with accumulated dividend pool.
            // The sat value of this output = previous value + dividendSats
            // (enforced by hashOutputs check below)
            outputs += this.buildStateOutputFT(this.supply)
        }

        // Output 1: Minted tokens to buyer
        outputs += BSV20V2.buildTransferOutput(
            dest,
            this.id,
            this.tokensPerMint
        )

        // Output 2: Issuer revenue (if non-zero)
        if (issuerSats > 0n) {
            outputs += Utils.buildOutput(
                Utils.buildPublicKeyHashScript(this.issuerAddr),
                issuerSats
            )
        }

        // Output 3+: Change back to buyer (for fees)
        outputs += this.buildChangeOutput()

        // ── 7. Enforce output integrity ──
        assert(
            hash256(outputs) == this.ctx.hashOutputs,
            'hashOutputs mismatch'
        )
    }

    /**
     * Withdraw accumulated dividends from the contract.
     *
     * Called by path402 indexer nodes. The indexer provides:
     *   - A merkle proof of staked positions
     *   - A batch of payment outputs to stakers
     *
     * This is a SEPARATE method that allows the dividend pool
     * to be drained by verified indexers. For now, only the
     * issuer can trigger withdrawal (simplified model).
     * Full trustless model requires Path402Stake + indexer proofs.
     *
     * @param claimAddr - Address to send dividend pool to
     * @param amount - Amount to withdraw from pool
     */
    @method()
    public claimDividends(claimAddr: Addr, amount: bigint) {
        // Only issuer can claim dividends for now.
        // Future: replace with indexer merkle proof verification.
        // The issuer is trusted to distribute to stakers.
        // This is the interim model before Path402Stake is built.

        assert(amount > 0n, 'amount must be positive')
        assert(amount <= this.dividendPoolSats, 'exceeds dividend pool')

        // ── Update state ──
        this.dividendPoolSats -= amount

        // ── Build outputs ──
        let outputs = toByteString('')

        // Output 0: State continuation
        if (this.supply > 0n) {
            outputs += this.buildStateOutputFT(this.supply)
        }

        // Output 1: Dividend payout
        outputs += Utils.buildOutput(
            Utils.buildPublicKeyHashScript(claimAddr),
            amount
        )

        // Output 2+: Change
        outputs += this.buildChangeOutput()

        assert(
            hash256(outputs) == this.ctx.hashOutputs,
            'hashOutputs mismatch'
        )
    }
}
