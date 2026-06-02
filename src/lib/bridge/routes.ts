/**
 * Route + asset helpers. Pure, no secrets, safe on client and server.
 *
 * The Base Bridge is hub-and-spoke with Base as the permanent hub, so the only
 * valid routes are Base <-> Solana on mainnet and Base Sepolia <-> Solana devnet.
 */
import type { AssetRef, BridgeRoute } from "bridge-sdk";

export const BASE = "eip155:8453" as const;
export const BASE_SEPOLIA = "eip155:84532" as const;
export const SOLANA = "solana:mainnet" as const;
export const SOLANA_DEVNET = "solana:devnet" as const;

export type Direction = "base-to-solana" | "solana-to-base";
export type BridgeNetwork = "mainnet" | "testnet";

export const NETWORK_LABELS: Record<BridgeNetwork, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
};

export const NETWORK_CHAINS: Record<
  BridgeNetwork,
  { base: typeof BASE | typeof BASE_SEPOLIA; solana: typeof SOLANA | typeof SOLANA_DEVNET }
> = {
  mainnet: { base: BASE, solana: SOLANA },
  testnet: { base: BASE_SEPOLIA, solana: SOLANA_DEVNET },
};

export function routeFor(direction: Direction, network: BridgeNetwork = "mainnet"): BridgeRoute {
  const chains = NETWORK_CHAINS[network];
  return direction === "base-to-solana"
    ? { sourceChain: chains.base, destinationChain: chains.solana }
    : { sourceChain: chains.solana, destinationChain: chains.base };
}

export function directionOf(route: BridgeRoute): Direction {
  return route.sourceChain.startsWith("eip155:") ? "base-to-solana" : "solana-to-base";
}

export function networkOfRoute(route: BridgeRoute): BridgeNetwork {
  return route.sourceChain === BASE_SEPOLIA || route.destinationChain === BASE_SEPOLIA
    ? "testnet"
    : "mainnet";
}

/** SDK token-mapping key: `${source}->${dest}`. */
export function routeMapKey(route: BridgeRoute): string {
  return `${route.sourceChain}->${route.destinationChain}`;
}

export function nativeAsset(): AssetRef {
  return { kind: "native" };
}

export function tokenAsset(address: string): AssetRef {
  return { kind: "token", address };
}

export function wrappedAsset(address: string): AssetRef {
  return { kind: "wrapped", address };
}

/** Source asset symbol label for UI, given direction + asset kind. */
export function sourceChainLabel(direction: Direction): string {
  return direction === "base-to-solana" ? "Base" : "Solana";
}

export function destChainLabel(direction: Direction): string {
  return direction === "base-to-solana" ? "Solana" : "Base";
}
