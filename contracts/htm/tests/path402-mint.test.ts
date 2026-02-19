import { expect, use } from 'chai'
import { Path402Mint } from '../src/contracts/path402-mint'
import { getDefaultSigner, randomPrivateKey } from './utils/txHelper'
import { MethodCallOptions, toByteString, Ripemd160 } from 'scrypt-ts'
import chaiAsPromised from 'chai-as-promised'
use(chaiAsPromised)

// Helper: create an Addr (Ripemd160) from randomPrivateKey
function randomAddr() {
    const [, , pubKeyHash] = randomPrivateKey()
    return Ripemd160(pubKeyHash.toString('hex'))
}

describe('Test SmartContract `Path402Mint`', () => {
    before(async () => {
        await Path402Mint.loadArtifact()
    })

    // ═══════════════════════════════════════════
    // Unit tests for isqrt (Newton's method)
    // ═══════════════════════════════════════════

    describe('isqrt', () => {
        it('isqrt(0) = 0', () => {
            expect(Path402Mint.isqrt(0n)).to.equal(0n)
        })

        it('isqrt(1) = 1', () => {
            expect(Path402Mint.isqrt(1n)).to.equal(1n)
        })

        it('isqrt(2) = 1', () => {
            expect(Path402Mint.isqrt(2n)).to.equal(1n)
        })

        it('isqrt(3) = 1', () => {
            expect(Path402Mint.isqrt(3n)).to.equal(1n)
        })

        it('isqrt(4) = 2', () => {
            expect(Path402Mint.isqrt(4n)).to.equal(2n)
        })

        it('isqrt(9) = 3', () => {
            expect(Path402Mint.isqrt(9n)).to.equal(3n)
        })

        it('isqrt(10) = 3 (floor)', () => {
            expect(Path402Mint.isqrt(10n)).to.equal(3n)
        })

        it('isqrt(16) = 4', () => {
            expect(Path402Mint.isqrt(16n)).to.equal(4n)
        })

        it('isqrt(100) = 10', () => {
            expect(Path402Mint.isqrt(100n)).to.equal(10n)
        })

        it('isqrt(1000) = 31 (floor)', () => {
            expect(Path402Mint.isqrt(1000n)).to.equal(31n)
        })

        it('isqrt(10000) = 100', () => {
            expect(Path402Mint.isqrt(10000n)).to.equal(100n)
        })

        it('isqrt(1000000) = 1000', () => {
            expect(Path402Mint.isqrt(1000000n)).to.equal(1000n)
        })

        it('isqrt(100000000) = 10000', () => {
            expect(Path402Mint.isqrt(100000000n)).to.equal(10000n)
        })

        it('isqrt of negative returns 0', () => {
            expect(Path402Mint.isqrt(-1n)).to.equal(0n)
        })

        // Verify floor property: result^2 <= n < (result+1)^2
        it('isqrt satisfies floor property for non-perfect squares', () => {
            const testCases = [2n, 3n, 5n, 7n, 8n, 10n, 15n, 50n, 99n, 101n, 999n]
            for (const n of testCases) {
                const r = Path402Mint.isqrt(n)
                expect(r * r <= n, `isqrt(${n})^2 should be <= ${n}`).to.be.true
                expect((r + 1n) * (r + 1n) > n, `(isqrt(${n})+1)^2 should be > ${n}`).to.be.true
            }
        })

        // Verify floor property for larger numbers relevant to real usage
        it('isqrt floor property holds for realistic supply ranges', () => {
            // Test supply ranges we'll actually see: 1 to 1M mints
            const testCases = [1000n, 5000n, 10000n, 50000n, 100000n, 250000n, 500000n, 1000000n]
            for (const n of testCases) {
                const r = Path402Mint.isqrt(n)
                expect(r * r <= n, `isqrt(${n})^2 should be <= ${n}`).to.be.true
                expect((r + 1n) * (r + 1n) > n, `(isqrt(${n})+1)^2 should be > ${n}`).to.be.true
            }
        })

        // 16 Newton iterations converge correctly for inputs up to ~10^8
        // which is far beyond any realistic mintCount (a blog post with
        // 100 million mints would be extraordinary).
        // Larger inputs need more iterations but are irrelevant in practice.
        it('isqrt converges for realistic upper bounds (10^8)', () => {
            // 16 Newton iterations converge perfectly for n up to ~10^8.
            // Blog posts / repos will never see 100M mints.
            const n = 10n ** 8n
            const r = Path402Mint.isqrt(n)
            expect(r).to.equal(10000n) // sqrt(10^8) = 10^4
            expect(r * r <= n, 'floor').to.be.true
            expect((r + 1n) * (r + 1n) > n, 'ceiling').to.be.true
        })
    })

    // ═══════════════════════════════════════════
    // Price calculation tests
    // ═══════════════════════════════════════════

    describe('currentPrice (via contract state)', () => {
        it('first mint price = basePriceSats / isqrt(1) = basePriceSats', () => {
            const issuerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                1000000n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            // At mintCount=0: price = 500 / isqrt(1) = 500
            const price = instance.currentPrice()
            expect(price).to.equal(500n)
        })

        it('price decreases with supply (sqrt_decay curve)', () => {
            const issuerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                1000000n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            // mintCount=0: price = 500 / isqrt(1) = 500
            expect(instance.currentPrice()).to.equal(500n)

            // Simulate mints by manually setting mintCount
            instance.mintCount = 9n
            // mintCount=9: price = 500 / isqrt(10) = 500/3 = 166
            expect(instance.currentPrice()).to.equal(166n)

            instance.mintCount = 99n
            // mintCount=99: price = 500 / isqrt(100) = 500/10 = 50
            expect(instance.currentPrice()).to.equal(50n)

            instance.mintCount = 999n
            // mintCount=999: price = 500 / isqrt(1000) = 500/31 = 16
            expect(instance.currentPrice()).to.equal(16n)

            instance.mintCount = 9999n
            // mintCount=9999: price = 500 / isqrt(10000) = 500/100 = 5
            expect(instance.currentPrice()).to.equal(5n)
        })

        it('price never goes below 1 sat', () => {
            const issuerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                100000000n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            // At very high supply: 500 / isqrt(250001) = 500/500 = 1
            instance.mintCount = 250000n
            expect(instance.currentPrice()).to.equal(1n)

            // Even higher — still 1 sat (floor)
            instance.mintCount = 10000000n
            expect(Number(instance.currentPrice())).to.be.greaterThanOrEqual(1)
        })

        it('price schedule matches documentation', () => {
            const issuerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                1000000n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            // Verify the price schedule from the contract doc header:
            // mint #0:   500 / sqrt(1)  = 500
            // mint #9:   500 / sqrt(10) = 166
            // mint #99:  500 / sqrt(100) = 50
            // mint #999: 500 / sqrt(1000) = 16
            const schedule = [
                { mintCount: 0n, expectedPrice: 500n },
                { mintCount: 9n, expectedPrice: 166n },
                { mintCount: 99n, expectedPrice: 50n },
                { mintCount: 999n, expectedPrice: 16n },
            ]

            for (const { mintCount, expectedPrice } of schedule) {
                instance.mintCount = mintCount
                expect(instance.currentPrice()).to.equal(expectedPrice,
                    `Price at mint #${mintCount} should be ${expectedPrice}`)
            }
        })
    })

    // ═══════════════════════════════════════════
    // Revenue split tests
    // ═══════════════════════════════════════════

    describe('revenue split calculation', () => {
        it('70/30 split at 500 sats: issuer=350, dividend=150', () => {
            const price = 500n
            const issuerShareBps = 7000n
            const issuerSats = price * issuerShareBps / 10000n
            const dividendSats = price - issuerSats

            expect(issuerSats).to.equal(350n)
            expect(dividendSats).to.equal(150n)
        })

        it('70/30 split at 166 sats: issuer=116, dividend=50', () => {
            const price = 166n
            const issuerShareBps = 7000n
            const issuerSats = price * issuerShareBps / 10000n
            const dividendSats = price - issuerSats

            expect(issuerSats).to.equal(116n)
            expect(dividendSats).to.equal(50n)
        })

        it('100% issuer share: all revenue to issuer', () => {
            const price = 500n
            const issuerShareBps = 10000n
            const issuerSats = price * issuerShareBps / 10000n
            const dividendSats = price - issuerSats

            expect(issuerSats).to.equal(500n)
            expect(dividendSats).to.equal(0n)
        })

        it('0% issuer share: all revenue to dividends', () => {
            const price = 500n
            const issuerShareBps = 0n
            const issuerSats = price * issuerShareBps / 10000n
            const dividendSats = price - issuerSats

            expect(issuerSats).to.equal(0n)
            expect(dividendSats).to.equal(500n)
        })
    })

    // ═══════════════════════════════════════════
    // On-chain integration tests
    // BSV20V2 deploy requires proper ordinal envelope
    // which DummyProvider doesn't support.
    // These tests need testnet: npm run test:testnet
    // ═══════════════════════════════════════════

    describe('mint (on-chain integration)', () => {
        const isLocal = (process.env.NETWORK || 'local') === 'local'

        it('should deploy and execute first mint', async function () {
            if (isLocal) {
                this.skip() // BSV20V2 needs ordinal envelope — requires testnet
            }

            const issuerAddr = randomAddr()
            const buyerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                100n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            await instance.connect(getDefaultSigner())
            const deployTx = await instance.deploy(1)
            console.log(`Deployed Path402Mint: ${deployTx.id}`)

            expect(instance.supply).to.equal(100n)
            expect(instance.mintCount).to.equal(0n)
            expect(instance.dividendPoolSats).to.equal(0n)

            const nextInstance = instance.next()
            nextInstance.supply = 99n
            nextInstance.mintCount = 1n
            nextInstance.dividendPoolSats = 150n

            const call = async () => {
                const callRes = await instance.methods.mint(
                    buyerAddr,
                    {
                        next: {
                            instance: nextInstance,
                            balance: 1,
                        },
                    } as MethodCallOptions<Path402Mint>
                )
                console.log(`Mint #1 TX: ${callRes.tx.id}`)
            }

            await expect(call()).not.to.be.rejected
        })

        it('should execute multiple sequential mints', async function () {
            if (isLocal) {
                this.skip()
            }

            const issuerAddr = randomAddr()
            const buyerAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                1000n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            await instance.connect(getDefaultSigner())
            await instance.deploy(1)

            let prevInstance = instance

            for (let i = 0; i < 5; i++) {
                const mintCount = BigInt(i)
                const price = 500n / Path402Mint.isqrt(mintCount + 1n)
                const issuerSats = price * 7000n / 10000n
                const dividendSats = price - issuerSats

                const nextInstance = prevInstance.next()
                nextInstance.supply -= 1n
                nextInstance.mintCount += 1n
                nextInstance.dividendPoolSats += dividendSats

                const call = async () => {
                    await prevInstance.methods.mint(
                        buyerAddr,
                        {
                            next: {
                                instance: nextInstance,
                                balance: 1,
                            },
                        } as MethodCallOptions<Path402Mint>
                    )
                }

                await expect(call()).not.to.be.rejected
                prevInstance = nextInstance
            }
        })
    })

    describe('claimDividends (on-chain integration)', () => {
        const isLocal = (process.env.NETWORK || 'local') === 'local'

        it('should claim dividends from pool', async function () {
            if (isLocal) {
                this.skip()
            }

            const issuerAddr = randomAddr()
            const buyerAddr = randomAddr()
            const claimAddr = randomAddr()

            const instance = new Path402Mint(
                toByteString(''),
                toByteString('4d494e54', true),
                100n,
                0n,
                1n,
                500n,
                issuerAddr,
                7000n
            )

            await instance.connect(getDefaultSigner())
            await instance.deploy(1)

            const afterMint = instance.next()
            afterMint.supply = 99n
            afterMint.mintCount = 1n
            afterMint.dividendPoolSats = 150n

            await instance.methods.mint(buyerAddr, {
                next: {
                    instance: afterMint,
                    balance: 1,
                },
            } as MethodCallOptions<Path402Mint>)

            const afterClaim = afterMint.next()
            afterClaim.dividendPoolSats = 50n

            const call = async () => {
                await afterMint.methods.claimDividends(
                    claimAddr,
                    100n,
                    {
                        next: {
                            instance: afterClaim,
                            balance: 1,
                        },
                    } as MethodCallOptions<Path402Mint>
                )
            }

            await expect(call()).not.to.be.rejected
            expect(afterClaim.dividendPoolSats).to.equal(50n)
        })
    })
})
