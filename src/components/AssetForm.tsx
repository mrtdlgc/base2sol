"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { address as solanaAddress } from "@solana/kit";
import { createPublicClient, http, isAddress as isEvmAddress, parseAbi } from "viem";
import { base as viemBase, baseSepolia as viemBaseSepolia } from "viem/chains";
import type {
  TransferRequestDTO,
  WrappedTokenDeploymentRequestDTO,
} from "@/lib/bridge/dto";
import type { BridgeNetwork, Direction } from "@/lib/bridge/routes";
import { destChainLabel, sourceChainLabel } from "@/lib/bridge/routes";
import { BASE_ETH_TOKEN_ADDRESS, SOLANA_NATIVE_SOL_SENTINEL } from "@/lib/bridge/constants";
import { TOKEN_PRESETS } from "@/lib/bridge/presets";
import { verifyTokenPair, type PairVerificationResult } from "@/lib/bridge/pairVerification";
import { toBaseUnits } from "@/lib/bridge/units";
import { KNOWN_PAIR_REQUEST_URL } from "@/lib/site";
import { Field, Segmented } from "@/components/ui";

type AssetMode =
  | "base-native-erc20"
  | "base-native-eth"
  | "base-wrapped-solana"
  | "sol-native"
  | "sol-spl"
  | "sol-wrapped-base";

interface Props {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  relayMode: "auto" | "manual";
  onRelayModeChange: (m: "auto" | "manual") => void;
  network: BridgeNetwork;
  baseRpc: string;
  solanaRpc: string;
  onModeChange: (mode: "transfer" | "registration") => void;
  onTransfer: (req: TransferRequestDTO) => void;
  onDeployWrappedToken: (req: WrappedTokenDeploymentRequestDTO) => Promise<{ mint: string }>;
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
]);

interface BaseTokenMetadata {
  name?: string;
  symbol?: string;
  decimals: number;
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
  const [registrationRelayMode, setRegistrationRelayMode] = useState<"auto" | "manual">("auto");
  const [wrappedName, setWrappedName] = useState("");
  const [wrappedSymbol, setWrappedSymbol] = useState("");
  const [wrappedDecimals, setWrappedDecimals] = useState(9);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus | null>(null);
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

  const srcLabel = sourceChainLabel(direction);
  const dstLabel = destChainLabel(direction);
  const firstTimeBaseToken = baseToSolana && assetMode === "base-native-erc20" && baseTokenFlow === "first-time";
  const showTransferFields = !firstTimeBaseToken;
  const requiresSourceToken =
    assetMode === "base-native-erc20" ||
    assetMode === "base-wrapped-solana" ||
    assetMode === "sol-spl" ||
    assetMode === "sol-wrapped-base";
  const requiresDestToken =
    !firstTimeBaseToken &&
    (assetMode === "base-native-erc20" ||
      assetMode === "base-native-eth" ||
      assetMode === "base-wrapped-solana" ||
      assetMode === "sol-spl");
  const remoteIsNativeSol = baseToSolana && destToken.trim() === SOLANA_NATIVE_SOL_SENTINEL;
  const relayAutoSupported = direction === "solana-to-base";
  const canDeployWrappedMint = firstTimeBaseToken;
  const canFetchBaseTokenMetadata = baseTokenContractMode;
  const canVerifyTokenPair =
    !firstTimeBaseToken &&
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
  const presets = network === "mainnet" ? TOKEN_PRESETS : [];

  useEffect(() => {
    onModeChange(firstTimeBaseToken ? "registration" : "transfer");
  }, [firstTimeBaseToken, onModeChange]);

  useEffect(() => {
    pairVerificationRunRef.current += 1;
    setPairVerification(null);
    setPairBusy(false);
  }, [assetMode, direction, network, sourceToken, destToken]);

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
      setSourceToken(p.solanaMint);
      setDestToken(p.baseErc20);
      setDecimals(p.solanaDecimals);
    }
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
    setWrappedDecimals(Math.min(9, metadata.decimals));
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
        const [name, symbol] = await Promise.all([
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
        ]);
        return {
          name,
          symbol,
          decimals: Number(tokenDecimals),
          rpcUrl,
        };
      } catch (e) {
        errors.push(`${rpcUrl}: ${shortRpcError(e)}`);
      }
    }
    throw new Error(errors.join(" | ") || "No Base RPC URL is configured.");
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
      setFormNotice(`Fetched ${fetched}: Base decimals ${metadata.decimals} via ${metadata.rpcUrl}.`);
      if (!metadata.name || !metadata.symbol) {
        setFormError("Fetched decimals, but the RPC could not return name or symbol. Enter the missing fields manually.");
        setMetadataStatus({
          tone: "warn",
          text: `Fetched Base decimals ${metadata.decimals}; enter missing name or symbol manually.`,
        });
      } else {
        setMetadataStatus({
          tone: "success",
          text: `Fetched ${fetched}: Base decimals ${metadata.decimals}.`,
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

      {presets.length > 0 && (
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
          hint={canDeployWrappedMint ? "This is the ERC20 contract teams want to make bridgeable to Solana." : undefined}
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
                hint={`Base scalar: 10^${Math.max(0, decimals - wrappedDecimals)}`}
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
              disabled={deployBusy || busy || deployGated}
              onClick={() => void deployWrappedMint()}
            >
              {deployBusy ? "Creating mint..." : "Create mint & register"}
            </button>
            {deployGated && (
              <span className="hint warn">
                {deployGateReason}
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
          <button type="button" className="btn" disabled={busy || deployBusy || gated || !!pairGateReason} onClick={submit}>
            {busy ? "Starting..." : "Start transfer"}
          </button>
          {(gated || pairGateReason) && (
            <span className="hint warn">
              {gated ? gateReason : pairGateReason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
