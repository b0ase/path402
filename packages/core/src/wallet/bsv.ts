/**
 * BSV Wallet Implementation
 *
 * The primary wallet for $402 protocol.
 * Handles micropayments, BSV-20 tokens, and inscriptions.
 *
 * Uses bsv v2 (MoneyButton) for all crypto operations:
 * - PrivKey / PubKey / Address for key management
 * - TxBuilder for transaction construction + signing
 * - Ecdsa for message signing/verification
 * - WhatsOnChain API for balance, UTXOs, and broadcast
 */

import {
  ChainWallet,
  WalletBalance,
  Transaction,
  FeeEstimate,
  BSVUtxo,
  BSV20Token
} from './types.js';
import bsv from 'bsv';

// ── Constants ──────────────────────────────────────────────────────

const SATS_PER_BSV = 100_000_000;
const DEFAULT_FEE_PER_KB = 500; // sats per KB (~0.5 sat/byte)
const DUST_LIMIT = 1; // 1 satoshi minimum output

// WhatsOnChain API
const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main';

// BSV price cache (avoid hammering CoinGecko)
let cachedBsvPrice: { price: number; timestamp: number } | null = null;
const PRICE_CACHE_MS = 5 * 60 * 1000; // 5 minutes

// ── BSV Wallet ─────────────────────────────────────────────────────

export class BSVWallet implements ChainWallet {
  chain = 'bsv' as const;
  private privKey: any = null;      // bsv.PrivKey
  private pubKey: any = null;       // bsv.PubKey
  private bsvAddress: any = null;   // bsv.Address
  private address: string | null = null;
  private connected = false;

  constructor(privateKeyWif?: string) {
    if (privateKeyWif) {
      this.importKey(privateKeyWif);
    }
  }

  // ── Key Management ─────────────────────────────────────────────

  /**
   * Generate a new random key pair
   */
  async generateKey(): Promise<{ privateKey: string; address: string }> {
    this.privKey = bsv.PrivKey.fromRandom();
    this.pubKey = bsv.PubKey.fromPrivKey(this.privKey);
    this.bsvAddress = bsv.Address.fromPubKey(this.pubKey);
    this.address = this.bsvAddress.toString();
    this.connected = true;

    return { privateKey: this.privKey.toWif(), address: this.address! };
  }

  /**
   * Import existing private key (WIF format)
   */
  importKey(privateKeyWif: string): void {
    try {
      this.privKey = bsv.PrivKey.fromWif(privateKeyWif);
      this.pubKey = bsv.PubKey.fromPrivKey(this.privKey);
      this.bsvAddress = bsv.Address.fromPubKey(this.pubKey);
      this.address = this.bsvAddress.toString();
      this.connected = true;
    } catch (err) {
      throw new Error(`Invalid WIF private key: ${err}`);
    }
  }

  // ── ChainWallet Interface ──────────────────────────────────────

  async connect(): Promise<void> {
    if (!this.privKey) {
      await this.generateKey();
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAddress(): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }
    return this.address;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.address) {
      throw new Error('Wallet not connected');
    }

    const balance = await this.fetchBalance(this.address);

    return {
      chain: 'bsv',
      address: this.address,
      native: {
        symbol: 'BSV',
        amount: BigInt(balance),
        decimals: 8,
        formatted: (balance / SATS_PER_BSV).toFixed(8) + ' BSV'
      }
    };
  }

  async sendNative(to: string, amount: bigint): Promise<Transaction> {
    this.ensureConnected();

    const utxos = await this.fetchUtxos(this.address!);
    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    const toAddr = bsv.Address.fromString(to);
    const satoshis = Number(amount);

    // Build, sign, and serialize
    const txHex = this.buildP2PKHTx(utxos, toAddr, satoshis);

    // Broadcast to network
    const txid = await this.broadcastTransaction(txHex);

    return {
      chain: 'bsv',
      txid,
      from: this.address!,
      to,
      amount,
      fee: BigInt(this.estimateFeeForBytes(txHex.length / 2)),
      status: 'pending',
      confirmations: 0,
      timestamp: Date.now()
    };
  }

  async sendToken(to: string, tokenTick: string, amount: bigint): Promise<Transaction> {
    this.ensureConnected();

    const utxos = await this.fetchUtxos(this.address!);
    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    // Build BSV-20 transfer inscription
    const transferData = JSON.stringify({
      p: 'bsv-20',
      op: 'transfer',
      tick: tokenTick,
      amt: amount.toString()
    });

    const toAddr = bsv.Address.fromString(to);
    const txHex = this.buildInscriptionTx(utxos, toAddr, DUST_LIMIT, transferData);
    const txid = await this.broadcastTransaction(txHex);

    return {
      chain: 'bsv',
      txid,
      from: this.address!,
      to,
      amount: BigInt(0),
      fee: BigInt(this.estimateFeeForBytes(txHex.length / 2)),
      status: 'pending',
      confirmations: 0,
      timestamp: Date.now(),
      token: {
        symbol: tokenTick,
        amount,
        decimals: 8
      }
    };
  }

  async estimateFee(to: string, amount: bigint): Promise<FeeEstimate> {
    // Typical P2PKH tx is ~250 bytes
    const estimatedSize = 250;
    const fee = Math.ceil(estimatedSize * DEFAULT_FEE_PER_KB / 1000);

    const bsvPrice = await this.getBsvPriceUsd();
    const feeUsd = (fee / SATS_PER_BSV) * bsvPrice;

    return {
      chain: 'bsv',
      fee: BigInt(fee),
      feeUsd,
      speed: 'fast',
      estimatedSeconds: 600
    };
  }

  async getTransaction(txid: string): Promise<Transaction | null> {
    try {
      const response = await fetch(`${WOC_BASE}/tx/hash/${txid}`);
      if (!response.ok) return null;

      const data = await response.json();

      return {
        chain: 'bsv',
        txid: data.txid,
        from: data.vin[0]?.addresses?.[0] || '',
        to: data.vout[0]?.addresses?.[0] || '',
        amount: BigInt(data.vout[0]?.value || 0),
        fee: BigInt(data.fee || 0),
        status: data.confirmations > 0 ? 'confirmed' : 'pending',
        confirmations: data.confirmations || 0,
        timestamp: data.time * 1000
      };
    } catch {
      return null;
    }
  }

  async waitForConfirmation(txid: string, confirmations = 1): Promise<Transaction> {
    const maxAttempts = 60; // 10 minutes with 10s intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      const tx = await this.getTransaction(txid);
      if (tx && tx.confirmations >= confirmations) {
        return tx;
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    }

    throw new Error(`Transaction ${txid} not confirmed after ${maxAttempts * 10}s`);
  }

  async signMessage(message: string): Promise<string> {
    this.ensureConnected();

    const hash = bsv.Hash.sha256(Buffer.from(message));
    const keyPair = (bsv as any).KeyPair.fromPrivKey(this.privKey);
    const sig = bsv.Ecdsa.sign(hash, keyPair);
    return sig.toString();
  }

  async verifyMessage(message: string, signature: string, pubKeyStr: string): Promise<boolean> {
    try {
      const hash = bsv.Hash.sha256(Buffer.from(message));
      const sig = bsv.Sig.fromString(signature);
      const pubKey = bsv.PubKey.fromString(pubKeyStr);
      return bsv.Ecdsa.verify(hash, sig, pubKey);
    } catch {
      return false;
    }
  }

  // ── BSV-Specific Methods ───────────────────────────────────────

  /**
   * Get BSV-20 token balances (requires external indexer)
   */
  async getBSV20Balances(): Promise<BSV20Token[]> {
    if (!this.address) return [];
    // Would query a BSV-20 indexer (1satordinals.com or custom)
    return [];
  }

  /**
   * Create a BSV-20 mint inscription
   */
  async mintBSV20(tick: string, amount: bigint): Promise<Transaction> {
    this.ensureConnected();

    const mintData = JSON.stringify({
      p: 'bsv-20',
      op: 'mint',
      tick,
      amt: amount.toString()
    });

    const utxos = await this.fetchUtxos(this.address!);
    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    // Mint inscription goes to self
    const txHex = this.buildInscriptionTx(utxos, this.bsvAddress, DUST_LIMIT, mintData);
    const txid = await this.broadcastTransaction(txHex);

    return {
      chain: 'bsv',
      txid,
      from: this.address!,
      to: this.address!,
      amount: BigInt(0),
      fee: BigInt(this.estimateFeeForBytes(txHex.length / 2)),
      status: 'pending',
      confirmations: 0,
      timestamp: Date.now(),
      token: { symbol: tick, amount, decimals: 8 }
    };
  }

  /**
   * Create content inscription (ordinals-style envelope)
   */
  async inscribeContent(content: Buffer, contentType: string): Promise<string> {
    this.ensureConnected();

    const utxos = await this.fetchUtxos(this.address!);
    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    // Build ordinals envelope: OP_FALSE OP_IF "ord" ... content ... OP_ENDIF
    const envelopeScript = this.buildOrdEnvelopeScript(content, contentType);

    const txHex = this.buildDataScriptTx(utxos, this.bsvAddress, DUST_LIMIT, envelopeScript);
    const txid = await this.broadcastTransaction(txHex);

    return txid;
  }

  /**
   * Get the public key as a string (for verification by others)
   */
  getPublicKeyString(): string {
    if (!this.pubKey) throw new Error('Wallet not connected');
    return this.pubKey.toString();
  }

  // ── Private: Transaction Building ──────────────────────────────

  private ensureConnected(): void {
    if (!this.privKey || !this.address || !this.bsvAddress) {
      throw new Error('Wallet not connected');
    }
  }

  /**
   * Build and sign a P2PKH send transaction using TxBuilder.
   * Adds all UTXOs as inputs, sends `satoshis` to `toAddr`,
   * remainder goes to change address (self).
   */
  private buildP2PKHTx(utxos: BSVUtxo[], toAddr: any, satoshis: number): string {
    const txb = new (bsv as any).TxBuilder();
    txb.setFeePerKbNum(DEFAULT_FEE_PER_KB);
    txb.setChangeAddress(this.bsvAddress);

    // Our locking script (all UTXOs are P2PKH to our address)
    const lockingScript = (bsv as any).Script.fromPubKeyHash(this.bsvAddress.hashBuf);

    for (const utxo of utxos) {
      const txHashBuf = Buffer.from(utxo.txid, 'hex').reverse();
      const txOut = (bsv as any).TxOut.fromProperties(
        new (bsv as any).Bn(utxo.satoshis),
        lockingScript
      );
      txb.inputFromPubKeyHash(txHashBuf, utxo.vout, txOut);
    }

    txb.outputToAddress(new (bsv as any).Bn(satoshis), toAddr);

    txb.build({ useAllInputs: true });
    const keyPair = (bsv as any).KeyPair.fromPrivKey(this.privKey);
    txb.signWithKeyPairs([keyPair]);

    return txb.tx.toHex();
  }

  /**
   * Build and sign a transaction with an OP_RETURN data output.
   * Used for BSV-20 mint/transfer inscriptions.
   *
   * Outputs:
   *   1. Dust to recipient (P2PKH)
   *   2. OP_FALSE OP_RETURN <data> (0 sats)
   *   3. Change to self (P2PKH, auto by TxBuilder)
   */
  private buildInscriptionTx(
    utxos: BSVUtxo[],
    toAddr: any,
    dustAmount: number,
    data: string
  ): string {
    const dataScript = new (bsv as any).Script();
    dataScript.writeOpCode((bsv as any).OpCode.OP_FALSE);
    dataScript.writeOpCode((bsv as any).OpCode.OP_RETURN);
    dataScript.writeBuffer(Buffer.from(data));

    return this.buildDataScriptTx(utxos, toAddr, dustAmount, dataScript);
  }

  /**
   * Build and sign a transaction with an arbitrary script data output.
   * Used for content inscriptions (ordinals envelopes) and other data.
   *
   * Outputs:
   *   1. Dust to recipient (P2PKH)
   *   2. Data script output (0 sats)
   *   3. Change to self (P2PKH, auto by TxBuilder)
   */
  private buildDataScriptTx(
    utxos: BSVUtxo[],
    toAddr: any,
    dustAmount: number,
    dataScript: any
  ): string {
    const txb = new (bsv as any).TxBuilder();
    txb.setFeePerKbNum(DEFAULT_FEE_PER_KB);
    txb.setChangeAddress(this.bsvAddress);
    txb.setDust(0); // Allow 0-sat OP_RETURN outputs

    const lockingScript = (bsv as any).Script.fromPubKeyHash(this.bsvAddress.hashBuf);

    for (const utxo of utxos) {
      const txHashBuf = Buffer.from(utxo.txid, 'hex').reverse();
      const txOut = (bsv as any).TxOut.fromProperties(
        new (bsv as any).Bn(utxo.satoshis),
        lockingScript
      );
      txb.inputFromPubKeyHash(txHashBuf, utxo.vout, txOut);
    }

    // Dust output to recipient
    if (dustAmount > 0) {
      txb.outputToAddress(new (bsv as any).Bn(dustAmount), toAddr);
    }

    // Data output (0 sats)
    txb.outputToScript(new (bsv as any).Bn(0), dataScript);

    txb.build({ useAllInputs: true });
    const keyPair = (bsv as any).KeyPair.fromPrivKey(this.privKey);
    txb.signWithKeyPairs([keyPair]);

    return txb.tx.toHex();
  }

  /**
   * Build ordinals inscription envelope script:
   *   OP_FALSE OP_IF
   *     PUSH "ord"
   *     PUSH 0x01 (content-type tag)
   *     PUSH <contentType>
   *     PUSH 0x00 (body tag)
   *     PUSH <content>
   *   OP_ENDIF
   */
  private buildOrdEnvelopeScript(content: Buffer, contentType: string): any {
    const script = new (bsv as any).Script();
    script.writeOpCode((bsv as any).OpCode.OP_FALSE);
    script.writeOpCode((bsv as any).OpCode.OP_IF);
    script.writeBuffer(Buffer.from('ord'));
    script.writeBuffer(Buffer.from([0x01]));
    script.writeBuffer(Buffer.from(contentType));
    script.writeBuffer(Buffer.alloc(0)); // 0x00 body tag (empty push = OP_0)
    script.writeBuffer(content);
    script.writeOpCode((bsv as any).OpCode.OP_ENDIF);
    return script;
  }

  // ── Private: Network ───────────────────────────────────────────

  private async fetchBalance(address: string): Promise<number> {
    try {
      const response = await fetch(`${WOC_BASE}/address/${address}/balance`);
      if (!response.ok) throw new Error('Failed to fetch balance');
      const data = await response.json();
      return data.confirmed + data.unconfirmed;
    } catch {
      return 0;
    }
  }

  private async fetchUtxos(address: string): Promise<BSVUtxo[]> {
    try {
      const response = await fetch(`${WOC_BASE}/address/${address}/unspent`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.map((u: { tx_hash: string; tx_pos: number; value: number }) => ({
        txid: u.tx_hash,
        vout: u.tx_pos,
        satoshis: u.value,
        script: '' // WoC unspent endpoint doesn't return scripts; we derive from address
      }));
    } catch {
      return [];
    }
  }

  private async broadcastTransaction(txHex: string): Promise<string> {
    const response = await fetch(`${WOC_BASE}/tx/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txhex: txHex })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Broadcast failed: ${errorText}`);
    }

    const txid = await response.text();
    return txid.replace(/"/g, '').trim();
  }

  private async getBsvPriceUsd(): Promise<number> {
    if (cachedBsvPrice && Date.now() - cachedBsvPrice.timestamp < PRICE_CACHE_MS) {
      return cachedBsvPrice.price;
    }

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash-sv&vs_currencies=usd'
      );
      if (!response.ok) throw new Error('Price fetch failed');
      const data = await response.json();
      const price = data['bitcoin-cash-sv']?.usd;
      if (price && typeof price === 'number') {
        cachedBsvPrice = { price, timestamp: Date.now() };
        return price;
      }
      throw new Error('Invalid price data');
    } catch {
      return cachedBsvPrice?.price || 50;
    }
  }

  private estimateFeeForBytes(bytes: number): number {
    return Math.ceil(bytes * DEFAULT_FEE_PER_KB / 1000);
  }
}
