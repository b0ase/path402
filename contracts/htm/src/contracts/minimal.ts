import { BSV20V2 } from 'scrypt-ord'
import {
    Addr,
    assert,
    ByteString,
    hash256,
    method,
    prop,
    toByteString,
} from 'scrypt-ts'

/**
 * Minimal BSV20V2 mint contract for size comparison.
 * This is essentially the "anyonecanmint" pattern with no PoW.
 */
export class MinimalMint extends BSV20V2 {
    @prop(true)
    supply: bigint

    @prop()
    lim: bigint

    constructor(
        id: ByteString,
        sym: ByteString,
        max: bigint,
        dec: bigint,
        lim: bigint
    ) {
        super(id, sym, max, dec)
        this.init(...arguments)
        this.supply = max
        this.lim = lim
    }

    @method()
    public mint(dest: Addr, amount: bigint) {
        assert(amount <= this.lim, 'exceeds limit')
        assert(amount > 0n, 'zero amount')
        this.supply -= amount
        assert(this.supply >= 0n, 'supply exhausted')

        let outputs = toByteString('')
        if (this.supply > 0n) {
            outputs += this.buildStateOutputFT(this.supply)
        }
        outputs += BSV20V2.buildTransferOutput(dest, this.id, amount)
        outputs += this.buildChangeOutput()
        assert(hash256(outputs) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }
}
