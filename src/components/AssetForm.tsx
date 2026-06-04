"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { address as solanaAddress } from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, isAddress as isEvmAddress, parseAbi } from "viem";
import { base as viemBase, baseSepolia as viemBaseSepolia } from "viem/chains";
import type {
  BaseWrappedTokenDeploymentRequestDTO,
  TransferRequestDTO,
  WrappedTokenDeploymentRequestDTO,
} from "@/lib/bridge/dto";
import type { BridgeNetwork, Direction } from "@/lib/bridge/routes";
import { destChainLabel, sourceChainLabel } from "@/lib/bridge/routes";
import { BASE_ETH_TOKEN_ADDRESS, SOLANA_NATIVE_SOL_SENTINEL } from "@/lib/bridge/constants";
import { BRIDGE_NETWORKS } from "@/lib/bridge/networks";
import { bytes32FromSolanaAddress } from "@/lib/bridge/solanaAddress";
import { TOKEN_PRESETS } from "@/lib/bridge/presets";
import { verifyTokenPair, type PairVerificationResult } from "@/lib/bridge/pairVerification";
import { fromBaseUnits, toBaseUnits } from "@/lib/bridge/units";
import { KNOWN_PAIR_REQUEST_URL } from "@/lib/site";
import { Field, Segmented } from "@/components/ui";

type AssetMode =
  | "base-native-erc20"
  | "base-native-eth"
  | "base-wrapped-solana"
  | "sol-native"
  | "sol-spl"
  | "sol-wrapped-base";

type ComposeMode = "transfer" | "register-base-token" | "register-solana-token";

interface Props {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  relayMode: "auto" | "manual";
  onRelayModeChange: (m: "auto" | "manual") => void;
  network: BridgeNetwork;
  baseRpc: string;
  solanaRpc: string;
  onModeChange: (mode: ComposeMode) => void;
  onTransfer: (req: TransferRequestDTO) => void;
  onDeployWrappedToken: (req: WrappedTokenDeploymentRequestDTO) => Promise<{ mint: string }>;
  onDeployBaseWrappedToken: (req: BaseWrappedTokenDeploymentRequestDTO) => Promise<{ baseToken: `0x${string}`; txHash: `0x${string}` }>;
  busy: boolean;
  deployBusy: boolean;
  gated: boolean;
  gateReason?: string;
  deployGated: boolean;
  deployGateReason?: string;
}

const ERC20_METADATA_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

const BRIDGE_DEPOSIT_ABI = parseAbi([
  "function deposits(address localToken, bytes32 remoteToken) view returns (uint256)",
]);

interface BaseTokenMetadata {
  name?: string;
  symbol?: string;
  decimals: number;
  totalSupply?: bigint;
  rpcUrl: string;
}

type MetadataStatus = {
  tone: "info" | "success" | "warn" | "error";
  text: string;
};

const BASE_MAINNET_METADATA_RPC_FALLBACKS = [
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
];
const MAX_REMOTE_UINT64 = (1n << 64n) - 1n;
const B2S_BASE_TOKEN = "0x958e84D234B4D21306A1160693Ff7f8971eDdB07";
const B2S_SOLANA_DECIMALS = 8;
const DEFAULT_SOLANA_WRAPPED_DECIMALS = 9;
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MINT_LAYOUT_MIN_LENGTH = 82;
// Token-2022 stores its extension TLV after the account-type byte at BASE_ACCOUNT_LENGTH.
const TOKEN_2022_ACCOUNT_TYPE_OFFSET = 165;
// ExtensionType discriminants (u16 LE) for the mint-level extensions we cannot bridge.
const EXT_DEFAULT_ACCOUNT_STATE = 6;
const EXT_NON_TRANSFERABLE = 9;
const EXT_TRANSFER_HOOK = 14;

interface ChunkPlan {
  chunks: string[];
  remoteTotal: bigint;
  availableRemote: bigint;
}

interface SolanaMintMetadata {
  decimals: number;
  supply: bigint;
  program: "Token" | "Token-2022";
  /** Human-readable names of Token-2022 extensions that prevent bridging. */
  blockingExtensions: string[];
}

function normalizeRpcUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function shortRpcError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const firstLine = message.split("\n")[0] || message;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function createBaseMetadataClient(network: BridgeNetwork, rpcUrl: string) {
  return createPublicClient({
    chain: network === "testnet" ? viemBaseSepolia : viemBase,
    transport: http(rpcUrl, { retryCount: 0, timeout: 8_000 }),
  });
}

function validSolanaAddress(value: string): boolean {
  try {
    solanaAddress(value);
    return true;
  } catch {
    return false;
  }
}

function readU64LE(data: Buffer, offset: number): bigint {
  let out = 0n;
  for (let i = 0; i < 8; i += 1) {
    out |= BigInt(data[offset + i] ?? 0) << BigInt(i * 8);
  }
  return out;
}

/**
 * Scans a Token-2022 mint's extension TLV for extensions that make the mint
 * impossible to bridge. The bridge locks tokens with a bare `transfer_checked`
 * (no hook accounts), so a live transfer hook, the non-transferable extension,
 * or a frozen-by-default account state would make the vault lock fail on-chain.
 * Returns human-readable names of any blocking extensions found.
 */
function detectBlockingMintExtensions(data: Buffer): string[] {
  const blocking: string[] = [];
  if (data.length <= TOKEN_2022_ACCOUNT_TYPE_OFFSET) return blocking;

  // Skip the base mint padding and the account-type byte; TLV entries follow.
  let offset = TOKEN_2022_ACCOUNT_TYPE_OFFSET + 1;
  while (offset + 4 <= data.length) {
    const extType = data[offset] | (data[offset + 1] << 8);
    const len = data[offset + 2] | (data[offset + 3] << 8);
    const dataStart = offset + 4;
    const dataEnd = dataStart + len;
    if (extType === 0 || dataEnd > data.length) break;

    if (extType === EXT_NON_TRANSFERABLE) {
      blocking.push("the non-transferable extension");
    } else if (extType === EXT_TRANSFER_HOOK) {
      // Layout: authority (32 bytes) then hook program id (32 bytes). The hook
      // only runs when a program id is actually set (non-zero).
      const programId = data.subarray(dataStart + 32, dataStart + 64);
      if (programId.length === 32 && programId.some((byte) => byte !== 0)) {
        blocking.push("a transfer hook");
      }
    } else if (extType === EXT_DEFAULT_ACCOUNT_STATE) {
      // 1-byte state: 2 = Frozen, which would create the vault account frozen.
      if (len >= 1 && data[dataStart] === 2) {
        blocking.push("a frozen-by-default account state");
      }
    }

    offset = dataEnd;
  }
  return blocking;
}

function maxHumanSupplyForDecimals(decimals: number): string {
  return fromBaseUnits(MAX_REMOTE_UINT64, decimals);
}

/**
 * Solana-side base units needed to represent the whole Base supply for a given
 * Solana decimals choice. localAmount = remoteAmount * 10^(baseDecimals - solanaDecimals),
 * so the remote (Solana) amount is the supply divided by that scalar, rounded up.
 * If this exceeds uint64 the full supply can never be bridged to Solana.
 */
function remoteUnitsForSupply(totalSupply: bigint, baseDecimals: number, solanaDecimals: number): bigint {
  const exponent = baseDecimals - solanaDecimals;
  const scalar = exponent > 0 ? 10n ** BigInt(exponent) : 1n;
  return (totalSupply + scalar - 1n) / scalar;
}

function recommendedSolanaDecimals(baseDecimals: number, totalSupply?: bigint): number {
  const maxCandidate = Math.min(DEFAULT_SOLANA_WRAPPED_DECIMALS, baseDecimals);
  if (!totalSupply || totalSupply <= 0n) return maxCandidate;

  for (let candidate = maxCandidate; candidate >= 0; candidate -= 1) {
    const scalar = 10n ** BigInt(baseDecimals - candidate);
    const remoteUnits = (totalSupply + scalar - 1n) / scalar;
    if (remoteUnits <= MAX_REMOTE_UINT64) return candidate;
  }
  return 0;
}

function planBaseToSolanaLocalChunks(
  amountUnits: bigint,
  scalar: bigint,
  availableRemote = MAX_REMOTE_UINT64
): ChunkPlan {
  if (scalar <= 0n) {
    throw new Error("Bridge scalar must be greater than zero.");
  }
  if (amountUnits % scalar !== 0n) {
    throw new Error(
      `Amount must be divisible by the registered bridge scalar ${scalar}; reduce decimal precision for this token.`
    );
  }

  const remoteTotal = amountUnits / scalar;
  if (remoteTotal > availableRemote) {
    throw new Error(
      `Amount exceeds the Solana mint's remaining bridge capacity.`
    );
  }
  return { chunks: [amountUnits.toString()], remoteTotal, availableRemote };
}

function defaultMode(direction: Direction): AssetMode {
  return direction === "base-to-solana" ? "base-native-erc20" : "sol-native";
}

function pairTransferBlockReason(
  result: PairVerificationResult | null,
  scalarRequired: boolean,
  busy: boolean
): string | null {
  if (busy) return "Pair verification is running.";
  if (!result) return "Verify this token pair before starting a transfer.";
  if (!result.base.ok || !result.solana.ok) {
    return "Token pair verification failed. Fix the Base token and Solana mint before transferring.";
  }
  if (result.bridge.crossChainErc20 && result.bridge.crossChainRemoteMatches === false) {
    return "The Base token is a bridge representation of a different Solana mint. Do not transfer.";
  }
  if (result.bridge.scalarMatchesDecimals === false) {
    return "Bridge scalar does not match the token decimals. Review the pair addresses before transferring.";
  }
  if (scalarRequired) {
    if (!result.bridge.checked) {
      return "Bridge registration could not be confirmed. Try verification again with a reliable Base RPC.";
    }
    if (!result.bridge.registered) {
      return "This Base/Solana pair is not registered with the bridge.";
    }
  }
  return null;
}

export function AssetForm({
  direction,
  onDirectionChange,
  relayMode,
  onRelayModeChange,
  network,
  baseRpc,
  solanaRpc,
  onModeChange,
  onTransfer,
  onDeployWrappedToken,
  onDeployBaseWrappedToken,
  busy,
  deployBusy,
  gated,
  gateReason,
  deployGated,
  deployGateReason,
}: Props) {
  const [assetMode, setAssetMode] = useState<AssetMode>(defaultMode(direction));
  const [sourceToken, setSourceToken] = useState("");
  const [destToken, setDestToken] = useState("");
  const [decimals, setDecimals] = useState(9);
  const [human, setHuman] = useState("");
  const [recipient, setRecipient] = useState("");
  const [solanaRecipientMode, setSolanaRecipientMode] = useState<"wallet" | "token-account">("wallet");
  const [baseTokenFlow, setBaseTokenFlow] = useState<"existing" | "first-time">("existing");
  const [solanaTokenFlow, setSolanaTokenFlow] = useState<"existing" | "first-time">("existing");
  const [registrationRelayMode, setRegistrationRelayMode] = useState<"auto" | "manual">("auto");
  const [wrappedName, setWrappedName] = useState("");
  const [wrappedSymbol, setWrappedSymbol] = useState("");
  const [wrappedDecimals, setWrappedDecimals] = useState(9);
  const [baseWrapperName, setBaseWrapperName] = useState("");
  const [baseWrapperSymbol, setBaseWrapperSymbol] = useState("");
  const [baseWrapperDecimals, setBaseWrapperDecimals] = useState(9);
  // The Solana mint whose on-chain decimals are currently loaded into baseWrapperDecimals.
  // Null until "Fetch mint details" succeeds; cleared whenever the source mint changes.
  const [baseWrapperMint, setBaseWrapperMint] = useState<string | null>(null);
  // Set when the fetched mint uses a Token-2022 extension the bridge cannot handle.
  const [mintBridgeBlock, setMintBridgeBlock] = useState<string | null>(null);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
  const [baseTokenTotalSupply, setBaseTokenTotalSupply] = useState<bigint | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairVerification, setPairVerification] = useState<PairVerificationResult | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const pairVerificationRunRef = useRef(0);

  const baseToSolana = direction === "base-to-solana";
  const baseTokenContractMode =
    baseToSolana &&
    (assetMode === "base-native-erc20" || assetMode === "base-wrapped-solana");

  useEffect(() => {
    if (network === "testnet") {
      setRegistrationRelayMode("manual");
    }
    if (direction === "base-to-solana" && relayMode !== "manual") {
      onRelayModeChange("manual");
    }
    if (direction === "base-to-solana" && assetMode.startsWith("sol-")) {
      setAssetMode("base-native-erc20");
    }
    if (direction === "solana-to-base" && assetMode.startsWith("base-")) {
      setAssetMode("sol-native");
    }
    if (direction !== "base-to-solana" || assetMode !== "base-native-erc20") {
      setBaseTokenFlow("existing");
    }
    if (direction !== "solana-to-base" || assetMode !== "sol-spl") {
      setSolanaTokenFlow("existing");
    }
  }, [assetMode, direction, network, onRelayModeChange, relayMode]);

  useEffect(() => {
    setDecimals(baseTokenContractMode || assetMode === "base-native-eth" ? 18 : 9);
  }, [assetMode, baseTokenContractMode, direction]);

  const baseUnits = useMemo(() => {
    if (!human) return null;
    try {
      return toBaseUnits(human, decimals);
    } catch (e) {
      return e as Error;
    }
  }, [human, decimals]);
  const chunkPreview = useMemo(() => {
    if (
      typeof baseUnits !== "bigint" ||
      !baseToSolana ||
      assetMode !== "base-native-erc20" ||
      !pairVerification?.bridge.scalar
    ) {
      return null;
    }
    try {
      return planBaseToSolanaLocalChunks(baseUnits, BigInt(pairVerification.bridge.scalar));
    } catch {
      return null;
    }
  }, [assetMode, baseToSolana, baseUnits, pairVerification?.bridge.scalar]);
  const capacityPreview = useMemo(() => {
    if (
      typeof baseUnits !== "bigint" ||
      !baseToSolana ||
      assetMode !== "base-native-erc20" ||
      !pairVerification?.bridge.scalar
    ) {
      return null;
    }
    const scalar = BigInt(pairVerification.bridge.scalar);
    if (scalar <= 0n || baseUnits % scalar !== 0n) return null;
    const remoteTotal = baseUnits / scalar;
    if (remoteTotal <= MAX_REMOTE_UINT64) return null;
    return {
      maxSourceUnits: MAX_REMOTE_UINT64 * scalar,
      remoteTotal,
    };
  }, [assetMode, baseToSolana, baseUnits, pairVerification?.bridge.scalar]);

  const srcLabel = sourceChainLabel(direction);
  const dstLabel = destChainLabel(direction);
  const firstTimeBaseToken = baseToSolana && assetMode === "base-native-erc20" && baseTokenFlow === "first-time";
  const firstTimeSolanaToken = !baseToSolana && assetMode === "sol-spl" && solanaTokenFlow === "first-time";
  const showTransferFields = !firstTimeBaseToken && !firstTimeSolanaToken;
  const requiresSourceToken =
    assetMode === "base-native-erc20" ||
    assetMode === "base-wrapped-solana" ||
    assetMode === "sol-spl" ||
    assetMode === "sol-wrapped-base";
  const requiresDestToken =
    !firstTimeBaseToken &&
    !firstTimeSolanaToken &&
    (assetMode === "base-native-erc20" ||
      assetMode === "base-native-eth" ||
      assetMode === "base-wrapped-solana" ||
      assetMode === "sol-spl");
  const remoteIsNativeSol = baseToSolana && destToken.trim() === SOLANA_NATIVE_SOL_SENTINEL;
  const relayAutoSupported = direction === "solana-to-base";
  const canDeployWrappedMint = firstTimeBaseToken;
  const canDeployBaseWrappedToken = firstTimeSolanaToken;
  const canFetchBaseTokenMetadata = baseTokenContractMode;
  const canFetchSolanaMintMetadata = !baseToSolana && assetMode === "sol-spl";
  const canVerifyTokenPair =
    !firstTimeBaseToken &&
    !firstTimeSolanaToken &&
    ((baseToSolana &&
      (assetMode === "base-native-erc20" || assetMode === "base-wrapped-solana")) ||
      (!baseToSolana &&
        (assetMode === "sol-spl" || assetMode === "sol-wrapped-base")));
  const pairBaseToken = baseToSolana ? sourceToken.trim() : destToken.trim();
  const pairSolanaMint = baseToSolana ? destToken.trim() : sourceToken.trim();
  const pairScalarRequired =
    (baseToSolana && assetMode === "base-native-erc20") ||
    (!baseToSolana && assetMode === "sol-wrapped-base");
  const pairGateReason = canVerifyTokenPair
    ? pairTransferBlockReason(pairVerification, pairScalarRequired, pairBusy)
    : null;
  const presets =
    network === "mainnet"
      ? TOKEN_PRESETS.filter((preset) => !preset.directions || preset.directions.includes(direction))
      : [];
  const isB2SRegistration =
    firstTimeBaseToken && sourceToken.trim().toLowerCase() === B2S_BASE_TOKEN.toLowerCase();
  const solanaMintCapacity = maxHumanSupplyForDecimals(wrappedDecimals);
  // Whole-supply Solana capacity at the chosen decimals. High-supply 18-decimal Base
  // tokens (e.g. Clanker/Bankr at 100B) overflow uint64 unless decimals are lowered.
  const registrationRemoteUnits =
    firstTimeBaseToken && baseTokenTotalSupply !== null && wrappedDecimals <= decimals
      ? remoteUnitsForSupply(baseTokenTotalSupply, decimals, wrappedDecimals)
      : null;
  const registrationCapacityIssue =
    registrationRemoteUnits !== null && registrationRemoteUnits > MAX_REMOTE_UINT64
      ? `At ${wrappedDecimals} Solana decimals, this token's ${fromBaseUnits(baseTokenTotalSupply!, decimals)} supply needs more than uint64 base units on Solana, so it cannot be fully bridged. Lower Solana decimals to ${recommendedSolanaDecimals(decimals, baseTokenTotalSupply!)} so the entire supply fits.`
      : isB2SRegistration && wrappedDecimals > B2S_SOLANA_DECIMALS
        ? "Set Solana decimals to 8 for B2S. 9 decimals cannot hold the intended 50B Solana-side supply."
        : null;
  // The Base ERC20 mirrors the Solana mint 1:1, so its decimals must match the mint
  // exactly. Require a successful fetch of the current mint before allowing deploy.
  const baseWrapperReady =
    canDeployBaseWrappedToken &&
    mintBridgeBlock === null &&
    baseWrapperMint !== null &&
    baseWrapperMint === sourceToken.trim();
  const baseWrapperGateReason = deployGated
    ? deployGateReason
    : mintBridgeBlock
      ? mintBridgeBlock
      : !baseWrapperReady
        ? 'Click "Fetch mint details" to read the mint decimals before deploying.'
        : undefined;

  useEffect(() => {
    onModeChange(
      firstTimeBaseToken
        ? "register-base-token"
        : firstTimeSolanaToken
          ? "register-solana-token"
          : "transfer"
    );
  }, [firstTimeBaseToken, firstTimeSolanaToken, onModeChange]);

  useEffect(() => {
    pairVerificationRunRef.current += 1;
    setPairVerification(null);
    setPairBusy(false);
  }, [assetMode, direction, network, sourceToken, destToken, baseTokenFlow, solanaTokenFlow]);

  useEffect(() => {
    setBaseTokenTotalSupply(null);
    setBaseWrapperMint(null);
    setMintBridgeBlock(null);
  }, [sourceToken]);

  const assetOptions: { value: AssetMode; label: string }[] = baseToSolana
    ? [
        { value: "base-native-erc20", label: "Base token" },
        { value: "base-native-eth", label: "ETH" },
        { value: "base-wrapped-solana", label: "Solana token on Base" },
      ]
    : [
        { value: "sol-native", label: "SOL" },
        { value: "sol-spl", label: "Solana token" },
        { value: "sol-wrapped-base", label: "Base token on Solana" },
      ];

  function applyPreset(label: string) {
    const p = TOKEN_PRESETS.find((x) => x.label === label);
    if (!p) return;
    setAssetMode(direction === "base-to-solana" ? p.baseToSolanaMode : p.solanaToBaseMode);
    if (direction === "base-to-solana") {
      setBaseTokenFlow("existing");
      setSourceToken(p.baseErc20);
      setDestToken(p.solanaMint);
      setDecimals(p.baseDecimals);
      setSolanaRecipientMode("wallet");
    } else {
      setSolanaTokenFlow("existing");
      setSourceToken(p.solanaMint);
      setDestToken(p.baseErc20);
      setDecimals(p.solanaDecimals);
    }
  }

  function applyB2SRegistrationPreset() {
    setAssetMode("base-native-erc20");
    setBaseTokenFlow("first-time");
    setSourceToken(B2S_BASE_TOKEN);
    setWrappedName("Base2Sol");
    setWrappedSymbol("B2S");
    setDecimals(18);
    setWrappedDecimals(B2S_SOLANA_DECIMALS);
    setRegistrationRelayMode("manual");
    setFormError(null);
    setFormNotice("B2S registration set to Solana decimals 8.");
    setMetadataStatus({
      tone: "success",
      text: "B2S uses 8 Solana decimals for the intended Base/Clanker/Bankr-style unit scale.",
    });
  }

  const baseMetadataRpcUrls = useMemo(() => {
    const candidates = [
      baseRpc,
      ...(network === "mainnet" ? BASE_MAINNET_METADATA_RPC_FALLBACKS : []),
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
  }, [baseRpc, network]);

  function applyBaseTokenMetadata(metadata: BaseTokenMetadata) {
    if (metadata.name) setWrappedName(metadata.name);
    if (metadata.symbol) setWrappedSymbol(metadata.symbol);
    setDecimals(metadata.decimals);
    setBaseTokenTotalSupply(metadata.totalSupply ?? null);
    setWrappedDecimals(recommendedSolanaDecimals(metadata.decimals, metadata.totalSupply));
  }

  async function readBaseTokenDecimals(cleanSourceToken: `0x${string}`): Promise<number> {
    const errors: string[] = [];
    for (const rpcUrl of baseMetadataRpcUrls) {
      const publicClient = createBaseMetadataClient(network, rpcUrl);
      try {
        const tokenDecimals = await publicClient.readContract({
          address: cleanSourceToken,
          abi: ERC20_METADATA_ABI,
          functionName: "decimals",
        });
        return Number(tokenDecimals);
      } catch (e) {
        errors.push(`${rpcUrl}: ${shortRpcError(e)}`);
      }
    }
    throw new Error(errors.join(" | ") || "No Base RPC URL is configured.");
  }

  async function readBaseTokenMetadata(cleanSourceToken: `0x${string}`): Promise<BaseTokenMetadata> {
    const errors: string[] = [];
    for (const rpcUrl of baseMetadataRpcUrls) {
      const publicClient = createBaseMetadataClient(network, rpcUrl);
      try {
        const tokenDecimals = await publicClient.readContract({
          address: cleanSourceToken,
          abi: ERC20_METADATA_ABI,
          functionName: "decimals",
        });
        const [name, symbol, totalSupply] = await Promise.all([
          publicClient
            .readContract({
              address: cleanSourceToken,
              abi: ERC20_METADATA_ABI,
              functionName: "name",
            })
            .then((value) => value as string)
            .catch(() => undefined),
          publicClient
            .readContract({
              address: cleanSourceToken,
              abi: ERC20_METADATA_ABI,
              functionName: "symbol",
            })
            .then((value) => value as string)
            .catch(() => undefined),
          publicClient
            .readContract({
              address: cleanSourceToken,
              abi: ERC20_METADATA_ABI,
              functionName: "totalSupply",
            })
            .then((value) => value as bigint)
            .catch(() => undefined),
        ]);
        return {
          name,
          symbol,
          decimals: Number(tokenDecimals),
          totalSupply,
          rpcUrl,
        };
      } catch (e) {
        errors.push(`${rpcUrl}: ${shortRpcError(e)}`);
      }
    }
    throw new Error(errors.join(" | ") || "No Base RPC URL is configured.");
  }

  async function readSolanaMintMetadata(cleanMint: string): Promise<SolanaMintMetadata> {
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(cleanMint);
    } catch {
      throw new Error("Enter a valid Solana mint address.");
    }

    const connection = new Connection(solanaRpc, "confirmed");
    const account = await connection.getAccountInfo(pubkey, "confirmed");
    if (!account) {
      throw new Error("Solana mint account was not found.");
    }

    let program: SolanaMintMetadata["program"];
    if (account.owner.equals(TOKEN_PROGRAM_ID)) {
      program = "Token";
    } else if (account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      program = "Token-2022";
    } else {
      throw new Error(`Account is owned by ${account.owner.toBase58()}, not a Solana token program.`);
    }

    if (account.data.length < MINT_LAYOUT_MIN_LENGTH) {
      throw new Error(`Mint account data is too short (${account.data.length} bytes).`);
    }

    return {
      decimals: account.data[44],
      supply: readU64LE(account.data, 36),
      program,
      blockingExtensions:
        program === "Token-2022" ? detectBlockingMintExtensions(account.data) : [],
    };
  }

  async function readBridgeDeposit(
    cleanSourceToken: `0x${string}`,
    cleanDestToken: string
  ): Promise<bigint> {
    const remoteToken = bytes32FromSolanaAddress(cleanDestToken);
    const errors: string[] = [];
    for (const rpcUrl of baseMetadataRpcUrls) {
      const publicClient = createBaseMetadataClient(network, rpcUrl);
      try {
        return await publicClient.readContract({
          address: BRIDGE_NETWORKS[network].baseBridgeContract,
          abi: BRIDGE_DEPOSIT_ABI,
          functionName: "deposits",
          args: [cleanSourceToken, remoteToken],
        });
      } catch (e) {
        errors.push(`${rpcUrl}: ${shortRpcError(e)}`);
      }
    }
    throw new Error(errors.join(" | ") || "Could not read bridge deposits.");
  }

  async function submit() {
    setFormError(null);
    setFormNotice(null);
    setMetadataStatus(null);
    const cleanSourceToken = sourceToken.trim();
    const cleanDestToken = destToken.trim();
    const cleanRecipient = recipient.trim();

    if (!cleanRecipient) {
      setFormError(`Enter a ${dstLabel} recipient address.`);
      return;
    }
    if (baseToSolana) {
      if (!validSolanaAddress(cleanRecipient)) {
        setFormError("Enter a valid Solana recipient address.");
        return;
      }
    } else if (!isEvmAddress(cleanRecipient)) {
      setFormError("Enter a valid Base/EVM recipient address.");
      return;
    }

    if (requiresSourceToken && !cleanSourceToken) {
      setFormError(`Enter the ${srcLabel} token address.`);
      return;
    }
    if (requiresDestToken && !cleanDestToken) {
      setFormError(`Enter the ${dstLabel} token address.`);
      return;
    }

    if ((assetMode === "base-native-erc20" || assetMode === "base-wrapped-solana") && !isEvmAddress(cleanSourceToken)) {
      setFormError("Enter a valid Base ERC20 address for the source token.");
      return;
    }
    if ((assetMode === "sol-spl" || assetMode === "sol-wrapped-base") && !validSolanaAddress(cleanSourceToken)) {
      setFormError("Enter a valid Solana mint address for the source token.");
      return;
    }
    if (baseToSolana && requiresDestToken && !validSolanaAddress(cleanDestToken)) {
      setFormError("Enter a valid Solana mint or bridge sentinel for the destination token.");
      return;
    }
    if (assetMode === "sol-spl" && !isEvmAddress(cleanDestToken)) {
      setFormError("Enter a valid Base ERC20 address for the destination token.");
      return;
    }
    if (pairGateReason) {
      setFormError(pairGateReason);
      return;
    }

    let sourceDecimals = decimals;
    if (assetMode === "base-native-eth") {
      sourceDecimals = 18;
      setDecimals(18);
    } else if (baseTokenContractMode) {
      setMetadataBusy(true);
      try {
        sourceDecimals = await readBaseTokenDecimals(cleanSourceToken as `0x${string}`);
        setDecimals(sourceDecimals);
      } catch (e) {
        setFormError(`Could not fetch Base token decimals: ${(e as Error).message}`);
        setMetadataBusy(false);
        return;
      } finally {
        setMetadataBusy(false);
      }
    }

    let amountUnits: bigint;
    try {
      amountUnits = toBaseUnits(human, sourceDecimals);
    } catch (e) {
      setFormError((e as Error).message);
      return;
    }

    if (baseToSolana && assetMode === "base-native-erc20" && pairVerification?.bridge.scalar) {
      try {
        const scalar = BigInt(pairVerification.bridge.scalar);
        const currentDeposit = await readBridgeDeposit(cleanSourceToken as `0x${string}`, cleanDestToken);
        const availableRemote = currentDeposit >= MAX_REMOTE_UINT64 ? 0n : MAX_REMOTE_UINT64 - currentDeposit;
        const plan = planBaseToSolanaLocalChunks(amountUnits, scalar, availableRemote);
        if (plan.remoteTotal > availableRemote) {
          throw new Error("Amount exceeds the Solana mint's remaining bridge capacity.");
        }
      } catch (e) {
        const scalar = BigInt(pairVerification.bridge.scalar);
        let capacityMessage = "";
        try {
          const currentDeposit = await readBridgeDeposit(cleanSourceToken as `0x${string}`, cleanDestToken);
          const availableRemote = currentDeposit >= MAX_REMOTE_UINT64 ? 0n : MAX_REMOTE_UINT64 - currentDeposit;
          const maxSourceUnits = availableRemote * scalar;
          capacityMessage = ` Remaining capacity is ${fromBaseUnits(maxSourceUnits, sourceDecimals)} tokens while ${fromBaseUnits(currentDeposit * scalar, sourceDecimals)} tokens are already outstanding on Solana.`;
        } catch {
          capacityMessage = "";
        }
        setFormError(`${(e as Error).message}${capacityMessage}`);
        return;
      }
    }

    const tokenMapping =
      requiresDestToken
        ? {
            sourceToken: assetMode === "base-native-eth" ? BASE_ETH_TOKEN_ADDRESS : cleanSourceToken,
            destToken: cleanDestToken,
          }
        : undefined;

    onTransfer({
      direction,
      asset:
        assetMode === "base-native-eth" || assetMode === "sol-native"
          ? { kind: "native" }
          : assetMode === "sol-wrapped-base"
            ? { kind: "wrapped", address: cleanSourceToken }
            : { kind: "token", address: cleanSourceToken },
      amount: amountUnits.toString(),
      recipient: cleanRecipient,
      baseTokenMode:
        assetMode === "base-native-erc20" || assetMode === "base-native-eth"
          ? "native-base"
          : assetMode === "base-wrapped-solana"
            ? "bridge-wrapped"
            : undefined,
      solanaRecipientMode:
        baseToSolana && !remoteIsNativeSol ? solanaRecipientMode : "wallet",
      relayMode: baseToSolana ? "manual" : relayMode,
      tokenMapping,
    });
  }

  async function deployWrappedMint() {
    setFormError(null);
    setFormNotice(null);
    setMetadataStatus(null);
    const cleanSourceToken = sourceToken.trim();
    const cleanName = wrappedName.trim();
    const cleanSymbol = wrappedSymbol.trim();

    if (!isEvmAddress(cleanSourceToken)) {
      setFormError("Enter a valid Base ERC20 address for the source token.");
      return;
    }
    if (!cleanName) {
      setFormError("Enter the Solana token name.");
      return;
    }
    if (!cleanSymbol) {
      setFormError("Enter the Solana token symbol.");
      return;
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      setFormError("Enter valid Base token decimals.");
      return;
    }
    if (!Number.isInteger(wrappedDecimals) || wrappedDecimals < 0 || wrappedDecimals > 18) {
      setFormError("Enter valid Solana token decimals.");
      return;
    }
    if (wrappedDecimals > decimals) {
      setFormError("Solana decimals must be less than or equal to the Base token decimals.");
      return;
    }
    if (cleanSourceToken.toLowerCase() === B2S_BASE_TOKEN.toLowerCase() && wrappedDecimals > B2S_SOLANA_DECIMALS) {
      setFormError("Set Solana decimals to 8 for B2S before creating the replacement mint.");
      return;
    }

    // Validate against on-chain truth before signing: the bridge scalar is derived
    // from the Base token's real decimals, and the whole supply must fit in uint64 at
    // the chosen Solana decimals or part of it could never be bridged. High-supply,
    // 18-decimal Base tokens (e.g. Clanker/Bankr at 100B) overflow uint64 at 9 decimals.
    setMetadataBusy(true);
    let onChain: BaseTokenMetadata | null = null;
    try {
      onChain = await readBaseTokenMetadata(cleanSourceToken as `0x${string}`);
    } catch (e) {
      setFormError(`Could not read Base token metadata to validate the registration: ${(e as Error).message}`);
    } finally {
      setMetadataBusy(false);
    }
    if (!onChain) return;

    if (onChain.decimals !== decimals) {
      setDecimals(onChain.decimals);
      setBaseTokenTotalSupply(onChain.totalSupply ?? null);
      setWrappedDecimals(recommendedSolanaDecimals(onChain.decimals, onChain.totalSupply));
      setFormError(`This Base token reports ${onChain.decimals} decimals on-chain (the form had ${decimals}). Updated the decimals and recommended Solana decimals; review and retry.`);
      return;
    }
    if (onChain.totalSupply) {
      setBaseTokenTotalSupply(onChain.totalSupply);
      const remoteUnits = remoteUnitsForSupply(onChain.totalSupply, onChain.decimals, wrappedDecimals);
      if (remoteUnits > MAX_REMOTE_UINT64) {
        const recommended = recommendedSolanaDecimals(onChain.decimals, onChain.totalSupply);
        setFormError(
          `At ${wrappedDecimals} Solana decimals, the full supply (${fromBaseUnits(onChain.totalSupply, onChain.decimals)} tokens) needs more than uint64 base units on Solana, so part of it could never be bridged. Lower Solana decimals to ${recommended}.`
        );
        return;
      }
    }

    try {
      const result = await onDeployWrappedToken({
        baseToken: cleanSourceToken,
        name: cleanName,
        symbol: cleanSymbol,
        baseDecimals: decimals,
        solanaDecimals: wrappedDecimals,
        relayMode: registrationRelayMode,
      });
      setDestToken(result.mint);
      setSolanaRecipientMode("wallet");
      setBaseTokenFlow("existing");
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function deployBaseWrappedToken() {
    setFormError(null);
    setFormNotice(null);
    setMetadataStatus(null);
    const cleanSourceToken = sourceToken.trim();
    const cleanName = baseWrapperName.trim();
    const cleanSymbol = baseWrapperSymbol.trim();

    if (!validSolanaAddress(cleanSourceToken)) {
      setFormError("Enter a valid Solana mint address for the source token.");
      return;
    }
    if (!cleanName) {
      setFormError("Enter the Base token name.");
      return;
    }
    if (!cleanSymbol) {
      setFormError("Enter the Base token symbol.");
      return;
    }

    // Re-read the mint right before deploying so the Base ERC20 always mirrors the
    // mint's real decimals. The factory route mints 1:1 with no scalar, so any
    // decimals mismatch would permanently misscale every bridged amount.
    let confirmed: SolanaMintMetadata | null = null;
    setMetadataBusy(true);
    try {
      confirmed = await readSolanaMintMetadata(cleanSourceToken);
    } catch (e) {
      setFormError(`Could not confirm the Solana mint decimals before deploying: ${(e as Error).message}`);
    } finally {
      setMetadataBusy(false);
    }
    if (!confirmed) return;
    if (confirmed.blockingExtensions.length > 0) {
      const reason = `This ${confirmed.program} mint uses ${confirmed.blockingExtensions.join(" and ")}, which base2sol cannot bridge. Locking it into the bridge vault would fail on-chain, so it is not bridgeable.`;
      setBaseWrapperMint(null);
      setMintBridgeBlock(reason);
      setFormError(reason);
      return;
    }
    const onChainDecimals = confirmed.decimals;
    setDecimals(onChainDecimals);
    setBaseWrapperDecimals(onChainDecimals);
    setBaseWrapperMint(cleanSourceToken);
    setMintBridgeBlock(null);

    try {
      const result = await onDeployBaseWrappedToken({
        solanaMint: cleanSourceToken,
        name: cleanName,
        symbol: cleanSymbol,
        decimals: onChainDecimals,
      });
      setDestToken(result.baseToken);
      setDecimals(onChainDecimals);
      setSolanaTokenFlow("existing");
      setFormNotice(`Created Base ERC20 ${result.baseToken} with ${onChainDecimals} decimals to match the Solana mint. You can now verify the pair and start a Solana -> Base transfer.`);
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function loadSolanaMintMetadata() {
    setFormError(null);
    setFormNotice("Fetching Solana mint metadata...");
    setMetadataStatus({ tone: "info", text: "Fetching Solana mint metadata..." });
    const cleanSourceToken = sourceToken.trim();
    if (!validSolanaAddress(cleanSourceToken)) {
      setFormError("Enter a valid Solana mint address first.");
      setFormNotice(null);
      setMetadataStatus({ tone: "error", text: "Enter a valid Solana mint address first." });
      return;
    }
    setMetadataBusy(true);
    try {
      const metadata = await readSolanaMintMetadata(cleanSourceToken);
      setDecimals(metadata.decimals);
      setBaseWrapperDecimals(metadata.decimals);
      const supplyText = fromBaseUnits(metadata.supply, metadata.decimals);
      if (metadata.blockingExtensions.length > 0) {
        const reason = `This ${metadata.program} mint uses ${metadata.blockingExtensions.join(" and ")}, which base2sol cannot bridge. Locking it into the bridge vault would fail on-chain, so it is not bridgeable.`;
        setBaseWrapperMint(null);
        setMintBridgeBlock(reason);
        setFormError(reason);
        setFormNotice(null);
        setMetadataStatus({ tone: "error", text: reason });
        return;
      }
      setBaseWrapperMint(cleanSourceToken);
      setMintBridgeBlock(null);
      setFormNotice(
        `Fetched ${metadata.program} mint: decimals ${metadata.decimals}; supply ${supplyText}.`
      );
      setMetadataStatus({
        tone: "success",
        text: `Fetched ${metadata.program} mint: decimals ${metadata.decimals}; supply ${supplyText}.`,
      });
    } catch (e) {
      setFormError(`Could not fetch Solana mint metadata: ${(e as Error).message}`);
      setFormNotice(null);
      setMetadataStatus({ tone: "error", text: `Mint fetch failed: ${shortRpcError(e)}` });
    } finally {
      setMetadataBusy(false);
    }
  }

  async function loadBaseTokenMetadata() {
    setFormError(null);
    setFormNotice("Fetching ERC20 metadata...");
    setMetadataStatus({ tone: "info", text: "Fetching ERC20 metadata..." });
    const cleanSourceToken = sourceToken.trim();
    if (!isEvmAddress(cleanSourceToken)) {
      setFormError("Enter a valid Base ERC20 address for the source token.");
      setFormNotice(null);
      setMetadataStatus({ tone: "error", text: "Enter a valid Base ERC20 address first." });
      return;
    }
    setMetadataBusy(true);
    try {
      const metadata = await readBaseTokenMetadata(cleanSourceToken as `0x${string}`);
      applyBaseTokenMetadata(metadata);
      const tokenLabel = [metadata.symbol, metadata.name && `(${metadata.name})`].filter(Boolean).join(" ");
      const fetched = tokenLabel || "token";
      const recommended = recommendedSolanaDecimals(metadata.decimals, metadata.totalSupply);
      const supplyText = metadata.totalSupply
        ? ` Total supply ${fromBaseUnits(metadata.totalSupply, metadata.decimals)}.`
        : "";
      setFormNotice(`Fetched ${fetched}: Base decimals ${metadata.decimals}; Solana decimals set to ${recommended}.${supplyText}`);
      if (!metadata.name || !metadata.symbol) {
        setFormError("Fetched decimals, but the RPC could not return name or symbol. Enter the missing fields manually.");
        setMetadataStatus({
          tone: "warn",
          text: `Fetched Base decimals ${metadata.decimals}; Solana decimals set to ${recommended}. Enter missing name or symbol manually.`,
        });
      } else {
        setMetadataStatus({
          tone: "success",
          text: `Fetched ${fetched}: Base decimals ${metadata.decimals}; Solana decimals set to ${recommended}.`,
        });
      }
    } catch (e) {
      setFormError(`Could not fetch ERC20 metadata: ${(e as Error).message}`);
      setFormNotice(null);
      setMetadataStatus({ tone: "error", text: `Metadata fetch failed: ${shortRpcError(e)}` });
    } finally {
      setMetadataBusy(false);
    }
  }

  async function verifyCurrentPair() {
    const runId = ++pairVerificationRunRef.current;
    setPairBusy(true);
    setPairVerification(null);
    setFormError(null);
    setFormNotice(null);
    try {
      const result = await verifyTokenPair({
        network,
        baseRpc,
        solanaRpc,
        baseToken: pairBaseToken,
        solanaMint: pairSolanaMint,
        scalarRequired: pairScalarRequired,
      });
      if (pairVerificationRunRef.current !== runId) return;
      setPairVerification(result);
    } catch (e) {
      if (pairVerificationRunRef.current !== runId) return;
      setFormError(`Could not verify token pair: ${(e as Error).message}`);
    } finally {
      if (pairVerificationRunRef.current === runId) {
        setPairBusy(false);
      }
    }
  }

  function pairResultClass(result: PairVerificationResult): string {
    return result.summary.tone === "error"
      ? "pair-result danger"
      : result.summary.tone === "success"
        ? "pair-result success"
        : "pair-result warn";
  }

  function basePairLabel(result: PairVerificationResult): string {
    if (!result.base.ok) return result.base.error ?? "Base token metadata unavailable.";
    const label = [result.base.symbol, result.base.name && `(${result.base.name})`].filter(Boolean).join(" ");
    return `${label || "ERC20"} - decimals ${result.base.decimals ?? "unknown"}`;
  }

  function solanaPairLabel(result: PairVerificationResult): string {
    if (!result.solana.ok) return result.solana.error ?? "Solana mint metadata unavailable.";
    if (result.solana.nativeSol) return "Native SOL sentinel - decimals 9";
    return `${result.solana.program ?? "Token"} mint - decimals ${result.solana.decimals ?? "unknown"} - supply ${result.solana.supply ?? "unknown"}`;
  }

  function bridgePairLabel(result: PairVerificationResult): string {
    if (result.bridge.crossChainErc20) {
      if (result.bridge.crossChainRemoteMatches === true)
        return "CrossChainERC20 mapped to this mint - mints 1:1, no scalar needed";
      if (result.bridge.crossChainRemoteMatches === false)
        return "CrossChainERC20 maps to a DIFFERENT mint - do not transfer";
      return "CrossChainERC20 - remote mint unconfirmed, retry verification";
    }
    if (!result.bridge.checked) return result.bridge.error ?? "Bridge registration was not checked.";
    if (result.bridge.registered) {
      const expected =
        result.bridge.expectedScalar && result.bridge.scalar !== result.bridge.expectedScalar
          ? `, expected from decimals ${result.bridge.expectedScalar}`
          : "";
      return `Registered - scalar ${result.bridge.scalar}${expected}`;
    }
    return result.bridge.scalarRequired
      ? "Not registered - transfers will fail until registration executes"
      : "No scalar registered - can be normal for bridge-wrapped Solana assets";
  }

  return (
    <div>
      <Field label="Bridge direction">
        <Segmented<Direction>
          value={direction}
          onChange={(d) => {
            onDirectionChange(d);
            setAssetMode(defaultMode(d));
            onRelayModeChange(d === "solana-to-base" ? "auto" : "manual");
          }}
          options={[
            { value: "base-to-solana", label: "Base -> Solana" },
            { value: "solana-to-base", label: "Solana -> Base" },
          ]}
        />
      </Field>

      <Field
        label="What are you moving?"
        hint={
          baseToSolana
            ? "Choose whether you are moving a native Base asset or redeeming a Solana asset that already lives on Base."
            : "Choose whether you are moving a native Solana asset or redeeming a Base asset that already lives on Solana."
        }
      >
        <Segmented<AssetMode> value={assetMode} onChange={setAssetMode} options={assetOptions} />
      </Field>

      {baseToSolana && assetMode === "base-native-erc20" && (
        <Field
          label="Token status"
          hint={
            baseTokenFlow === "first-time"
              ? "Create the Solana mint first, then execute its Base registration before transferring."
              : "Use this when you already know the Solana mint for this Base token."
          }
        >
          <Segmented<"existing" | "first-time">
            value={baseTokenFlow}
            onChange={setBaseTokenFlow}
            options={[
              { value: "existing", label: "Use existing mint" },
              { value: "first-time", label: "Create new mint" },
            ]}
          />
        </Field>
      )}

      {!baseToSolana && assetMode === "sol-spl" && (
        <Field
          label="Token status"
          hint={
            solanaTokenFlow === "first-time"
              ? "Create the Base ERC20 representation first, then use it as the destination token."
              : "Use this when you already know the Base ERC20 representation for this Solana mint."
          }
        >
          <Segmented<"existing" | "first-time">
            value={solanaTokenFlow}
            onChange={setSolanaTokenFlow}
            options={[
              { value: "existing", label: "Use existing ERC20" },
              { value: "first-time", label: "Create Base ERC20" },
            ]}
          />
        </Field>
      )}

      {!firstTimeBaseToken && !firstTimeSolanaToken && presets.length > 0 && (
        <Field label="Known pair" hint="Convenience only. Verify addresses before moving value.">
          <select defaultValue="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
            <option value="">Select a known pair...</option>
            {presets.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {requiresSourceToken && (
        <Field
          label={
            baseToSolana
              ? assetMode === "base-wrapped-solana"
                ? "Base token contract"
                : "Base token contract"
              : "Solana mint address"
          }
          hint={
            canDeployWrappedMint
              ? "This is the ERC20 contract teams want to make bridgeable to Solana."
              : canDeployBaseWrappedToken
                ? "This is the Solana mint teams want to make bridgeable to Base."
                : undefined
          }
        >
          <input
            value={sourceToken}
            onChange={(e) => setSourceToken(e.target.value)}
            placeholder={baseToSolana ? "0x... on Base" : "Solana mint address"}
          />
          {canFetchBaseTokenMetadata && (
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={metadataBusy}
                onClick={() => void loadBaseTokenMetadata()}
              >
                {metadataBusy ? "Loading..." : "Fetch ERC20 metadata"}
              </button>
              {metadataStatus && (
                <span
                  className={`hint ${metadataStatus.tone === "success" ? "" : metadataStatus.tone}`}
                  style={{ flex: "1 1 180px" }}
                >
                  {metadataStatus.text}
                </span>
              )}
            </div>
          )}
          {canFetchSolanaMintMetadata && (
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={metadataBusy}
                onClick={() => void loadSolanaMintMetadata()}
              >
                {metadataBusy ? "Loading..." : "Fetch mint details"}
              </button>
              {metadataStatus && !canFetchBaseTokenMetadata && (
                <span
                  className={`hint ${metadataStatus.tone === "success" ? "" : metadataStatus.tone}`}
                  style={{ flex: "1 1 180px" }}
                >
                  {metadataStatus.text}
                </span>
              )}
            </div>
          )}
        </Field>
      )}

      {requiresDestToken && (
        <Field
          label={baseToSolana ? "Registered Solana mint" : "Base token contract"}
          hint={
            baseToSolana
              ? canDeployWrappedMint
                ? "base2sol will create this mint for you."
                : "Use the Solana Token-2022 mint created for this Base token. For SOL, use the bridge native-SOL sentinel."
              : "ERC20 representation for this Solana mint on Base."
          }
        >
          <input
            value={destToken}
            onChange={(e) => setDestToken(e.target.value)}
            placeholder={baseToSolana ? "Solana mint or SoL111..." : "0x... on Base"}
          />
        </Field>
      )}

      {canVerifyTokenPair && (
        <div className="notice pair-check" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="notice-title">Pair verification</div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Checks on-chain metadata, bridge registration, scalar, and the app's known-pair list. This is not a legitimacy guarantee.
          </div>
          <div className="row">
            <button
              type="button"
              className="btn ghost"
              disabled={pairBusy}
              onClick={() => void verifyCurrentPair()}
            >
              {pairBusy ? "Checking..." : "Verify pair"}
            </button>
            {KNOWN_PAIR_REQUEST_URL && (
              <a className="btn ghost" href={KNOWN_PAIR_REQUEST_URL} target="_blank" rel="noreferrer">
                Request known-pair review
              </a>
            )}
            <span className="hint" style={{ flex: "1 1 180px" }}>
              {pairScalarRequired ? "Requires bridge registration." : "Scalar can be optional for this route."}
            </span>
          </div>
          {pairVerification && (
            <div className={pairResultClass(pairVerification)}>
              <div className="notice-title">{pairVerification.summary.title}</div>
              <div>{pairVerification.summary.detail}</div>
              <div className="kv pair-kv" style={{ marginTop: 10 }}>
                <span className="k">Base token</span>
                <span className="v">{basePairLabel(pairVerification)}</span>
                <span className="k">Solana mint</span>
                <span className="v">{solanaPairLabel(pairVerification)}</span>
                <span className="k">Bridge scalar</span>
                <span className="v">{bridgePairLabel(pairVerification)}</span>
                <span className="k">Known pair</span>
                <span className="v">{pairVerification.knownPairLabel ?? "Not listed by base2sol"}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {canDeployWrappedMint && (
        <div className="notice" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="notice-title">Register this Base token on Solana</div>
          <div className="hint" style={{ marginBottom: 12 }}>
            base2sol creates a Solana Token-2022 mint and emits a registration message to Base. After Base executes that message, this token can be bridged.
          </div>
          {network === "mainnet" && (
            <div className="row" style={{ marginBottom: 12 }}>
              <button type="button" className="btn ghost" onClick={applyB2SRegistrationPreset}>
                Use B2S 8-decimal setup
              </button>
              <span className="hint" style={{ flex: "1 1 180px" }}>
                8 Solana decimals supports the intended Base/Clanker/Bankr-style unit scale.
              </span>
            </div>
          )}
          <Field label="Solana token name">
            <input
              value={wrappedName}
              onChange={(e) => setWrappedName(e.target.value)}
              placeholder="Example Token"
            />
          </Field>
          <div className="row">
            <div style={{ flex: 1, minWidth: 120 }}>
              <Field label="Symbol">
                <input
                  value={wrappedSymbol}
                  onChange={(e) => setWrappedSymbol(e.target.value)}
                  placeholder="EXMPL"
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <Field label="Base decimals">
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <Field
                label="Solana decimals"
                hint={
                  <>
                    Base scalar: 10^{Math.max(0, decimals - wrappedDecimals)}. Max Solana-side supply: {solanaMintCapacity}.
                  </>
                }
              >
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={wrappedDecimals}
                  onChange={(e) => setWrappedDecimals(Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
          {baseTokenTotalSupply !== null && (
            <div className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
              Base total supply fetched: {fromBaseUnits(baseTokenTotalSupply, decimals)} tokens.
            </div>
          )}
          {registrationCapacityIssue && (
            <div className="notice danger">
              {registrationCapacityIssue}
            </div>
          )}
          <Field
            label="Registration execution"
            hint={
              registrationRelayMode === "auto"
                ? "Pay the protocol relay fee so Base execution can happen automatically."
                : "Skip the relay fee and execute the Base registration from this app."
            }
          >
            <Segmented<"auto" | "manual">
              value={registrationRelayMode}
              onChange={setRegistrationRelayMode}
              options={[
                { value: "auto", label: "Relay for me" },
                { value: "manual", label: "I'll execute" },
              ]}
            />
            {network === "testnet" && (
              <div className="hint">
                Testnet defaults to manual because devnet relay funding can be uneven.
              </div>
            )}
          </Field>
          <div className="row">
            <button
              type="button"
              className="btn solana"
              disabled={deployBusy || busy || metadataBusy || deployGated || !!registrationCapacityIssue}
              onClick={() => void deployWrappedMint()}
            >
              {deployBusy ? "Creating mint..." : metadataBusy ? "Checking supply..." : "Create mint & register"}
            </button>
            {deployGated && (
              <span className="hint warn">
                {deployGateReason}
              </span>
            )}
          </div>
        </div>
      )}

      {canDeployBaseWrappedToken && (
        <div className="notice" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="notice-title">Register this Solana token on Base</div>
          <div className="hint" style={{ marginBottom: 12 }}>
            base2sol deploys a bridge-owned CrossChainERC20 on Base for this Solana mint. After deployment, use the new Base token contract in the transfer flow.
          </div>
          <Field label="Base token name">
            <input
              value={baseWrapperName}
              onChange={(e) => setBaseWrapperName(e.target.value)}
              placeholder="Example Token"
            />
          </Field>
          <div className="row">
            <div style={{ flex: 1, minWidth: 120 }}>
              <Field label="Symbol">
                <input
                  value={baseWrapperSymbol}
                  onChange={(e) => setBaseWrapperSymbol(e.target.value)}
                  placeholder="EXMPL"
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <Field
                label="Solana decimals"
                hint="Read from the mint. The Base ERC20 mirrors these decimals exactly."
              >
                <input
                  type="number"
                  value={baseWrapperReady ? baseWrapperDecimals : ""}
                  readOnly
                  placeholder="Fetch mint details"
                />
              </Field>
            </div>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={deployBusy || busy || metadataBusy || deployGated || !baseWrapperReady}
              onClick={() => void deployBaseWrappedToken()}
            >
              {deployBusy ? "Creating ERC20..." : "Create Base ERC20"}
            </button>
            {baseWrapperGateReason && (
              <span className="hint warn">
                {baseWrapperGateReason}
              </span>
            )}
          </div>
        </div>
      )}

      {showTransferFields && (
        <>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 2, minWidth: 160 }}>
              <Field
                label="Amount"
                hint={
                  baseUnits instanceof Error ? (
                    <span className="hint error">{baseUnits.message}</span>
                  ) : baseUnits !== null ? (
                    <>{baseUnits.toString()} smallest source units</>
                  ) : (
                    "Enter the amount users think in, not smallest units."
                  )
                }
              >
                <input value={human} onChange={(e) => setHuman(e.target.value)} placeholder="0.001" inputMode="decimal" />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <Field label={baseToSolana ? "Base decimals" : "Solana decimals"}>
                <input
                  type="number"
                  min={0}
                  max={18}
                  value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}
                />
              </Field>
            </div>
          </div>

          {capacityPreview && (
            <div className="notice danger" style={{ marginTop: 0, marginBottom: 12 }}>
              This amount is above the Solana mint capacity for the current decimals.
              With this bridge registration, at most {fromBaseUnits(capacityPreview.maxSourceUnits, decimals)} tokens can be outstanding on Solana.
            </div>
          )}

          {!capacityPreview && chunkPreview && chunkPreview.chunks.length > 1 && (
            <div className="notice warn" style={{ marginTop: 0, marginBottom: 12 }}>
              This amount will be split into {chunkPreview.chunks.length} Base bridge transactions.
              Each full chunk is {fromBaseUnits(BigInt(chunkPreview.chunks[0]), decimals)} tokens because the Solana-side bridge amount is capped at uint64.
              Prove and execute each chunk from the operation panel.
            </div>
          )}

          {baseToSolana && !remoteIsNativeSol && (
            <Field
              label="Solana destination type"
              hint={
                solanaRecipientMode === "wallet"
                  ? "Recommended. Enter the normal wallet owner address; base2sol derives and creates the token account for this mint."
                  : "Advanced. Enter an existing token account for this exact mint. A normal wallet address will fail in this mode."
              }
            >
              <Segmented<"wallet" | "token-account">
                value={solanaRecipientMode}
                onChange={setSolanaRecipientMode}
                options={[
                  { value: "wallet", label: "Wallet owner" },
                  { value: "token-account", label: "Token account" },
                ]}
              />
            </Field>
          )}

          <Field
            label={
              baseToSolana && !remoteIsNativeSol
                ? solanaRecipientMode === "wallet"
                  ? "Recipient wallet owner"
                  : "Recipient token account"
                : `Recipient (${dstLabel})`
            }
            hint={
              baseToSolana && !remoteIsNativeSol && solanaRecipientMode === "wallet"
                ? "Use a Phantom wallet address. If the token account does not exist yet, Phantom signs the setup transaction before MetaMask signs the Base bridge transaction."
                : baseToSolana && !remoteIsNativeSol
                  ? "Use this only if you copied the exact token account for the destination mint from Phantom advanced details or an explorer."
                  : undefined
            }
          >
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={
                baseToSolana && !remoteIsNativeSol
                  ? solanaRecipientMode === "wallet"
                    ? "Solana wallet owner address"
                    : "Exact token account for this mint"
                  : baseToSolana
                    ? "Solana wallet address"
                    : "0x... (Base / EVM)"
              }
            />
          </Field>

          {relayAutoSupported ? (
            <Field
              label="Relay mode"
              hint={
                relayMode === "auto"
                  ? "Pay the protocol relay fee so the destination executes without a manual click."
                  : "You will execute the destination step yourself in the operation panel."
              }
            >
              <Segmented<"auto" | "manual">
                value={relayMode}
                onChange={onRelayModeChange}
                options={[
                  { value: "auto", label: "Relay for me" },
                  { value: "manual", label: "I'll execute" },
                ]}
              />
            </Field>
          ) : (
            <div className="notice">
              Base to Solana is manual after the Base transaction: wait for the Base checkpoint, prove on Solana, then execute on Solana.
            </div>
          )}
        </>
      )}

      {formError && (
        <div className="notice danger">
          {formError}
        </div>
      )}

      {formNotice && !formError && (
        <div className="notice success">
          {formNotice}
        </div>
      )}

      {showTransferFields && (
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" disabled={busy || deployBusy || gated || !!pairGateReason || !!capacityPreview} onClick={submit}>
            {busy ? "Starting..." : "Start transfer"}
          </button>
          {(gated || pairGateReason || capacityPreview) && (
            <span className="hint warn">
              {gated ? gateReason : pairGateReason ?? "Amount is above the Solana mint capacity for this pair."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
