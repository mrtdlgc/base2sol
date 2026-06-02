import type {
  Account,
  Chain,
  Hash,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from "viem";
import type { ChainAdapter, ChainRef } from "../../../core/types";

export type EvmWalletConfig =
  | { type: "privateKey"; key: Hex }
  /**
   * Externally-built viem wallet client + signing account/address. Use this to
   * sign with a browser wallet (e.g. MetaMask) by passing a wallet client built
   * from `custom(window.ethereum)`.
   */
  | { type: "viem"; walletClient: WalletClient; account: Account | `0x${string}` }
  | { type: "none" };

export type BridgeEvmChainRef = {
  id: `eip155:${number}`;
  chainId: number;
  viem: Chain;
};

type EvmAdapterConfigBase = {
  rpcUrl: string;
  wallet?: EvmWalletConfig;
};

export type EvmAdapterConfig = EvmAdapterConfigBase &
  (
    | {
        /** EVM chain id (e.g. 8453). */
        chainId: number;
        chain?: undefined;
      }
    | {
        /** Bridge SDK chain object (e.g. `import { base } from "bridge-sdk/chains"`). */
        chain: BridgeEvmChainRef;
        chainId?: undefined;
      }
    | {
        /** viem chain object (e.g. `import { base } from "viem/chains"`). */
        chain: Chain;
        chainId?: undefined;
      }
  );

export interface EvmChainAdapter extends ChainAdapter {
  readonly chain: ChainRef;
  readonly kind: "evm";
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly viemChain: Chain;
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  /** Present when wallet.type === "privateKey". */
  readonly privateKey?: Hex;
  /** Signing account/address; present for "privateKey" and "viem" wallets. */
  readonly account?: Account | `0x${string}`;

  /** Convenience reads */
  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt>;
}
