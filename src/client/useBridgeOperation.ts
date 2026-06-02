"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BridgeRoute,
  ExecutionStatus,
  Logger,
  MessageRef,
  RouteCapabilities,
} from "bridge-sdk";
import { recoverWrapTokenRegistration } from "bridge-sdk";
import { createPublicClient, decodeEventLog, http, parseAbi, type Hash } from "viem";
import { base as viemBase, baseSepolia as viemBaseSepolia } from "viem/chains";
import { buildBrowserBridgeClient } from "./bridge";
import type { EvmConnection, SolanaConnection } from "./wallets/types";
import type {
  TokenMappingInput,
  TransferRequestDTO,
  WrappedTokenDeploymentRequestDTO,
  WrappedTokenDeploymentResultDTO,
} from "@/lib/bridge/dto";
import { BRIDGE_NETWORKS } from "@/lib/bridge/networks";
import { nativeAsset, routeFor, tokenAsset, wrappedAsset, type BridgeNetwork } from "@/lib/bridge/routes";
import { isNativeSolSentinel, ensureAssociatedTokenAccount } from "./wallets/ata";
import { decode, encode } from "@/lib/bridge/serialize";

const STORE_KEY_PREFIX = "bsb.operation.v3";
const ALLOWANCE_VISIBILITY_TIMEOUT_MS = 30_000;
const ALLOWANCE_VISIBILITY_POLL_INTERVAL_MS = 1_000;

const ERC20_APPROVAL_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const BRIDGE_MESSAGE_ABI = parseAbi([
  "event MessageInitiated(bytes32 indexed messageHash, bytes32 indexed mmrRoot, (uint64 nonce, address sender, bytes data) message)",
]);

export interface LogEntry {
  ts: number;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
}

export interface PersistedTransferChunk {
  index: number;
  amount: string;
  messageRef: MessageRef;
  initiationTx?: string;
  proofTx?: string;
  executionTx?: string;
  executed?: boolean;
  createdAt: number;
}

export interface PersistedTransferBatch {
  totalAmount: string;
  totalChunks: number;
  currentIndex: number;
  chunks: PersistedTransferChunk[];
}

export interface PersistedOp {
  kind?: "transfer" | "wrap-token";
  messageRef: MessageRef;
  tokenMapping?: TokenMappingInput;
  transferBatch?: PersistedTransferBatch;
  wrappedTokenDeployment?: {
    baseToken: string;
    mint: string;
    name: string;
    symbol: string;
    baseDecimals: number;
    solanaDecimals: number;
    scalerExponent: number;
    executed?: boolean;
    executionTx?: string;
  };
  baseToSolanaRecipient?: {
    owner: string;
    tokenAccount: string;
    mint: string;
  };
  initiationTx?: string;
  createdAt: number;
}

export interface WalletDeps {
  evm: EvmConnection | null;
  solana: SolanaConnection | null;
  baseRpc: string;
  solanaRpc: string;
  network: BridgeNetwork;
}

type Phase = "idle" | "initiating" | "proving" | "executing";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureTotalErc20Approval(opts: {
  deps: WalletDeps;
  token: `0x${string}`;
  amount: bigint;
  addLog: (level: LogEntry["level"], msg: string) => void;
}): Promise<void> {
  if (!opts.deps.evm) {
    throw new Error("Connect MetaMask to approve the Base token.");
  }

  const chain = opts.deps.network === "testnet" ? viemBaseSepolia : viemBase;
  const spender = BRIDGE_NETWORKS[opts.deps.network].baseBridgeContract;
  const publicClient = createPublicClient({
    chain,
    transport: http(opts.deps.baseRpc, { retryCount: 0, timeout: 8_000 }),
  });

  const readAllowance = async () =>
    await publicClient.readContract({
      address: opts.token,
      abi: ERC20_APPROVAL_ABI,
      functionName: "allowance",
      args: [opts.deps.evm!.address, spender],
    });

  const allowance = await readAllowance();
  if (allowance >= opts.amount) {
    opts.addLog("info", "Existing ERC20 approval covers the full chunked transfer.");
    return;
  }

  opts.addLog("info", "Requesting ERC20 approval for the full chunked transfer...");
  const { request } = await publicClient.simulateContract({
    address: opts.token,
    abi: ERC20_APPROVAL_ABI,
    functionName: "approve",
    args: [spender, opts.amount],
    account: opts.deps.evm.account,
    chain,
  });
  const txHash = await opts.deps.evm.walletClient.writeContract(request);
  opts.addLog("info", `Approval submitted: ${txHash}`);
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: 60_000,
    pollingInterval: 2_000,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt <= ALLOWANCE_VISIBILITY_TIMEOUT_MS) {
    if ((await readAllowance()) >= opts.amount) {
      opts.addLog("ok", `Approval confirmed: ${txHash}`);
      return;
    }
    await sleep(ALLOWANCE_VISIBILITY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Approval transaction confirmed, but the RPC has not exposed the updated allowance yet. Retry the transfer in a few seconds. txHash=${txHash}`
  );
}

function statusLogKey(status: ExecutionStatus): string {
  const executionTx = "executionTx" in status && status.executionTx ? status.executionTx : "";
  const reason = "reason" in status && status.reason ? String(status.reason) : "";
  const sourceBlock = "sourceBlockNumber" in status && status.sourceBlockNumber ? status.sourceBlockNumber : "";
  const bridgeBlock = "bridgeStateBlockNumber" in status && status.bridgeStateBlockNumber ? status.bridgeStateBlockNumber : "";
  return `${status.type}:${executionTx}:${reason}:${sourceBlock}:${bridgeBlock}`;
}

function statusLabel(status: ExecutionStatus["type"]): string {
  switch (status) {
    case "Initiated":
      return "Waiting for proof";
    case "Executable":
      return "Ready to execute";
    case "Executed":
      return "Complete";
    default:
      return status;
  }
}

function parseStaleBridgeState(message: string): { bridgeBlock: string; transactionBlock: string } | null {
  const match = message.match(/Bridge state block:\s*(\d+),\s*Transaction block:\s*(\d+)/i);
  if (!match) return null;
  return { bridgeBlock: match[1], transactionBlock: match[2] };
}

function isSolanaBlockhashExpiry(message: string): boolean {
  return (
    message.includes("progressed past the last block") ||
    message.includes("BLOCK_HEIGHT_EXCEEDED") ||
    message.includes("block height exceeded")
  );
}

function statusLogMessage(status: ExecutionStatus): string {
  const suffix =
    "reason" in status && status.reason
      ? ` - ${status.reason}`
      : "executionTx" in status && status.executionTx
        ? ` (${status.executionTx})`
        : "";
  return `Status: ${statusLabel(status.type)}${suffix}`;
}

function storeKey(network: BridgeNetwork): string {
  return `${STORE_KEY_PREFIX}.${network}`;
}

function messageRefKey(ref: MessageRef): string {
  return [
    ref.route.sourceChain,
    ref.route.destinationChain,
    ref.source.chain,
    ref.source.id.scheme,
    ref.source.id.value,
  ].join(":");
}

function withCurrentBatchChunk(op: PersistedOp): PersistedOp {
  const current = op.transferBatch?.chunks[op.transferBatch.currentIndex];
  if (!current) return op;
  return {
    ...op,
    messageRef: current.messageRef,
    initiationTx: current.initiationTx,
  };
}

function updateCurrentBatchChunk(
  op: PersistedOp,
  update: Partial<PersistedTransferChunk>
): PersistedOp {
  if (!op.transferBatch) return op;
  const currentIndex = op.transferBatch.currentIndex;
  const chunks = op.transferBatch.chunks.map((chunk, index) =>
    index === currentIndex ? { ...chunk, ...update } : chunk
  );
  return withCurrentBatchChunk({
    ...op,
    transferBatch: {
      ...op.transferBatch,
      chunks,
    },
  });
}

function compactSubmittedBatch(op: PersistedOp): PersistedOp {
  if (!op.transferBatch) return op;
  const chunks = op.transferBatch.chunks;
  if (chunks.length === 0) return op;
  const totalAmount = chunks.reduce((sum, chunk) => sum + BigInt(chunk.amount), 0n).toString();
  return withCurrentBatchChunk({
    ...op,
    transferBatch: {
      ...op.transferBatch,
      totalAmount,
      totalChunks: chunks.length,
      currentIndex: Math.min(op.transferBatch.currentIndex, chunks.length - 1),
      chunks,
    },
  });
}

function loadPersisted(network: BridgeNetwork): PersistedOp | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storeKey(network));
  if (!raw) return null;
  try {
    return decode<PersistedOp>(raw);
  } catch {
    return null;
  }
}

function persist(op: PersistedOp | null, network: BridgeNetwork) {
  if (typeof window === "undefined") return;
  if (op) window.localStorage.setItem(storeKey(network), encode(op));
  else window.localStorage.removeItem(storeKey(network));
}

async function recoverBaseToSolanaTransferFromTx(opts: {
  txHash: Hash;
  deps: WalletDeps;
}): Promise<PersistedOp> {
  const route = routeFor("base-to-solana", opts.deps.network);
  const publicClient = createPublicClient({
    chain: opts.deps.network === "testnet" ? viemBaseSepolia : viemBase,
    transport: http(opts.deps.baseRpc, { retryCount: 0, timeout: 10_000 }),
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: opts.txHash });
  if (receipt.status !== "success") {
    throw new Error(`Base transaction is not successful: ${opts.txHash}`);
  }

  const bridgeAddress = BRIDGE_NETWORKS[opts.deps.network].baseBridgeContract.toLowerCase();
  const events = receipt.logs
    .filter((log) => log.address.toLowerCase() === bridgeAddress)
    .map((log) => {
      try {
        return decodeEventLog({
          abi: BRIDGE_MESSAGE_ABI,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return null;
      }
    })
    .filter((event): event is NonNullable<typeof event> => event?.eventName === "MessageInitiated");

  if (events.length !== 1) {
    throw new Error(
      events.length === 0
        ? "No Base bridge MessageInitiated event found in that transaction."
        : `Expected one bridge MessageInitiated event, found ${events.length}.`
    );
  }

  const args = events[0].args;
  return {
    kind: "transfer",
    messageRef: {
      route,
      source: {
        chain: route.sourceChain,
        id: { scheme: "evm:messageHash", value: args.messageHash },
      },
      derived: {
        txHash: receipt.transactionHash,
        nonce: args.message.nonce.toString(),
        sender: args.message.sender,
        data: args.message.data,
        mmrRoot: args.mmrRoot,
      },
    },
    initiationTx: receipt.transactionHash,
    createdAt: Date.now(),
  };
}

export function useBridgeOperation(deps: WalletDeps) {
  const [op, setOp] = useState<PersistedOp | null>(null);
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [capabilities, setCapabilities] = useState<RouteCapabilities | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [initiatingKind, setInitiatingKind] = useState<"transfer" | "wrap-token" | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingInFlightRef = useRef(false);
  const initiatingInFlightRef = useRef(false);
  const statusRef = useRef<ExecutionStatus | null>(null);

  // Keep latest deps available to callbacks without re-creating them constantly.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const addLog = useCallback((level: LogEntry["level"], msg: string) => {
    setLog((prev) => [...prev, { ts: Date.now(), level, msg }].slice(-200));
  }, []);

  const sdkLogger = useCallback(
    (): Logger => {
      const emit = (level: LogEntry["level"], message: string) => {
        if (message.includes("ensureErc20Allowance: approving bridge")) {
          addLog("info", "Requesting ERC20 approval for the Base bridge...");
          return;
        }
        if (message.includes("ensureErc20Allowance: submitted txHash=")) {
          addLog("info", `Approval submitted: ${message.split("txHash=")[1] ?? message}`);
          return;
        }
        if (message.includes("ensureErc20Allowance: confirmed txHash=")) {
          addLog("ok", `Approval confirmed: ${message.split("txHash=")[1] ?? message}`);
          return;
        }
        if (message.includes("ensureErc20Allowance: allowance sufficient")) {
          addLog("info", "Existing ERC20 approval is sufficient.");
          return;
        }
        if (message.includes("baseEngine.bridgeToken: simulation succeeded")) {
          addLog("info", "Bridge simulation succeeded. Requesting transfer signature...");
          return;
        }
        if (message.includes("baseEngine.bridgeToken: submitting transaction")) {
          addLog("info", "Submitting Base bridge transaction...");
          return;
        }
        if (message.includes("baseEngine.bridgeToken: submitted txHash=")) {
          addLog("ok", `Bridge transaction submitted: ${message.split("txHash=")[1] ?? message}`);
          return;
        }
        if (level !== "info") addLog(level, message);
      };

      return {
        debug: (message: string) => emit("info", message),
        info: (message: string) => emit("info", message),
        warn: (message: string) => emit("warn", message),
        error: (message: string) => emit("error", message),
      };
    },
    [addLog]
  );

  const clientFor = useCallback((route: BridgeRoute, tokenMapping?: TokenMappingInput) => {
    const d = depsRef.current;
    return buildBrowserBridgeClient({
      evm: d.evm,
      solana: d.solana,
      baseRpc: d.baseRpc,
      solanaRpc: d.solanaRpc,
      route,
      tokenMapping,
      logger: sdkLogger(),
    });
  }, [sdkLogger]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopPolling();
    const existing = loadPersisted(deps.network);
    const restored = existing ? compactSubmittedBatch(withCurrentBatchChunk(existing)) : null;
    setOp(restored);
    setStatus(null);
    statusRef.current = null;
    if (restored) {
      addLog("info", "Restored the saved operation for this environment.");
    }
  }, [addLog, deps.network, stopPolling]);

  const refreshCapabilities = useCallback(
    async (direction: TransferRequestDTO["direction"]) => {
      if (!depsRef.current.solana) {
        setCapabilities(null);
        return null;
      }
      const route = routeFor(direction, depsRef.current.network);
      try {
        const caps = await clientFor(route).capabilities(route);
        setCapabilities(caps);
        return caps;
      } catch (e) {
          addLog("warn", `Could not load route capabilities: ${(e as Error).message}`);
        setCapabilities(null);
        return null;
      }
    },
    [addLog, clientFor]
  );

  const checkStatus = useCallback(
    async (target?: PersistedOp, options: { forceLog?: boolean } = {}) => {
      const current = target ?? op;
      if (!current) return;
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      setIsPolling(true);
      try {
        const s = await clientFor(current.messageRef.route, current.tokenMapping).status(
          current.messageRef
        );
        const prev = statusRef.current;
        setStatus(s);
        statusRef.current = s;
        const changed = !prev || statusLogKey(prev) !== statusLogKey(s);
        if (changed || options.forceLog) {
          addLog(
            s.type === "Failed" || s.type === "Expired" ? "error" : "info",
            statusLogMessage(s)
          );
        }
        if (s.type === "Executed") {
          if (current.transferBatch) {
            const executionTx = "executionTx" in s ? s.executionTx : undefined;
            const executedCurrent = updateCurrentBatchChunk(current, {
              executed: true,
              executionTx,
            });
            const batch = executedCurrent.transferBatch;
            const nextIndex = batch
              ? batch.chunks.findIndex((chunk, index) => index > batch.currentIndex && !chunk.executed)
              : -1;

            if (batch && nextIndex >= 0) {
              const advanced = withCurrentBatchChunk({
                ...executedCurrent,
                transferBatch: {
                  ...batch,
                  currentIndex: nextIndex,
                },
              });
              setOp((prev) =>
                prev && messageRefKey(prev.messageRef) === messageRefKey(current.messageRef)
                  ? advanced
                  : prev
              );
              persist(advanced, depsRef.current.network);
              setStatus(null);
              statusRef.current = null;
              addLog("ok", `Chunk ${batch.currentIndex + 1}/${batch.totalChunks} executed on the destination.`);
              addLog("info", `Tracking chunk ${nextIndex + 1}/${batch.totalChunks}. Prove and execute the next message when it is ready.`);
              stopPolling();
              pollRef.current = setInterval(() => void checkStatus(advanced), 8000);
              return;
            }

            if (batch) {
              setOp((prev) =>
                prev && messageRefKey(prev.messageRef) === messageRefKey(current.messageRef)
                  ? executedCurrent
                  : prev
              );
              persist(executedCurrent, depsRef.current.network);
              if (changed) {
                addLog(
                  batch.chunks.length === batch.totalChunks ? "ok" : "warn",
                  batch.chunks.length === batch.totalChunks
                    ? `Chunk ${batch.currentIndex + 1}/${batch.totalChunks} executed on the destination. All chunks are complete.`
                    : `Submitted chunks are complete, but only ${batch.chunks.length}/${batch.totalChunks} chunks were submitted. Start another transfer for the remaining amount.`
                );
              }
              stopPolling();
              return;
            }
          }
          if (current.kind === "wrap-token" && current.wrappedTokenDeployment) {
            const updated: PersistedOp = {
              ...current,
              wrappedTokenDeployment: {
                ...current.wrappedTokenDeployment,
                executed: true,
                executionTx: "executionTx" in s ? s.executionTx : undefined,
              },
            };
            setOp((prev) =>
              prev && messageRefKey(prev.messageRef) === messageRefKey(current.messageRef)
                ? updated
                : prev
            );
            persist(updated, depsRef.current.network);
          }
          if (changed) {
            addLog("ok", "Message executed on the destination. Operation complete.");
          }
          stopPolling();
        }
      } catch (e) {
        addLog("warn", `Could not refresh status: ${(e as Error).message}`);
      } finally {
        pollingInFlightRef.current = false;
        setIsPolling(false);
      }
    },
    [op, addLog, clientFor, stopPolling]
  );

  useEffect(() => {
    if (op?.kind !== "wrap-token") return;
    if (op.wrappedTokenDeployment?.executed) return;
    if (statusRef.current) return;
    if (phase !== "idle") return;
    void checkStatus(op);
  }, [op, phase, checkStatus]);

  const startPolling = useCallback(
    (target: PersistedOp) => {
      stopPolling();
      pollRef.current = setInterval(() => void checkStatus(target), 8000);
    },
    [checkStatus, stopPolling]
  );

  const transfer = useCallback(
    async (req: TransferRequestDTO) => {
      if (initiatingInFlightRef.current) {
        const msg = "An initiation is already in progress. Wait for the wallet flow to finish.";
        addLog("warn", msg);
        throw new Error(msg);
      }
      if (op && status?.type !== "Executed") {
        const msg = "A bridge operation is already active. Finish it or clear it before starting another.";
        addLog("warn", msg);
        throw new Error(msg);
      }
      if (
        req.direction === "base-to-solana" &&
        req.baseTokenMode === "native-base" &&
        req.tokenMapping &&
        op?.kind === "wrap-token" &&
        op.wrappedTokenDeployment?.baseToken.toLowerCase() ===
          req.tokenMapping.sourceToken.toLowerCase() &&
        op.wrappedTokenDeployment.mint === req.tokenMapping.destToken &&
        !op.wrappedTokenDeployment.executed &&
        status?.type !== "Executed"
      ) {
        const msg = "Wait until this token registration executes on Base before bridging it.";
        addLog("warn", msg);
        throw new Error(msg);
      }
      setPhase("initiating");
      initiatingInFlightRef.current = true;
      setInitiatingKind("transfer");
      setStatus(null);
      statusRef.current = null;
      addLog("info", `Starting ${req.direction} transfer: amount=${req.amount} recipient=${req.recipient}`);
      let partialBatchOp: PersistedOp | null = null;
      try {
        const route = routeFor(req.direction, depsRef.current.network);
        const d = depsRef.current;
        let recipient = req.recipient;
        let baseToSolanaRecipient: PersistedOp["baseToSolanaRecipient"];

        if (
          req.direction === "base-to-solana" &&
          req.tokenMapping?.destToken &&
          req.solanaRecipientMode === "wallet" &&
          !isNativeSolSentinel(req.tokenMapping.destToken)
        ) {
          if (!d.solana) {
            throw new Error("Connect Phantom to derive and create the destination Solana token account.");
          }
          addLog("info", "Resolving the recipient's Solana token account...");
          const ata = await ensureAssociatedTokenAccount({
            rpcUrl: d.solanaRpc,
            payer: d.solana,
            owner: req.recipient,
            mint: req.tokenMapping.destToken,
          });
          recipient = ata.tokenAccount;
          baseToSolanaRecipient = {
            owner: req.recipient,
            tokenAccount: ata.tokenAccount,
            mint: req.tokenMapping.destToken,
          };
          addLog(
            ata.creationTx ? "ok" : "info",
            ata.creationTx
              ? `Created recipient token account ${ata.tokenAccount}. tx: ${ata.creationTx}`
              : `Using recipient token account ${ata.tokenAccount}`
          );
        }

        const amountChunks = req.amountChunks?.length ? req.amountChunks : [req.amount];
        const totalAmount = BigInt(req.amount);
        const chunkTotal = amountChunks.reduce((sum, amount) => sum + BigInt(amount), 0n);
        if (chunkTotal !== totalAmount) {
          throw new Error("Transfer chunk plan does not add up to the requested amount.");
        }
        if (
          amountChunks.length > 1 &&
          req.direction === "base-to-solana" &&
          req.baseTokenMode === "native-base" &&
          req.asset.kind === "token" &&
          req.tokenMapping?.sourceToken
        ) {
          addLog("info", `Splitting transfer into ${amountChunks.length} Base bridge transactions to fit the Solana-side uint64 limit.`);
          await ensureTotalErc20Approval({
            deps: d,
            token: req.tokenMapping.sourceToken as `0x${string}`,
            amount: totalAmount,
            addLog,
          });
        }

        const asset =
          req.asset.kind === "token"
            ? tokenAsset(req.asset.address as string)
            : req.asset.kind === "wrapped"
              ? wrappedAsset(req.asset.address as string)
            : nativeAsset();
        const client = clientFor(route, req.tokenMapping);
        let next: PersistedOp | null = null;

        for (let index = 0; index < amountChunks.length; index += 1) {
          const chunkAmount = amountChunks[index]!;
          if (amountChunks.length > 1) {
            addLog("info", `Submitting transfer chunk ${index + 1}/${amountChunks.length}: amount=${chunkAmount}`);
          }
          const operation = await client.transfer({
            route,
            asset,
            amount: BigInt(chunkAmount),
            recipient,
            relay: req.relayMode ? { mode: req.relayMode } : undefined,
            metadata:
              req.direction === "base-to-solana"
                ? {
                    baseTokenMode: req.baseTokenMode,
                    baseAmountUnits: req.baseTokenMode === "native-base" ? "local" : "remote",
                  }
                : undefined,
          });

          if (amountChunks.length === 1) {
            next = {
              kind: "transfer",
              messageRef: operation.messageRef,
              tokenMapping: req.tokenMapping,
              baseToSolanaRecipient,
              initiationTx: operation.initiationTx,
              createdAt: Date.now(),
            };
            break;
          }

          const createdAt = partialBatchOp?.createdAt ?? Date.now();
          const chunks = [
            ...(partialBatchOp?.transferBatch?.chunks ?? []),
            {
              index,
              amount: chunkAmount,
              messageRef: operation.messageRef,
              initiationTx: operation.initiationTx,
              createdAt: Date.now(),
            },
          ];
          next = withCurrentBatchChunk({
            kind: "transfer",
            messageRef: chunks[0]!.messageRef,
            tokenMapping: req.tokenMapping,
            transferBatch: {
              totalAmount: req.amount,
              totalChunks: amountChunks.length,
              currentIndex: partialBatchOp?.transferBatch?.currentIndex ?? 0,
              chunks,
            },
            baseToSolanaRecipient,
            initiationTx: chunks[0]!.initiationTx,
            createdAt,
          });
          partialBatchOp = next;
          setOp(next);
          persist(next, depsRef.current.network);
          addLog("ok", `Chunk ${index + 1}/${amountChunks.length} Base transaction confirmed: ${operation.initiationTx ?? "(see wallet)"}`);
        }

        if (!next) {
          throw new Error("No transfer operation was submitted.");
        }
        setOp(next);
        persist(next, depsRef.current.network);
        addLog(
          "ok",
          amountChunks.length > 1
            ? `Submitted ${amountChunks.length}/${amountChunks.length} bridge chunks. Track chunk 1 first.`
            : `Source transaction confirmed: ${next.initiationTx ?? "(see wallet)"}`
        );
        startPolling(next);
        void checkStatus(next);
        return next;
      } catch (e) {
        if (partialBatchOp) {
          const tracked = compactSubmittedBatch(partialBatchOp);
          setOp(tracked);
          persist(tracked, depsRef.current.network);
          addLog(
            "warn",
            `Submitted ${tracked.transferBatch?.chunks.length ?? 0} bridge transaction before the remaining amount hit the current bridge capacity limit. Track the submitted transaction from the operation panel.`
          );
          startPolling(tracked);
          void checkStatus(tracked);
          return tracked;
        }
        addLog("error", `Transfer failed: ${(e as Error).message}`);
        throw e;
      } finally {
        initiatingInFlightRef.current = false;
        setInitiatingKind(null);
        setPhase("idle");
      }
    },
    [op, status?.type, addLog, clientFor, startPolling, checkStatus]
  );

  const deployWrappedToken = useCallback(
    async (req: WrappedTokenDeploymentRequestDTO): Promise<WrappedTokenDeploymentResultDTO> => {
      if (initiatingInFlightRef.current) {
        throw new Error("An initiation is already in progress. Wait for the wallet flow to finish.");
      }
      if (op && status?.type !== "Executed") {
        throw new Error("A bridge operation is already active. Finish it or clear it before starting another.");
      }
      if (!depsRef.current.solana) {
        throw new Error("Connect Phantom to create the Solana mint.");
      }
      if (req.solanaDecimals > req.baseDecimals) {
        throw new Error("Solana decimals must be less than or equal to the Base token decimals.");
      }

      const scalerExponent = req.baseDecimals - req.solanaDecimals;
      setPhase("initiating");
      initiatingInFlightRef.current = true;
      setInitiatingKind("wrap-token");
      setStatus(null);
      statusRef.current = null;
      addLog(
        "info",
        `Registering ${req.symbol}: ${req.baseToken} -> Solana decimals=${req.solanaDecimals}`
      );
      try {
        const route = routeFor("solana-to-base", depsRef.current.network);
        const operation = await clientFor(route).wrapToken({
          route,
          remoteToken: req.baseToken,
          name: req.name,
          symbol: req.symbol,
          decimals: req.solanaDecimals,
          scalerExponent,
          relay: { mode: req.relayMode ?? "auto" },
        });

        const next: PersistedOp = {
          kind: "wrap-token",
          messageRef: operation.messageRef,
          wrappedTokenDeployment: {
            baseToken: req.baseToken,
            mint: operation.mint,
            name: req.name,
            symbol: req.symbol,
            baseDecimals: req.baseDecimals,
            solanaDecimals: req.solanaDecimals,
            scalerExponent,
          },
          initiationTx: operation.initiationTx,
          createdAt: Date.now(),
        };
        setOp(next);
        persist(next, depsRef.current.network);
        addLog("ok", `Created Solana mint ${operation.mint}. tx: ${operation.initiationTx ?? "(see wallet)"}`);
        addLog("info", "Waiting for the Base registration message to execute before transfers can use this mint.");
        startPolling(next);
        void checkStatus(next);
        return { mint: operation.mint, initiationTx: operation.initiationTx };
      } catch (e) {
        addLog("error", `Token registration failed: ${(e as Error).message}`);
        throw e;
      } finally {
        initiatingInFlightRef.current = false;
        setInitiatingKind(null);
        setPhase("idle");
      }
    },
    [op, status?.type, addLog, checkStatus, clientFor, startPolling]
  );

  const recoverWrappedTokenRegistration = useCallback(
    async (signature: string) => {
      const cleanSignature = signature.trim();
      if (!cleanSignature) {
        throw new Error("Enter a Solana transaction signature.");
      }
      setIsRecovering(true);
      setStatus(null);
      statusRef.current = null;
      addLog("info", `Recovering token registration from Solana tx ${cleanSignature}...`);
      try {
        const route = routeFor("solana-to-base", depsRef.current.network);
        const recovered = await recoverWrapTokenRegistration({
          rpcUrl: depsRef.current.solanaRpc,
          route,
          signature: cleanSignature,
        });
        const next: PersistedOp = {
          kind: "wrap-token",
          messageRef: recovered.messageRef,
          wrappedTokenDeployment: {
            baseToken: recovered.baseToken,
            mint: recovered.mint,
            name: recovered.name,
            symbol: recovered.symbol,
            baseDecimals: recovered.baseDecimals,
            solanaDecimals: recovered.solanaDecimals,
            scalerExponent: recovered.scalerExponent,
          },
          initiationTx: recovered.initiationTx,
          createdAt: Date.now(),
        };
        stopPolling();
        setOp(next);
        persist(next, depsRef.current.network);
        addLog("ok", `Recovered Solana mint ${recovered.mint}.`);
        addLog("info", "Resumed tracking the Base registration message.");
        startPolling(next);
        void checkStatus(next);
        return next;
      } catch (e) {
        addLog("error", `Registration recovery failed: ${(e as Error).message}`);
        throw e;
      } finally {
        setIsRecovering(false);
      }
    },
    [addLog, checkStatus, startPolling, stopPolling]
  );

  const recoverBaseTransfer = useCallback(
    async (txHash: string) => {
      const cleanTxHash = txHash.trim();
      if (!/^0x[0-9a-fA-F]{64}$/.test(cleanTxHash)) {
        throw new Error("Enter a valid Base transaction hash.");
      }
      setIsRecovering(true);
      setStatus(null);
      statusRef.current = null;
      addLog("info", `Recovering Base transfer from tx ${cleanTxHash}...`);
      try {
        const next = await recoverBaseToSolanaTransferFromTx({
          txHash: cleanTxHash as Hash,
          deps: depsRef.current,
        });
        stopPolling();
        setOp(next);
        persist(next, depsRef.current.network);
        addLog("ok", "Recovered Base bridge transfer.");
        addLog("info", "Resumed tracking the Base-to-Solana message.");
        startPolling(next);
        void checkStatus(next);
        return next;
      } catch (e) {
        addLog("error", `Base transfer recovery failed: ${(e as Error).message}`);
        throw e;
      } finally {
        setIsRecovering(false);
      }
    },
    [addLog, checkStatus, startPolling, stopPolling]
  );

  const prove = useCallback(async () => {
    if (!op) return;
    setPhase("proving");
    addLog("info", "Generating proof and submitting it to Solana...");
    try {
      const res = await clientFor(op.messageRef.route, op.tokenMapping).prove(op.messageRef);
      addLog("ok", `Proof submitted: ${res.proofTx ?? "(n/a)"}`);
      void checkStatus(op);
    } catch (e) {
      const message = (e as Error).message;
      const stale = parseStaleBridgeState(message);
      if (stale) {
        addLog(
          "warn",
          `Waiting for Solana bridge state: Base block ${stale.bridgeBlock} is indexed, but this transfer is in block ${stale.transactionBlock}. Try Prove again after it catches up.`
        );
        return;
      }
      if (isSolanaBlockhashExpiry(message)) {
        addLog("warn", "Solana proof confirmation expired locally; checking on-chain status before retrying.");
        await checkStatus(op, { forceLog: true });
        return;
      }
      addLog("error", `Proof failed: ${message}`);
      throw e;
    } finally {
      setPhase("idle");
    }
  }, [op, addLog, clientFor, checkStatus]);

  const execute = useCallback(async () => {
    if (!op) return;
    setPhase("executing");
    addLog("info", "Executing the message on the destination...");
    try {
      const res = await clientFor(op.messageRef.route, op.tokenMapping).execute(op.messageRef);
      addLog("ok", `Execution submitted: ${res.executionTx ?? "(n/a)"}`);
      void checkStatus(op);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("Message not found") && message.includes("proven")) {
        addLog("warn", "Message is not proven on Solana yet. Click Prove first, then Execute once status is Executable.");
        return;
      }
      if (isSolanaBlockhashExpiry(message)) {
        addLog("warn", "Solana execution confirmation expired locally; checking on-chain status before retrying.");
        await checkStatus(op, { forceLog: true });
        return;
      }
      addLog("error", `Execution failed: ${message}`);
      throw e;
    } finally {
      setPhase("idle");
    }
  }, [op, addLog, clientFor, checkStatus]);

  const reset = useCallback(() => {
    stopPolling();
    setOp(null);
    setStatus(null);
    statusRef.current = null;
    persist(null, depsRef.current.network);
    addLog("info", "Cleared the current operation.");
  }, [stopPolling, addLog]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    op,
    status,
    capabilities,
    phase,
    initiatingKind,
    isPolling,
    isRecovering,
    log,
    transfer,
    deployWrappedToken,
    recoverWrappedTokenRegistration,
    recoverBaseTransfer,
    prove,
    execute,
    checkStatus,
    refreshCapabilities,
    reset,
  };
}
