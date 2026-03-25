/**
 * BSV Wallet — Implementation moved to private repo for security.
 * Only the type stub remains here for compilation.
 */

import { ChainWallet, WalletBalance, Transaction, FeeEstimate, BSVUtxo, BSV20Token } from './types.js';

const MOVED = 'BSVWallet implementation moved to private repo (Claw-Miner-App)';

export class BSVWallet implements ChainWallet {
  chain = 'bsv' as const;
  constructor(_wif?: string) { throw new Error(MOVED); }
  connect(): Promise<void> { throw new Error(MOVED); }
  disconnect(): Promise<void> { throw new Error(MOVED); }
  isConnected(): boolean { throw new Error(MOVED); }
  getAddress(): Promise<string> { throw new Error(MOVED); }
  getBalance(): Promise<WalletBalance> { throw new Error(MOVED); }
  sendNative(_to: string, _amount: bigint): Promise<Transaction> { throw new Error(MOVED); }
  sendToken(_to: string, _addr: string, _amount: bigint): Promise<Transaction> { throw new Error(MOVED); }
  estimateFee(_to: string, _amount: bigint): Promise<FeeEstimate> { throw new Error(MOVED); }
  getTransaction(_txid: string): Promise<Transaction | null> { throw new Error(MOVED); }
  waitForConfirmation(_txid: string, _c?: number): Promise<Transaction> { throw new Error(MOVED); }
  signMessage(_msg: string): Promise<string> { throw new Error(MOVED); }
  verifyMessage(_msg: string, _sig: string, _addr: string): Promise<boolean> { throw new Error(MOVED); }
}
