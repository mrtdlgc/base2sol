/**
 * Convenience presets. These are NOT a trusted registry; verify every address
 * on-chain before moving real value. They exist only to make manual testing of
 * the canonical SOL route fast.
 *
 * SOL on Base is the ERC20 representation minted by the bridge. The remote
 * Solana token is the bridge's native-SOL sentinel, not the SPL wrapped SOL
 * mint (`So111...`).
 */
export interface TokenPreset {
  label: string;
  /** Form mode to use when bridging from Base to Solana. */
  baseToSolanaMode: "base-native-erc20" | "base-wrapped-solana";
  /** Form mode to use when bridging from Solana to Base. */
  solanaToBaseMode: "sol-native" | "sol-spl" | "sol-wrapped-base";
  /** ERC20 address on Base (source for base-to-solana). */
  baseErc20: string;
  /** Solana mint or bridge sentinel (destination for base-to-solana). */
  solanaMint: string;
  /** Decimals on the Base side (used for human <-> base-unit conversion). */
  baseDecimals: number;
  /** Decimals on the Solana side. */
  solanaDecimals: number;
}

/**
 * Wrapped SOL ERC20 on Base, per Base docs "Contract Addresses" table.
 * Treat as a default to verify, not as gospel; the docs have historically
 * listed more than one address.
 */
export const TOKEN_PRESETS: TokenPreset[] = [
  {
    label: "B2S",
    baseToSolanaMode: "base-native-erc20",
    solanaToBaseMode: "sol-wrapped-base",
    baseErc20: "0x958e84D234B4D21306A1160693Ff7f8971eDdB07",
    solanaMint: "CgmuqgHUzZsD822L5MBPRyMRqZoEKYwmJyQJtT9tswsX",
    baseDecimals: 18,
    solanaDecimals: 9,
  },
  {
    label: "SOL",
    baseToSolanaMode: "base-wrapped-solana",
    solanaToBaseMode: "sol-native",
    baseErc20: "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82",
    solanaMint: "SoL1111111111111111111111111111111111111111",
    baseDecimals: 9,
    solanaDecimals: 9,
  },
];

export function findPreset(label: string): TokenPreset | undefined {
  return TOKEN_PRESETS.find((p) => p.label === label);
}
