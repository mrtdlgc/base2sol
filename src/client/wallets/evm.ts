"use client";

import { createWalletClient, custom, type WalletClient } from "viem";
import { base as viemBase, baseSepolia as viemBaseSepolia } from "viem/chains";
import { BRIDGE_NETWORKS } from "@/lib/bridge/networks";
import type { BridgeNetwork } from "@/lib/bridge/routes";
import type { Eip1193Provider, EvmConnection } from "./types";

function pickProvider(): Eip1193Provider {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask.");
  // If multiple providers are injected, prefer MetaMask.
  if (eth.providers?.length) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
  }
  return eth;
}

async function ensureBaseNetwork(provider: Eip1193Provider, network: BridgeNetwork): Promise<void> {
  const cfg = BRIDGE_NETWORKS[network];
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === cfg.baseChainIdHex) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.baseChainIdHex }],
    });
  } catch (err) {
    // 4902 = chain not added to the wallet.
    if ((err as { code?: number }).code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: cfg.baseChainIdHex,
            chainName: cfg.baseChainName,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [cfg.baseRpcUrl],
            blockExplorerUrls: [cfg.blockExplorerUrl],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectMetaMask(network: BridgeNetwork = "mainnet"): Promise<EvmConnection> {
  const provider = pickProvider();
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0] as `0x${string}` | undefined;
  if (!address) throw new Error("MetaMask returned no account.");

  await ensureBaseNetwork(provider, network);

  const walletClient = createWalletClient({
    chain: network === "testnet" ? viemBaseSepolia : viemBase,
    transport: custom(provider),
    account: address,
  }) as WalletClient;

  return { address, walletClient, account: address, network };
}

export function getEvmProviderForEvents(): Eip1193Provider | undefined {
  return typeof window !== "undefined" ? window.ethereum : undefined;
}
