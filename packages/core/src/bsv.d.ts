declare module 'bsv' {
    // Key management
    export const PrivKey: any;
    export const PubKey: any;
    export const Address: any;
    export const KeyPair: any;

    // Crypto
    export const Hash: any;
    export const Ecdsa: any;
    export const Sig: any;

    // Script & opcodes
    export const Script: any;
    export const OpCode: any;

    // Transaction building
    export const Tx: any;
    export const TxBuilder: any;
    export const TxIn: any;
    export const TxOut: any;
    export const TxOutMap: any;
    export const TxVerifier: any;
    export const SigOperations: any;

    // Utilities
    export const Bn: any;
    export const Br: any;
    export const Bw: any;
    export const Random: any;
    export const Base58: any;
    export const Base58Check: any;
    export const VarInt: any;
    export const Point: any;
    export const Struct: any;

    // HD / BIP
    export const Bip32: any;
    export const Bip39: any;

    // Block
    export const Block: any;
    export const BlockHeader: any;

    // Message signing
    export const Bsm: any;

    // Encryption
    export const Aes: any;
    export const Aescbc: any;
    export const Cbc: any;
    export const Ecies: any;
    export const Ach: any;

    // Interpreter
    export const Interp: any;

    // Constants & config
    export const Constants: any;
    export function getConstants(): any;

    // Workers
    export const Workers: any;
    export const WorkersResult: any;

    // Utility functions
    export function cmp(a: any, b: any): number;
    export const deps: any;
    export const version: string;

    // Wordlists
    export const en: any;
    export const jp: any;

    // Legacy aliases (v1 compat)
    export const PrivateKey: any;
}
