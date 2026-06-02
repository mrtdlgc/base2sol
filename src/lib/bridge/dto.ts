import type { Direction } from "./routes";

export interface AssetInput {
  kind: "native" | "token" | "wrapped";
  /** Required when kind is token/wrapped: source-chain token address. */
  address?: string;
}

/** ERC20 <-> mint pair required for token transfers that need a mapping. */
export interface TokenMappingInput {
  /** Source token id (mint for Solana source, ERC20 for Base source). */
  sourceToken: string;
  /** Destination token id. */
  destToken: string;
}

export interface TransferRequestDTO {
  direction: Direction;
  asset: AssetInput;
  /**
   * Decimal string in the source asset's smallest unit.
   * Base-native assets are converted to protocol remoteAmount with the
   * registered scalar before calling bridgeToken.
   */
  amount: string;
  /**
   * Optional source-unit chunks for large Base -> Solana transfers. Each chunk
   * is submitted as a separate bridge message while `amount` remains the total
   * user-requested amount.
   */
  amountChunks?: string[];
  /** Destination-chain recipient. Base -> Solana may be a wallet owner or token account. */
  recipient: string;
  /** How to interpret a Base -> Solana token source. */
  baseTokenMode?: "native-base" | "bridge-wrapped";
  /** Whether a Base -> Solana Solana recipient is a wallet owner or a token account. */
  solanaRecipientMode?: "wallet" | "token-account";
  relayMode?: "auto" | "manual" | "none";
  tokenMapping?: TokenMappingInput;
}

export interface WrappedTokenDeploymentRequestDTO {
  /** Base ERC20 address to register and represent on Solana. */
  baseToken: `0x${string}`;
  name: string;
  symbol: string;
  /** Source-chain decimals used by the Base token. */
  baseDecimals: number;
  /** Decimals for the Solana Token-2022 wrapped mint. */
  solanaDecimals: number;
  relayMode?: "auto" | "manual";
}

export interface WrappedTokenDeploymentResultDTO {
  mint: string;
  initiationTx?: string;
}
