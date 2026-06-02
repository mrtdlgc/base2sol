"use client";

import { useCallback, useEffect, useState } from "react";
import { connectMetaMask } from "./wallets/evm";
import { connectPhantom, getPhantomForEvents } from "./wallets/solana";
import type { EvmConnection, SolanaConnection } from "./wallets/types";
import type { BridgeNetwork } from "@/lib/bridge/routes";

export function useWallets() {
  const [evm, setEvm] = useState<EvmConnection | null>(null);
  const [solana, setSolana] = useState<SolanaConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectEvm = useCallback(async (network: BridgeNetwork = "mainnet") => {
    setError(null);
    try {
      setEvm(await connectMetaMask(network));
    } catch (e) {
      setError(`MetaMask: ${(e as Error).message}`);
    }
  }, []);

  const connectSolana = useCallback(async () => {
    setError(null);
    try {
      setSolana(await connectPhantom());
    } catch (e) {
      setError(`Phantom: ${(e as Error).message}`);
    }
  }, []);

  const disconnectEvm = useCallback(() => setEvm(null), []);
  const disconnectSolana = useCallback(() => setSolana(null), []);

  // React to MetaMask account/chain changes by clearing the stale connection.
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.on) return;
    const reset = () => setEvm(null);
    eth.on("accountsChanged", reset);
    eth.on("chainChanged", reset);
    return () => {
      eth.removeListener?.("accountsChanged", reset);
      eth.removeListener?.("chainChanged", reset);
    };
  }, []);

  // React to Phantom account/disconnect events by clearing the stale signer.
  useEffect(() => {
    const phantom = getPhantomForEvents();
    if (!phantom?.on) return;
    const reset = () => setSolana(null);
    phantom.on("accountChanged", reset);
    phantom.on("disconnect", reset);
    return () => {
      phantom.removeListener?.("accountChanged", reset);
      phantom.removeListener?.("disconnect", reset);
    };
  }, []);

  return {
    evm,
    solana,
    error,
    connectEvm,
    connectSolana,
    disconnectEvm,
    disconnectSolana,
  };
}
