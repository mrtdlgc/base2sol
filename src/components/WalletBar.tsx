"use client";

import type { EvmConnection, SolanaConnection } from "@/client/wallets/types";

function trunc(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

interface Props {
  evm: EvmConnection | null;
  solana: SolanaConnection | null;
  evmNetworkLabel: string;
  solanaNetworkLabel: string;
  evmRequired: boolean;
  solanaRequired: boolean;
  onConnectEvm: () => void;
  onConnectSolana: () => void;
  onDisconnectEvm: () => void;
  onDisconnectSolana: () => void;
}

function WalletChip({
  name,
  net,
  address,
  required,
  onConnect,
  onDisconnect,
}: {
  name: string;
  net: string;
  address: string | null;
  required: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="wallet-chip" data-on={!!address}>
      <div className="wc-meta">
        <span className="wc-name">{name}</span>
        <span className="wc-net">{net}{required ? " - needed now" : ""}</span>
      </div>
      {address ? (
        <button className="btn ghost" onClick={onDisconnect} title={address}>
          {trunc(address)} disconnect
        </button>
      ) : (
        <button className={required ? "btn" : "btn ghost"} onClick={onConnect}>
          Connect
        </button>
      )}
    </div>
  );
}

export function WalletBar({
  evm,
  solana,
  evmNetworkLabel,
  solanaNetworkLabel,
  evmRequired,
  solanaRequired,
  onConnectEvm,
  onConnectSolana,
  onDisconnectEvm,
  onDisconnectSolana,
}: Props) {
  return (
    <div className="wallet-bar">
      <WalletChip
        name="MetaMask"
        net={evmNetworkLabel}
        address={evm?.address ?? null}
        required={evmRequired}
        onConnect={onConnectEvm}
        onDisconnect={onDisconnectEvm}
      />
      <WalletChip
        name="Phantom"
        net={solanaNetworkLabel}
        address={solana?.address ?? null}
        required={solanaRequired}
        onConnect={onConnectSolana}
        onDisconnect={onDisconnectSolana}
      />
    </div>
  );
}
