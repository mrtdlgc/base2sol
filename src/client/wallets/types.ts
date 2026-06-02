"use client";

import type { Account, WalletClient } from "viem";
import type { KeyPairSigner } from "bridge-sdk";
import type { BridgeNetwork } from "@/lib/bridge/routes";

/** Connected MetaMask (or any EIP-1193) wallet, ready for the EVM adapter. */
export interface EvmConnection {
  address: `0x${string}`;
  walletClient: WalletClient;
  /** Address string used as the viem JSON-RPC account. */
  account: Account | `0x${string}`;
  network: BridgeNetwork;
}

/** Connected Phantom wallet exposing a @solana/kit-compatible signer. */
export interface SolanaConnection {
  address: string;
  provider: PhantomProvider;
  /**
   * A @solana/kit TransactionPartialSigner backed by Phantom. Typed as
   * KeyPairSigner to satisfy the SDK adapter config; at runtime the SDK only
   * uses `.address` and `.signTransactions`, both of which this provides.
   */
  signer: KeyPairSigner;
}

/** Minimal EIP-1193 provider shape (MetaMask). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
}

/** Minimal Phantom provider shape. */
export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  // Accepts/returns a @solana/web3.js (Versioned)Transaction.
  signTransaction<T>(tx: T): Promise<T>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}
