"use client";

import {
  type BridgeClient,
  type BridgeRoute,
  createBridgeClient,
  type Logger,
} from "bridge-sdk";
import {
  base,
  baseSepolia,
  makeEvmAdapter,
  makeSolanaAdapter,
  solanaDevnet,
  solanaMainnet,
} from "bridge-sdk/chains";
import { address as toKitAddress, type KeyPairSigner, type SignatureBytes, type Transaction } from "@solana/kit";
import { networkOfRoute, routeMapKey } from "@/lib/bridge/routes";
import type { TokenMappingInput } from "@/lib/bridge/dto";
import type { EvmConnection, SolanaConnection } from "./wallets/types";

export interface BuildClientArgs {
  evm: EvmConnection | null;
  solana: SolanaConnection | null;
  baseRpc: string;
  solanaRpc: string;
  route: BridgeRoute;
  tokenMapping?: TokenMappingInput;
  logger?: Logger;
}

/**
 * Build a BridgeClient that signs with the user's browser wallets, entirely
 * client-side.
 * MetaMask is required only when an EVM transaction must be signed:
 *   - base -> solana: initiate on Base
 *   - solana -> base (manual relay): execute on Base
 * For solana -> base with auto-relay, the protocol relayer executes on Base, so
 * no EVM signature is needed.
 */
export function buildBrowserBridgeClient(args: BuildClientArgs): BridgeClient {
  const network = networkOfRoute(args.route);
  const baseChain = network === "testnet" ? baseSepolia : base;
  const solanaChain = network === "testnet" ? solanaDevnet : solanaMainnet;

  const evmAdapter = makeEvmAdapter({
    chain: baseChain,
    rpcUrl: args.baseRpc,
    wallet: args.evm
      ? { type: "viem", walletClient: args.evm.walletClient, account: args.evm.account }
      : { type: "none" },
  });

  const readOnlySolanaSigner: KeyPairSigner = {
    address: toKitAddress("11111111111111111111111111111111"),
    async signTransactions(_transactions: readonly Transaction[]): Promise<readonly Record<string, SignatureBytes>[]> {
      throw new Error("Connect Phantom (Solana) to sign this step.");
    },
  } as KeyPairSigner;

  const solanaAdapter = makeSolanaAdapter({
    chain: solanaChain,
    rpcUrl: args.solanaRpc,
    payer: args.solana?.signer ?? readOnlySolanaSigner,
  });

  const tokenMappings = args.tokenMapping
    ? {
        [routeMapKey(args.route)]: {
          [args.tokenMapping.sourceToken]: args.tokenMapping.destToken,
        },
      }
    : undefined;

  return createBridgeClient({
    chains: { base: evmAdapter, solana: solanaAdapter },
    bridgeConfig: tokenMappings ? { tokenMappings } : undefined,
    logger: args.logger,
  });
}
