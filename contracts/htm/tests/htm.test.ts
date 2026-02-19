import { expect, use } from 'chai'
import { Path402HTM } from '../src/contracts/htm'
import chaiAsPromised from 'chai-as-promised'
use(chaiAsPromised)

// Original scaffold test — disabled, contract API has changed.
// See path402-mint.test.ts for active tests.
describe.skip('Test SmartContract `Path402HTM` (legacy)', () => {
    it('placeholder', () => {
        expect(true).to.be.true
    })
})
