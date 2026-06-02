import type { BridgeNetwork } from "./routes";

export interface BridgeNetworkConfig {
  id: BridgeNetwork;
  label: string;
  baseChainId: number;
  baseChainIdHex: `0x${string}`;
  baseChainName: string;
  baseBridgeContract: `0x${string}`;
  baseRpcUrl: string;
  solanaRpcUrl: string;
  blockExplorerUrl: string;
}

const SOLANA_MAINNET_OFFICIAL_RPC_URL = "https://api.mainnet-beta.solana.com";
const SOLANA_MAINNET_BROWSER_RPC_URL = "https://solana-rpc.publicnode.com";
const BASE_MAINNET_OFFICIAL_RPC_URL = "https://mainnet.base.org";
const BASE_MAINNET_BROWSER_RPC_URL = "https://base-rpc.publicnode.com";

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function mainnetBaseRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim();
  const normalized = configured ? normalizeUrl(configured) : "";
  if (!configured || normalized === BASE_MAINNET_OFFICIAL_RPC_URL) {
    return BASE_MAINNET_BROWSER_RPC_URL;
  }
  return configured;
}

function mainnetSolanaRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  const normalized = configured ? normalizeUrl(configured) : "";
  if (!configured || normalized === SOLANA_MAINNET_OFFICIAL_RPC_URL) {
    return SOLANA_MAINNET_BROWSER_RPC_URL;
  }
  return configured;
}

export const BRIDGE_NETWORKS: Record<BridgeNetwork, BridgeNetworkConfig> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    baseChainId: 8453,
    baseChainIdHex: "0x2105",
    baseChainName: "Base",
    baseBridgeContract: "0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188",
    baseRpcUrl: mainnetBaseRpcUrl(),
    solanaRpcUrl: mainnetSolanaRpcUrl(),
    blockExplorerUrl: "https://basescan.org",
  },
  testnet: {
    id: "testnet",
    label: "Testnet",
    baseChainId: 84532,
    baseChainIdHex: "0x14a34",
    baseChainName: "Base Sepolia",
    baseBridgeContract: "0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B",
    baseRpcUrl:
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    solanaRpcUrl:
      process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com",
    blockExplorerUrl: "https://sepolia.basescan.org",
  },
};

export function defaultNetwork(): BridgeNetwork {
  return process.env.NEXT_PUBLIC_BRIDGE_NETWORK === "testnet" ? "testnet" : "mainnet";
}
