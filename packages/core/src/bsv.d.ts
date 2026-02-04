declare module 'bsv' {
    export class Address {
        static fromString(address: string): Address;
        toString(): string;
    }

    export class Script {
        static buildPublicKeyHashOut(address: Address): Script;
        toHex(): string;
    }

    export class PrivateKey {
        static fromRandom(): PrivateKey;
        static fromWIF(wif: string): PrivateKey;
        toAddress(): Address;
        toWIF(): string;
    }
}
