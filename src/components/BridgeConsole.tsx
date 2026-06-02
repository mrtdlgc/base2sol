"use client";

import { useEffect, useMemo, useState } from "react";
import type { BridgeNetwork, Direction } from "@/lib/bridge/routes";
import { directionOf, NETWORK_LABELS } from "@/lib/bridge/routes";
import { BRIDGE_NETWORKS, defaultNetwork } from "@/lib/bridge/networks";
import { useWallets } from "@/client/useWallets";
import { useBridgeOperation } from "@/client/useBridgeOperation";
import { AssetForm } from "@/components/AssetForm";
import { StepFlow } from "@/components/StepFlow";
import { LogPanel } from "@/components/LogPanel";
import { WalletBar } from "@/components/WalletBar";
import { Field, Panel, Segmented } from "@/components/ui";

const B2S_BASE_TOKEN = "0x958e84D234B4D21306A1160693Ff7f8971eDdB07";
const B2S_SOLANA_MINT = "CgmuqgHUzZsD822L5MBPRyMRqZoEKYwmJyQJtT9tswsX";

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function BridgeConsole() {
  const [network, setNetwork] = useState<BridgeNetwork>(defaultNetwork());
  const [direction, setDirection] = useState<Direction>("base-to-solana");
  const [composeMode, setComposeMode] = useState<"transfer" | "registration">("transfer");
  const [relayMode, setRelayMode] = useState<"auto" | "manual">("manual");
  const [baseRpc, setBaseRpc] = useState(BRIDGE_NETWORKS[network].baseRpcUrl);
  const [solanaRpc, setSolanaRpc] = useState(BRIDGE_NETWORKS[network].solanaRpcUrl);
  const [showSettings, setShowSettings] = useState(false);

  const wallets = useWallets();
  const bridge = useBridgeOperation({
    evm: wallets.evm,
    solana: wallets.solana,
    baseRpc,
    solanaRpc,
    network,
  });
  const { refreshCapabilities } = bridge;

  function changeNetwork(next: BridgeNetwork) {
    if (next === network) return;
    wallets.disconnectEvm();
    wallets.disconnectSolana();
    setNetwork(next);
    setBaseRpc(BRIDGE_NETWORKS[next].baseRpcUrl);
    setSolanaRpc(BRIDGE_NETWORKS[next].solanaRpcUrl);
    setRelayMode("manual");
  }

  const initiateRequirements = useMemo(() => {
    if (composeMode === "registration") {
      return { evmRequired: false, solanaRequired: true };
    }
    if (direction === "base-to-solana") {
      return { evmRequired: true, solanaRequired: true };
    }
    return { evmRequired: relayMode === "manual", solanaRequired: true };
  }, [composeMode, direction, relayMode]);

  const activeDirection = bridge.op ? directionOf(bridge.op.messageRef.route) : direction;

  useEffect(() => {
    void refreshCapabilities(activeDirection);
  }, [activeDirection, refreshCapabilities, wallets.evm, wallets.solana, network]);

  const missing: string[] = [];
  if (initiateRequirements.solanaRequired && !wallets.solana) missing.push("Phantom");
  if (initiateRequirements.evmRequired && !wallets.evm) missing.push("MetaMask");
  const activeOperationBlocksInitiate = !!bridge.op && bridge.status?.type !== "Executed";
  const gated = missing.length > 0 || activeOperationBlocksInitiate;
  const gateReason = activeOperationBlocksInitiate
    ? "Finish or clear the current operation before starting another."
    : missing.length > 0
      ? `Connect ${missing.join(" + ")} to continue.`
      : undefined;

  const manualActionState = useMemo(() => {
    if (!bridge.op) {
      return {
        manualProveReady: false,
        manualExecuteReady: false,
        proveBlockedReason: undefined,
        executeBlockedReason: undefined,
      };
    }

    const opDirection = directionOf(bridge.op.messageRef.route);
    const proveBlockedReason =
      opDirection === "base-to-solana" && !wallets.solana
        ? "Connect Phantom to submit the Solana prove transaction."
        : undefined;
    const executeBlockedReason =
      opDirection === "base-to-solana" && !wallets.solana
        ? "Connect Phantom to execute on Solana."
        : opDirection === "solana-to-base" && !wallets.evm
          ? "Connect MetaMask to execute manually on Base. Auto-relay operations can still be monitored."
          : bridge.capabilities?.manualExecute === false
            ? "This route/client cannot manually execute the message."
            : undefined;

    return {
      manualProveReady: !proveBlockedReason,
      manualExecuteReady: !executeBlockedReason,
      proveBlockedReason,
      executeBlockedReason,
    };
  }, [bridge.capabilities?.manualExecute, bridge.op, wallets.evm, wallets.solana]);

  return (
    <>
      <section className="b2s-strip" aria-label="B2S token markets">
        <div className="b2s-strip-head">
          <img src="/brand/base2sol-icon-256.png" alt="B2S" />
          <div>
            <div className="b2s-kicker">These tokens are the same</div>
            <h2>B2S on Base and Solana</h2>
          </div>
        </div>
        <div className="b2s-token-grid">
          <a
            className="b2s-token-card base"
            href={`https://dexscreener.com/base/${B2S_BASE_TOKEN}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="b2s-card-logo">
              <img src="/brand/base2sol-icon-256.png" alt="" />
              <span className="chain-mark base">B</span>
            </span>
            <span className="b2s-token-meta">
              <span className="b2s-chain">Base</span>
              <span className="b2s-symbol">B2S</span>
              <code>{shortAddress(B2S_BASE_TOKEN)}</code>
            </span>
            <span className="b2s-dex">Dexscreener</span>
          </a>
          <a
            className="b2s-token-card solana"
            href={`https://dexscreener.com/solana/${B2S_SOLANA_MINT}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="b2s-card-logo">
              <img src="/brand/base2sol-icon-256.png" alt="" />
              <span className="chain-mark solana">S</span>
            </span>
            <span className="b2s-token-meta">
              <span className="b2s-chain">Solana</span>
              <span className="b2s-symbol">B2S</span>
              <code>{shortAddress(B2S_SOLANA_MINT)}</code>
            </span>
            <span className="b2s-dex">Dexscreener</span>
          </a>
        </div>
      </section>

      <div style={{ marginTop: 16 }}>
        <Field label="Environment">
          <Segmented<BridgeNetwork>
            value={network}
            onChange={changeNetwork}
            options={[
              { value: "mainnet", label: "Mainnet" },
              { value: "testnet", label: "Testnet" },
            ]}
          />
        </Field>
      </div>

      <WalletBar
        evm={wallets.evm}
        solana={wallets.solana}
        evmNetworkLabel={network === "testnet" ? "Base Sepolia" : "Base"}
        solanaNetworkLabel={network === "testnet" ? "Solana devnet" : "Solana"}
        evmRequired={initiateRequirements.evmRequired}
        solanaRequired={initiateRequirements.solanaRequired}
        onConnectEvm={() => void wallets.connectEvm(network)}
        onConnectSolana={() => void wallets.connectSolana()}
        onDisconnectEvm={wallets.disconnectEvm}
        onDisconnectSolana={wallets.disconnectSolana}
      />
      {wallets.error && (
        <div className="notice danger">
          {wallets.error}
        </div>
      )}

      <div className="notice warn">
        <b>Advanced bridge flow.</b> Bridge transactions are intended for users
        who understand cross-chain settlement. Base -&gt; Solana proof generation
        usually takes about half an hour, and funds are locked during that
        period. Do not use this flow for immediate arbitrage or time-sensitive
        movement between chains.
      </div>

      <div className="grid2">
        <Panel title="Bridge or register">
          <AssetForm
            direction={direction}
            onDirectionChange={setDirection}
            relayMode={relayMode}
            onRelayModeChange={setRelayMode}
            network={network}
            baseRpc={baseRpc}
            solanaRpc={solanaRpc}
            onModeChange={setComposeMode}
            onTransfer={(req) => void bridge.transfer(req)}
            onDeployWrappedToken={bridge.deployWrappedToken}
            busy={bridge.phase === "initiating" && bridge.initiatingKind === "transfer"}
            deployBusy={bridge.phase === "initiating" && bridge.initiatingKind === "wrap-token"}
            gated={gated}
            gateReason={gateReason}
            deployGated={!wallets.solana || activeOperationBlocksInitiate}
            deployGateReason={!wallets.solana ? "Connect Phantom to create the Solana mint." : activeOperationBlocksInitiate ? gateReason : undefined}
          />
        </Panel>

        <Panel title="Current operation">
          <StepFlow
            op={bridge.op}
            status={bridge.status}
            capabilities={bridge.capabilities}
            phase={bridge.phase}
            isPolling={bridge.isPolling}
            manualProveReady={manualActionState.manualProveReady}
            manualExecuteReady={manualActionState.manualExecuteReady}
            proveBlockedReason={manualActionState.proveBlockedReason}
            executeBlockedReason={manualActionState.executeBlockedReason}
            onProve={() => void bridge.prove()}
            onExecute={() => void bridge.execute()}
            onCheck={() => void bridge.checkStatus(undefined, { forceLog: true })}
            onReset={bridge.reset}
            onRecoverRegistration={bridge.recoverWrappedTokenRegistration}
            recoverBusy={bridge.isRecovering}
          />
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Activity">
          <LogPanel log={bridge.log} />
          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <button className="btn ghost" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? "Hide RPC settings" : "RPC settings"}
            </button>
          </div>
          {showSettings && (
            <div style={{ marginTop: 12 }}>
              <Field label={`${NETWORK_LABELS[network]} Base RPC URL`} hint="Public endpoints rate-limit; a dedicated RPC is recommended for proofs.">
                <input value={baseRpc} onChange={(e) => setBaseRpc(e.target.value)} />
              </Field>
              <Field label={`${NETWORK_LABELS[network]} Solana RPC URL`}>
                <input value={solanaRpc} onChange={(e) => setSolanaRpc(e.target.value)} />
              </Field>
            </div>
          )}
        </Panel>
      </div>

      <div className="notice">
        <b>Non-custodial.</b> base2sol asks MetaMask and Phantom to sign in your
        browser. No keys leave your machine. Verify token addresses and start
        with tiny amounts.
      </div>
    </>
  );
}
