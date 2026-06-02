import {
  address as solAddress,
  createSolanaRpc,
  getBase58Encoder,
  type Address as SolAddress,
} from "@solana/kit";
import { bytesToHex, type Hash } from "viem";
import {
  getWrapTokenInstructionDataDecoder,
  WRAP_TOKEN_DISCRIMINATOR,
} from "../clients/ts/src/bridge";
import { DEFAULT_BRIDGE_DEPLOYMENTS } from "./protocol/deployments";
import { buildEvmIncomingMessage } from "./protocol/encoding";
import { DEFAULT_EVM_GAS_LIMIT } from "./protocol/engines/constants";
import { fetchOutgoingMessage } from "../clients/ts/src/bridge";
import type { BridgeRoute, MessageRef } from "./types";

const SOURCE_ID_SCHEME = "solana:outgoingMessagePda" as const;
const DESTINATION_ID_SCHEME = "evm:bridgeOuterHash" as const;

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface SolanaJsonInstruction {
  programIdIndex?: number;
  programId?: string;
  accounts?: Array<number | string>;
  data?: string;
}

interface SolanaJsonTransaction {
  meta?: {
    err?: unknown;
    loadedAddresses?: {
      writable?: string[];
      readonly?: string[];
    };
  };
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey: string }>;
      instructions?: SolanaJsonInstruction[];
    };
  };
}

export interface RecoverWrapTokenRegistrationInput {
  rpcUrl: string;
  route: BridgeRoute;
  signature: string;
  gasLimit?: bigint | number | string;
  bridgeProgram?: string;
}

export interface RecoveredWrapTokenRegistration {
  messageRef: MessageRef;
  initiationTx: string;
  mint: string;
  baseToken: `0x${string}`;
  name: string;
  symbol: string;
  baseDecimals: number;
  solanaDecimals: number;
  scalerExponent: number;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeGasLimit(value: RecoverWrapTokenRegistrationInput["gasLimit"]): bigint {
  if (value === undefined) return DEFAULT_EVM_GAS_LIMIT;
  return typeof value === "bigint" ? value : BigInt(value);
}

function keyToString(key: string | { pubkey: string }): string {
  return typeof key === "string" ? key : key.pubkey;
}

function accountKeys(tx: SolanaJsonTransaction): string[] {
  const messageKeys = tx.transaction?.message?.accountKeys?.map(keyToString) ?? [];
  const loaded = tx.meta?.loadedAddresses;
  return [
    ...messageKeys,
    ...(loaded?.writable ?? []),
    ...(loaded?.readonly ?? []),
  ];
}

function instructionAccounts(ix: SolanaJsonInstruction, keys: string[]): string[] {
  return (ix.accounts ?? []).map((account) => {
    if (typeof account === "string") return account;
    const resolved = keys[account];
    if (!resolved) throw new Error(`Transaction instruction references unknown account index ${account}.`);
    return resolved;
  });
}

async function rpcPost<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`Solana RPC ${method} failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) {
    throw new Error(`Solana RPC ${method} failed: ${payload.error.message}`);
  }
  return payload.result as T;
}

function bridgeProgramForRoute(input: RecoverWrapTokenRegistrationInput): SolAddress {
  if (input.bridgeProgram) return solAddress(input.bridgeProgram);
  const deployment = DEFAULT_BRIDGE_DEPLOYMENTS?.solana?.[input.route.sourceChain];
  if (!deployment) {
    throw new Error(`No Solana bridge deployment configured for ${input.route.sourceChain}.`);
  }
  return deployment.bridgeProgram;
}

function findWrapTokenInstruction(
  tx: SolanaJsonTransaction,
  bridgeProgram: string,
) {
  const keys = accountKeys(tx);
  const instructions = tx.transaction?.message?.instructions ?? [];
  const base58 = getBase58Encoder();
  const decoder = getWrapTokenInstructionDataDecoder();

  for (const ix of instructions) {
    const programId =
      ix.programId ?? (ix.programIdIndex !== undefined ? keys[ix.programIdIndex] : undefined);
    if (programId !== bridgeProgram || !ix.data) continue;

    const data = base58.encode(ix.data);
    if (!sameBytes(data.slice(0, WRAP_TOKEN_DISCRIMINATOR.length), WRAP_TOKEN_DISCRIMINATOR)) {
      continue;
    }

    const accounts = instructionAccounts(ix, keys);
    if (!accounts[2] || !accounts[4]) {
      throw new Error("wrapToken instruction is missing the mint or outgoing-message account.");
    }

    return {
      accounts,
      data: decoder.decode(data),
    };
  }

  throw new Error("Could not find a wrapToken instruction in that Solana transaction.");
}

export async function recoverWrapTokenRegistration(
  input: RecoverWrapTokenRegistrationInput,
): Promise<RecoveredWrapTokenRegistration> {
  const signature = input.signature.trim();
  if (!signature) throw new Error("Enter a Solana transaction signature.");
  if (!input.route.sourceChain.startsWith("solana:")) {
    throw new Error("Wrapped-token registration recovery only supports Solana -> Base routes.");
  }

  const bridgeProgram = bridgeProgramForRoute(input);
  const tx = await rpcPost<SolanaJsonTransaction | null>(input.rpcUrl, "getTransaction", [
    signature,
    {
      commitment: "confirmed",
      encoding: "json",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!tx) {
    throw new Error("Solana transaction was not found on this RPC.");
  }
  if (tx.meta?.err) {
    throw new Error(`Solana transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const parsed = findWrapTokenInstruction(tx, bridgeProgram);
  const outgoingPda = parsed.accounts[4];
  const gasLimit = normalizeGasLimit(input.gasLimit);
  const rpc = createSolanaRpc(input.rpcUrl);
  const outgoing = await fetchOutgoingMessage(rpc, solAddress(outgoingPda));
  const { outerHash } = buildEvmIncomingMessage(outgoing, { gasLimit });
  const solanaDecimals = parsed.data.decimals;
  const scalerExponent = parsed.data.scalerExponent;

  return {
    messageRef: {
      route: input.route,
      source: {
        chain: input.route.sourceChain,
        id: { scheme: SOURCE_ID_SCHEME, value: outgoingPda },
      },
      destination: {
        chain: input.route.destinationChain,
        id: { scheme: DESTINATION_ID_SCHEME, value: outerHash as Hash },
      },
      derived: { gasLimit: gasLimit.toString() },
    },
    initiationTx: signature,
    mint: parsed.accounts[2],
    baseToken: bytesToHex(parsed.data.remoteToken) as `0x${string}`,
    name: parsed.data.name,
    symbol: parsed.data.symbol,
    baseDecimals: solanaDecimals + scalerExponent,
    solanaDecimals,
    scalerExponent,
  };
}
