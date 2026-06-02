"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { SolanaConnection } from "./types";
import { SOLANA_NATIVE_SOL_SENTINEL } from "@/lib/bridge/constants";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ATA_CONFIRMATION_POLL_INTERVAL_MS = 1_000;
const ATA_CONFIRMATION_TIMEOUT_MS = 120_000;
const ATA_CREATION_ATTEMPTS = 2;

export interface AtaResult {
  tokenAccount: string;
  creationTx?: string;
}

export function isNativeSolSentinel(value: string): boolean {
  return value === SOLANA_NATIVE_SOL_SENTINEL;
}

export function deriveAssociatedTokenAccount(
  owner: string,
  mint: string,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): string {
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), tokenProgramId.toBuffer(), new PublicKey(mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata.toBase58();
}

export async function resolveMintTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) {
    throw new Error(`Solana mint not found: ${mint.toBase58()}`);
  }
  if (mintInfo.owner.equals(TOKEN_PROGRAM_ID) || mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return mintInfo.owner;
  }
  throw new Error(
    `Unsupported Solana token program ${mintInfo.owner.toBase58()} for mint ${mint.toBase58()}.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tokenAccountExists(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<boolean> {
  return (await connection.getAccountInfo(tokenAccount, "confirmed")) !== null;
}

async function waitForTokenAccountCreation(args: {
  connection: Connection;
  tokenAccount: PublicKey;
  signature: string;
  lastValidBlockHeight: number;
}): Promise<"confirmed" | "expired"> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= ATA_CONFIRMATION_TIMEOUT_MS) {
    if (await tokenAccountExists(args.connection, args.tokenAccount)) {
      return "confirmed";
    }

    const { value } = await args.connection.getSignatureStatuses(
      [args.signature],
      { searchTransactionHistory: true }
    );
    const status = value[0];
    if (status?.err) {
      throw new Error(`Recipient token account creation failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return "confirmed";
    }

    const currentBlockHeight = await args.connection.getBlockHeight("confirmed");
    if (currentBlockHeight > args.lastValidBlockHeight) {
      return (await tokenAccountExists(args.connection, args.tokenAccount))
        ? "confirmed"
        : "expired";
    }

    await sleep(ATA_CONFIRMATION_POLL_INTERVAL_MS);
  }

  return (await tokenAccountExists(args.connection, args.tokenAccount))
    ? "confirmed"
    : "expired";
}

export async function ensureAssociatedTokenAccount(args: {
  rpcUrl: string;
  payer: SolanaConnection;
  owner: string;
  mint: string;
}): Promise<AtaResult> {
  if (isNativeSolSentinel(args.mint)) {
    return { tokenAccount: args.owner };
  }

  const connection = new Connection(args.rpcUrl, "confirmed");
  const payer = new PublicKey(args.payer.address);
  const owner = new PublicKey(args.owner);
  const mint = new PublicKey(args.mint);
  const tokenProgramId = await resolveMintTokenProgram(connection, mint);
  const tokenAccount = new PublicKey(
    deriveAssociatedTokenAccount(args.owner, args.mint, tokenProgramId)
  );

  const existing = await connection.getAccountInfo(tokenAccount, "confirmed");
  if (existing) return { tokenAccount: tokenAccount.toBase58() };

  const ix = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });

  let lastSignature: string | undefined;
  for (let attempt = 1; attempt <= ATA_CREATION_ATTEMPTS; attempt += 1) {
    if (await tokenAccountExists(connection, tokenAccount)) {
      return { tokenAccount: tokenAccount.toBase58(), creationTx: lastSignature };
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("processed");
    const tx = new Transaction({
      feePayer: payer,
      blockhash,
      lastValidBlockHeight,
    }).add(ix);
    const signed = await args.payer.provider.signTransaction(tx);
    lastSignature = await connection.sendRawTransaction(signed.serialize(), {
      preflightCommitment: "processed",
      maxRetries: 5,
    });

    const confirmation = await waitForTokenAccountCreation({
      connection,
      tokenAccount,
      signature: lastSignature,
      lastValidBlockHeight,
    });
    if (confirmation === "confirmed") {
      return { tokenAccount: tokenAccount.toBase58(), creationTx: lastSignature };
    }
  }

  throw new Error(
    `Recipient token account creation expired before confirmation. No Base transfer was submitted. Try again; if the Solana transaction lands late, base2sol will reuse the existing token account. Last Solana tx: ${lastSignature ?? "unknown"}`
  );
}
