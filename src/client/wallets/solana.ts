"use client";

import { VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import {
  address as toKitAddress,
  getTransactionDecoder,
  signatureBytes,
  type SignatureBytes,
  type Transaction,
} from "@solana/kit";
import type { KeyPairSigner } from "bridge-sdk";
import type { PhantomProvider, SolanaConnection } from "./types";

function pickPhantom(): PhantomProvider {
  const p =
    (typeof window !== "undefined" && (window.phantom?.solana ?? window.solana)) || undefined;
  if (!p || !p.isPhantom) throw new Error("Phantom wallet not found. Install Phantom.");
  return p;
}

function isZeroSignature(signature: Uint8Array): boolean {
  return signature.every((byte) => byte === 0);
}

async function signWithPhantom(
  provider: PhantomProvider,
  tx: Transaction,
  base58: string,
  kitAddress: ReturnType<typeof toKitAddress>
) {
  const active = provider.publicKey?.toBase58();
  if (active && active !== base58) {
    throw new Error(
      `Phantom active account changed from ${base58} to ${active}. Disconnect and reconnect Phantom.`
    );
  }

  const bytes = new Uint8Array(tx.messageBytes as unknown as Uint8Array);
  const message = VersionedMessage.deserialize(bytes);
  const vtx = new VersionedTransaction(message);

  const signed = await provider.signTransaction(vtx);
  const decoded = getTransactionDecoder().decode(signed.serialize());
  const rawSignature = decoded.signatures[kitAddress];

  if (!rawSignature || rawSignature.length !== 64 || isZeroSignature(rawSignature)) {
    throw new Error("Phantom did not return a valid signature for the fee payer.");
  }

  return {
    signedTransaction: Object.freeze({
      ...tx,
      messageBytes: decoded.messageBytes,
      signatures: decoded.signatures,
    }),
    signature: signatureBytes(new Uint8Array(rawSignature)),
  };
}

/**
 * Build @solana/kit transaction signer methods backed by Phantom.
 *
 * The SDK's Solana engine compiles a transaction message and calls signer
 * methods with kit `Transaction` objects (which carry `messageBytes`).
 * Phantom signs a @solana/web3.js `VersionedTransaction`, so for each tx we:
 *   1. deserialize `messageBytes` into a web3.js VersionedMessage/Transaction,
 *   2. ask Phantom to sign it,
 *   3. decode Phantom's signed wire transaction back into a kit transaction.
 *
 * Returning the full signed transaction via `modifyAndSignTransactions` avoids a
 * subtle browser-wallet edge case where the wallet mutates the versioned
 * transaction while signing; in that case a partial signature over the mutated
 * bytes would not verify against the original kit message bytes.
 *
 * NOTE: this is the trickiest integration point and cannot be unit-tested here.
 * Verify against a tiny real transfer before trusting it with value.
 */
export async function connectPhantom(): Promise<SolanaConnection> {
  const provider = pickPhantom();
  const { publicKey } = await provider.connect();
  const base58 = publicKey.toBase58();
  const kitAddress = toKitAddress(base58);

  const signer = {
    address: kitAddress,
    async modifyAndSignTransactions(transactions: readonly Transaction[]): Promise<readonly Transaction[]> {
      const out: Transaction[] = [];
      for (const tx of transactions) {
        const { signedTransaction } = await signWithPhantom(provider, tx, base58, kitAddress);
        out.push(signedTransaction as Transaction);
      }
      return out;
    },
    async signTransactions(
      transactions: readonly Transaction[]
    ): Promise<readonly Record<string, SignatureBytes>[]> {
      const out: Record<string, SignatureBytes>[] = [];
      for (const tx of transactions) {
        const { signature } = await signWithPhantom(provider, tx, base58, kitAddress);
        out.push({ [kitAddress]: signature });
      }
      return out;
    },
  };

  // Typed as KeyPairSigner to satisfy the adapter config. At runtime the SDK only
  // touches `.address` and `.signTransactions`, both implemented above.
  return { address: base58, provider, signer: signer as unknown as KeyPairSigner };
}

export function getPhantomForEvents(): PhantomProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.phantom?.solana ?? window.solana;
}
