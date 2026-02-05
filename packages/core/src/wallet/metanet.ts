import { ChainWallet, WalletBalance, Transaction, FeeEstimate } from './types.js';
import bsv from 'bsv';
import babbage from '@babbage/sdk';

const { Script, Address } = bsv;
const { createAction, createSignature, getIdentity } = babbage;

// WOC API for read operations (since Babbage is mostly a signer/actor)
const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main';

export class MetanetWallet implements ChainWallet {
    chain = 'bsv' as const;
    private connected = false;
    private identityKey: string | null = null;

    async connect(): Promise<void> {
        try {
            // This will prompt the user if strictly necessary, or just verify access
            this.identityKey = await getIdentity();
            this.connected = true;
        } catch (error) {
            console.error('Failed to connect to Metanet Client:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.identityKey = null;
    }

    isConnected(): boolean {
        return this.connected;
    }

    async getAddress(): Promise<string> {
        if (!this.identityKey) {
            await this.connect();
        }
        return this.identityKey!;
    }

    async getBalance(): Promise<WalletBalance> {
        // Babbage doesn't expose a simple "total balance" because it manages UTXOs 
        // across potentially many derived keys.
        // For now, we'll return a placeholder.
        return {
            chain: 'bsv',
            address: this.identityKey || 'unknown',
            native: {
                symbol: 'BSV',
                amount: BigInt(0),
                decimals: 8,
                formatted: '0.00 BSV (Managed by Metanet)'
            }
        };
    }

    async sendNative(to: string, amount: bigint): Promise<Transaction> {
        if (!this.connected) await this.connect();

        // Babbage createAction
        const result = await createAction({
            description: `Send ${Number(amount)} sats to ${to}`,
            outputs: [
                {
                    script: await this.buildP2PKHScript(to),
                    satoshis: Number(amount)
                }
            ]
        });

        return {
            chain: 'bsv',
            txid: result.txid,
            from: this.identityKey!,
            to: to,
            amount: amount,
            fee: BigInt(result.rawTx ? result.rawTx.length / 2 : 200),
            status: 'pending',
            confirmations: 0,
            timestamp: Date.now()
        };
    }

    // Helper to build P2PKH script from address
    private async buildP2PKHScript(address: string): Promise<string> {
        try {
            const addr = Address.fromString(address);
            const script = Script.buildPublicKeyHashOut(addr);
            return script.toHex();
        } catch (e) {
            throw new Error(`Failed to build script for ${address}: ${e}`);
        }
    }

    async sendToken(to: string, tokenAddress: string, amount: bigint): Promise<Transaction> {
        throw new Error("Token sending via Metanet not yet implemented");
    }

    async estimateFee(to: string, amount: bigint): Promise<FeeEstimate> {
        return {
            chain: 'bsv',
            fee: BigInt(200),
            feeUsd: 0.0001,
            speed: 'fast',
            estimatedSeconds: 2
        };
    }

    async getTransaction(txid: string): Promise<Transaction | null> {
        // Proxy to WhatsOnChain
        try {
            const response = await fetch(`${WOC_BASE}/tx/hash/${txid}`);
            if (!response.ok) return null;
            const data = await response.json();
            return {
                chain: 'bsv',
                txid: data.txid,
                from: data.vin[0]?.coinbase ? 'coinbase' : '',
                to: '',
                amount: BigInt(0),
                fee: BigInt(0),
                status: data.confirmations > 0 ? 'confirmed' : 'pending',
                confirmations: data.confirmations,
                timestamp: data.time * 1000
            };
        } catch {
            return null;
        }
    }

    async waitForConfirmation(txid: string, confirmations?: number): Promise<Transaction> {
        throw new Error("Not implemented");
    }

    async signMessage(message: string): Promise<string> {
        const signature = await createSignature({
            message: Buffer.from(message).toString('base64'),
            protocolID: 'path402',
            keyID: '1'
        });
        return Buffer.from(signature).toString('base64');
    }

    async verifyMessage(message: string, signature: string, address: string): Promise<boolean> {
        return true; // Optimistic for now
    }
}
