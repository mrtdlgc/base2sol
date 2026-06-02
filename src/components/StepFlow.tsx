"use client";

import { useState } from "react";
import type { ExecutionStatus, MessageRef, RouteCapabilities } from "bridge-sdk";
import type { PersistedOp } from "@/client/useBridgeOperation";
import { StatusBadge } from "@/components/StatusBadge";
import { Field, KeyVal } from "@/components/ui";

interface Props {
  op: PersistedOp | null;
  status: ExecutionStatus | null;
  capabilities: RouteCapabilities | null;
  phase: string;
  isPolling: boolean;
  manualProveReady: boolean;
  manualExecuteReady: boolean;
  proveBlockedReason?: string;
  executeBlockedReason?: string;
  onProve: () => void;
  onExecute: () => void;
  onCheck: () => void;
  onReset: () => void;
  onRecoverRegistration: (signature: string) => Promise<unknown>;
  onRecoverBaseTransfer: (txHash: string) => Promise<unknown>;
  recoverBusy: boolean;
}

function shortId(ref: MessageRef): string {
  return `${ref.source.id.scheme}:${ref.source.id.value.slice(0, 14)}...`;
}

function chainName(chain: string): string {
  if (chain === "eip155:8453") return "Base";
  if (chain === "eip155:84532") return "Base Sepolia";
  if (chain === "solana:mainnet") return "Solana";
  if (chain === "solana:devnet") return "Solana devnet";
  return chain;
}

export function StepFlow({
  op,
  status,
  capabilities,
  phase,
  isPolling,
  manualProveReady,
  manualExecuteReady,
  proveBlockedReason,
  executeBlockedReason,
  onProve,
  onExecute,
  onCheck,
  onReset,
  onRecoverRegistration,
  onRecoverBaseTransfer,
  recoverBusy,
}: Props) {
  const [recoverySignature, setRecoverySignature] = useState("");
  const [baseRecoveryTx, setBaseRecoveryTx] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const steps = capabilities?.steps ?? ["initiate", "prove", "execute", "monitor"];
  const proveSupported = steps.includes("prove") && capabilities?.prove !== false;
  const executeSupported = steps.includes("execute") && capabilities?.manualExecute !== false;
  const busy = phase !== "idle";
  const done = status?.type === "Executed";
  const proofSubmitted = status?.type === "Executable";
  const canProve = !!op && proveSupported && manualProveReady && !done && !proofSubmitted;
  const executeStatusBlocked =
    !!op && executeSupported && !done && !proofSubmitted
      ? proveSupported
        ? "Prove the message before executing it."
        : "Check status until the message is executable."
      : undefined;
  const canExecute =
    !!op && executeSupported && manualExecuteReady && !done && proofSubmitted;
  const buttonHint = proveBlockedReason ?? executeBlockedReason ?? executeStatusBlocked;
  const executeDestination = op ? chainName(op.messageRef.route.destinationChain) : "destination";
  const waitingForCheckpoint =
    op?.messageRef.route.sourceChain.startsWith("eip155:") && status?.type === "Initiated";

  async function submitRecovery() {
    const cleanSignature = recoverySignature.trim();
    setRecoveryError(null);
    try {
      await onRecoverRegistration(cleanSignature);
      setRecoverySignature("");
    } catch (e) {
      setRecoveryError((e as Error).message);
    }
  }

  async function submitBaseRecovery() {
    const cleanTx = baseRecoveryTx.trim();
    setRecoveryError(null);
    try {
      await onRecoverBaseTransfer(cleanTx);
      setBaseRecoveryTx("");
    } catch (e) {
      setRecoveryError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <StatusBadge status={status} />
        {capabilities && (
          <span className="badge">
            {capabilities.autoRelay ? "auto-relay available" : "manual relay"}
          </span>
        )}
      </div>

      {!op ? (
        <>
          <div className="hint" style={{ marginBottom: 12 }}>
            No active operation. Register a new Base token or start a bridge
            transfer from the left panel. base2sol saves pending operations in this
            browser so you can come back later.
          </div>
          <Field label="Recover registration">
            <div className="row">
              <input
                value={recoverySignature}
                onChange={(e) => setRecoverySignature(e.target.value)}
                placeholder="Solana transaction signature"
              />
              <button
                className="btn ghost"
                disabled={recoverBusy}
                onClick={() => void submitRecovery()}
              >
                {recoverBusy ? "Recovering..." : "Recover"}
              </button>
            </div>
            {recoveryError && (
              <div className="hint error" style={{ marginTop: 8 }}>
                {recoveryError}
              </div>
            )}
          </Field>
          <Field label="Recover Base transfer">
            <div className="row">
              <input
                value={baseRecoveryTx}
                onChange={(e) => setBaseRecoveryTx(e.target.value)}
                placeholder="Base bridge transaction hash"
              />
              <button
                className="btn ghost"
                disabled={recoverBusy}
                onClick={() => void submitBaseRecovery()}
              >
                {recoverBusy ? "Recovering..." : "Recover"}
              </button>
            </div>
          </Field>
        </>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <KeyVal
            rows={[
              [
                "operation",
                op.kind === "wrap-token"
                  ? "register Base token on Solana"
                  : op.transferBatch
                    ? `bridge transfer chunk ${op.transferBatch.currentIndex + 1}/${op.transferBatch.totalChunks}`
                    : "bridge transfer",
              ],
              ["route", `${chainName(op.messageRef.route.sourceChain)} -> ${chainName(op.messageRef.route.destinationChain)}`],
              ...(op.transferBatch
                ? ([
                    ["total amount", `${op.transferBatch.totalAmount} source units`],
                    ["submitted chunks", `${op.transferBatch.chunks.length}/${op.transferBatch.totalChunks}`],
                    [
                      "current chunk",
                      `${op.transferBatch.chunks[op.transferBatch.currentIndex]?.amount ?? "unknown"} source units`,
                    ],
                  ] as [string, string][])
                : []),
              ["message", shortId(op.messageRef)],
              ["source tx", op.initiationTx ?? "(see activity)"],
              ["started", new Date(op.createdAt).toLocaleString()],
              ...(op.wrappedTokenDeployment
                ? ([
                    ["base token", op.wrappedTokenDeployment.baseToken],
                    ["solana mint", op.wrappedTokenDeployment.mint],
                    ["scalar", `10^${op.wrappedTokenDeployment.scalerExponent}`],
                    ["registration", op.wrappedTokenDeployment.executed ? "executed on Base" : "waiting for execution"],
                  ] as [string, string][])
                : []),
              ...(status && "sourceBlockNumber" in status && status.sourceBlockNumber
                ? ([["source block", status.sourceBlockNumber]] as [string, string][])
                : []),
              ...(status && "bridgeStateBlockNumber" in status && status.bridgeStateBlockNumber
                ? ([["indexed Base block", status.bridgeStateBlockNumber]] as [string, string][])
                : []),
              ...(status && "reason" in status ? ([["reason", String(status.reason)]] as [string, string][]) : []),
            ]}
          />
        </div>
      )}

      {waitingForCheckpoint && (
        <div className="notice" style={{ marginTop: 0, marginBottom: 12 }}>
          {"reason" in status && status.reason
            ? status.reason
            : "Waiting for the Base checkpoint on Solana. When the bridge state catches up to this Base transaction, click Prove."}
        </div>
      )}

      <div className="steps">
        {steps.map((s, i) => {
          const isDone =
            (s === "initiate" && !!op) ||
            (s === "prove" && (status?.type === "Executable" || status?.type === "Executed")) ||
            (s === "execute" && status?.type === "Executed");
          const desc: Record<string, string> = {
            initiate: "Source transaction submitted and confirmed.",
            prove: "Anchor the source message on the destination chain.",
            execute: "Finish the message and mint or unlock funds.",
            monitor: "Track the operation until it is complete.",
          };
          const title: Record<string, string> = {
            initiate: "Start",
            prove: "Prove",
            execute: "Execute",
            monitor: "Complete",
          };
          return (
            <div className="step" key={s} data-done={isDone}>
              <div className="num">{i + 1}</div>
              <div className="meta">
                <div className="t">{title[s] ?? s}</div>
                <div className="d">{desc[s]}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn solana" disabled={!canProve || busy} onClick={onProve} title={proveBlockedReason}>
          {phase === "proving" ? "Proving..." : "Prove"}
        </button>
        <button className="btn" disabled={!canExecute || busy} onClick={onExecute} title={executeBlockedReason ?? executeStatusBlocked}>
          {phase === "executing" ? "Executing..." : `Execute on ${executeDestination}`}
        </button>
        <button className="btn ghost" disabled={!op || busy || isPolling} onClick={onCheck}>
          {isPolling ? "Checking..." : "Check status"}
        </button>
        <button className="btn ghost" disabled={!op} onClick={onReset} style={{ marginLeft: "auto" }}>
          Clear
        </button>
      </div>

      {buttonHint && op && !done && (
        <div className="hint warn" style={{ marginTop: 8 }}>
          {buttonHint}
        </div>
      )}

      {done && (
        <div className="notice success">
          Complete. The message executed on {executeDestination}.
        </div>
      )}
    </div>
  );
}
