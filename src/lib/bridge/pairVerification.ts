import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, isAddress, parseAbi, type Hex } from "viem";
import { base as viemBase, baseSepolia as viemBaseSepolia } from "viem/chains";
import { SOLANA_NATIVE_SOL_SENTINEL } from "@/lib/bridge/constants";
import { BRIDGE_NETWORKS } from "@/lib/bridge/networks";
import { TOKEN_PRESETS } from "@/lib/bridge/presets";
import type { BridgeNetwork } from "@/lib/bridge/routes";

const ERC20_METADATA_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const BRIDGE_SCALAR_ABI = parseAbi([
  "function scalars(address localToken, bytes32 remoteToken) view returns (uint256)",
]);

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const BASE_MAINNET_RPC_FALLBACKS = ["https://base-rpc.publicnode.com", "https://1rpc.io/base"];
const MINT_LAYOUT_MIN_LENGTH = 82;

export interface PairVerificationInput {
  network: BridgeNetwork;
  baseRpc: string;
  solanaRpc: string;
  baseToken: string;
  solanaMint: string;
  scalarRequired: boolean;
}

export interface PairVerificationResult {
  checkedAt: number;
  knownPairLabel?: string;
  base: {
    address: string;
    ok: boolean;
    name?: string;
    symbol?: string;
    decimals?: number;
    error?: string;
  };
  solana: {
    mint: string;
    ok: boolean;
    nativeSol: boolean;
    program?: "Token" | "Token-2022";
    decimals?: number;
    supply?: string;
    initialized?: boolean;
    error?: string;
  };
  bridge: {
    checked: boolean;
    scalarRequired: boolean;
    registered?: boolean;
    scalar?: string;
    expectedScalar?: string;
    scalarMatchesDecimals?: boolean;
    error?: string;
  };
  summary: {
    tone: "success" | "warn" | "error";
    title: string;
    detail: string;
  };
}

function normalizeRpcUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function rpcCandidates(network: BridgeNetwork, baseRpc: string): string[] {
  const candidates = [
    baseRpc,
    ...(network === "mainnet" ? BASE_MAINNET_RPC_FALLBACKS : []),
  ];
  const seen = new Set<string>();
  return candidates
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizeRpcUrl(value);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function shortError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const firstLine = message.split("\n")[0] || message;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function basePublicClient(network: BridgeNetwork, rpcUrl: string) {
  return createPublicClient({
    chain: network === "testnet" ? viemBaseSepolia : viemBase,
    transport: http(rpcUrl, { retryCount: 0, timeout: 8_000 }),
  });
}

function bytes32FromSolanaAddress(value: string): Hex {
  const bytes = new PublicKey(value).toBytes();
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function readU64LE(data: Buffer, offset: number): bigint {
  let out = 0n;
  for (let i = 0; i < 8; i += 1) {
    out |= BigInt(data[offset + i] ?? 0) << BigInt(i * 8);
  }
  return out;
}

function expectedScalar(baseDecimals?: number, solanaDecimals?: number): string | undefined {
  if (baseDecimals === undefined || solanaDecimals === undefined) return undefined;
  if (baseDecimals < solanaDecimals) return undefined;
  return (10n ** BigInt(baseDecimals - solanaDecimals)).toString();
}

async function readBaseMetadata(input: PairVerificationInput): Promise<PairVerificationResult["base"]> {
  const address = input.baseToken.trim();
  if (!isAddress(address)) {
    return { address, ok: false, error: "Invalid Base ERC20 address." };
  }

  const errors: string[] = [];
  for (const rpcUrl of rpcCandidates(input.network, input.baseRpc)) {
    const client = basePublicClient(input.network, rpcUrl);
    try {
      const tokenDecimals = await client.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals",
      });
      const [name, symbol] = await Promise.all([
        client
          .readContract({ address, abi: ERC20_METADATA_ABI, functionName: "name" })
          .then((value) => value as string)
          .catch(() => undefined),
        client
          .readContract({ address, abi: ERC20_METADATA_ABI, functionName: "symbol" })
          .then((value) => value as string)
          .catch(() => undefined),
      ]);

      return {
        address,
        ok: true,
        name,
        symbol,
        decimals: Number(tokenDecimals),
      };
    } catch (e) {
      errors.push(`${rpcUrl}: ${shortError(e)}`);
    }
  }

  return {
    address,
    ok: false,
    error: errors.join(" | ") || "Could not read ERC20 metadata.",
  };
}

async function readSolanaMint(input: PairVerificationInput): Promise<PairVerificationResult["solana"]> {
  const mint = input.solanaMint.trim();
  if (mint === SOLANA_NATIVE_SOL_SENTINEL) {
    return {
      mint,
      ok: true,
      nativeSol: true,
      decimals: 9,
      initialized: true,
    };
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(mint);
  } catch {
    return { mint, ok: false, nativeSol: false, error: "Invalid Solana mint address." };
  }

  try {
    const connection = new Connection(input.solanaRpc, "confirmed");
    const account = await connection.getAccountInfo(pubkey, "confirmed");
    if (!account) {
      return { mint, ok: false, nativeSol: false, error: "Solana mint account was not found." };
    }

    let program: "Token" | "Token-2022";
    if (account.owner.equals(TOKEN_PROGRAM_ID)) {
      program = "Token";
    } else if (account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      program = "Token-2022";
    } else {
      return {
        mint,
        ok: false,
        nativeSol: false,
        error: `Account is owned by ${account.owner.toBase58()}, not a Solana token program.`,
      };
    }

    if (account.data.length < MINT_LAYOUT_MIN_LENGTH) {
      return {
        mint,
        ok: false,
        nativeSol: false,
        program,
        error: `Mint account data is too short (${account.data.length} bytes).`,
      };
    }

    return {
      mint,
      ok: true,
      nativeSol: false,
      program,
      decimals: account.data[44],
      supply: readU64LE(account.data, 36).toString(),
      initialized: account.data[45] !== 0,
    };
  } catch (e) {
    return { mint, ok: false, nativeSol: false, error: shortError(e) };
  }
}

async function readBridgeScalar(
  input: PairVerificationInput,
  baseOk: boolean,
  solanaOk: boolean
): Promise<PairVerificationResult["bridge"]> {
  if (!baseOk || !solanaOk) {
    return {
      checked: false,
      scalarRequired: input.scalarRequired,
      error: "Skipped until both token addresses resolve.",
    };
  }

  const errors: string[] = [];
  for (const rpcUrl of rpcCandidates(input.network, input.baseRpc)) {
    const client = basePublicClient(input.network, rpcUrl);
    try {
      const scalar = await client.readContract({
        address: BRIDGE_NETWORKS[input.network].baseBridgeContract,
        abi: BRIDGE_SCALAR_ABI,
        functionName: "scalars",
        args: [input.baseToken as `0x${string}`, bytes32FromSolanaAddress(input.solanaMint)],
      });
      const scalarText = scalar.toString();
      return {
        checked: true,
        scalarRequired: input.scalarRequired,
        registered: scalar > 0n,
        scalar: scalarText,
      };
    } catch (e) {
      errors.push(`${rpcUrl}: ${shortError(e)}`);
    }
  }

  return {
    checked: false,
    scalarRequired: input.scalarRequired,
    error: errors.join(" | ") || "Could not read bridge scalar.",
  };
}

function knownPairLabel(input: PairVerificationInput): string | undefined {
  if (input.network !== "mainnet") return undefined;
  const baseToken = input.baseToken.trim().toLowerCase();
  const solanaMint = input.solanaMint.trim();
  return TOKEN_PRESETS.find(
    (preset) =>
      preset.baseErc20.toLowerCase() === baseToken &&
      preset.solanaMint === solanaMint
  )?.label;
}

function summarize(result: Omit<PairVerificationResult, "summary">): PairVerificationResult["summary"] {
  if (!result.base.ok || !result.solana.ok) {
    return {
      tone: "error",
      title: "Token metadata check failed",
      detail: "Fix the Base token or Solana mint address before signing.",
    };
  }

  if (result.bridge.scalarRequired && result.bridge.checked && !result.bridge.registered) {
    return {
      tone: "error",
      title: "Pair is not registered with the Base bridge",
      detail: "This native Base token pair cannot bridge until registration executes on Base.",
    };
  }

  if (result.bridge.scalarMatchesDecimals === false) {
    return {
      tone: "warn",
      title: "Bridge scalar differs from token decimals",
      detail: "The pair is registered, but the bridge scalar does not match the simple decimal difference. Review carefully.",
    };
  }

  if (!result.bridge.checked) {
    return {
      tone: result.bridge.scalarRequired ? "warn" : "success",
      title: result.bridge.scalarRequired ? "Metadata fetched, scalar not confirmed" : "Metadata fetched",
      detail: result.bridge.error ?? "The bridge scalar could not be read from the current RPC.",
    };
  }

  if (result.bridge.registered) {
    return {
      tone: result.knownPairLabel ? "success" : "warn",
      title: result.knownPairLabel
        ? `Known pair: ${result.knownPairLabel}`
        : "Bridge registration found, pair is not in known presets",
      detail: result.knownPairLabel
        ? "This pair matches the app's known-pair list. Still verify addresses before signing."
        : "The bridge recognizes this mapping, but base2sol has not listed it as a known pair.",
    };
  }

  return {
    tone: "warn",
    title: "Metadata fetched, no scalar registered",
    detail: "That can be normal for bridge-wrapped Solana assets, but it is not a native Base-token registration.",
  };
}

export async function verifyTokenPair(input: PairVerificationInput): Promise<PairVerificationResult> {
  const [baseDetails, solanaDetails] = await Promise.all([
    readBaseMetadata(input),
    readSolanaMint(input),
  ]);
  const bridge = await readBridgeScalar(input, baseDetails.ok, solanaDetails.ok);
  const expected = expectedScalar(baseDetails.decimals, solanaDetails.decimals);
  const bridgeWithExpected = {
    ...bridge,
    expectedScalar: expected,
    scalarMatchesDecimals:
      bridge.scalar && expected ? bridge.scalar === expected : undefined,
  };
  const result = {
    checkedAt: Date.now(),
    knownPairLabel: knownPairLabel(input),
    base: baseDetails,
    solana: solanaDetails,
    bridge: bridgeWithExpected,
  };
  return {
    ...result,
    summary: summarize(result),
  };
}
