import { PublicKey } from "@solana/web3.js";

/**
 * Encode a Solana address as the 32-byte `remoteToken` the Base bridge expects.
 * The bytes are the raw ed25519 public key in standard (big-endian) order, which
 * is exactly what the Solana side sends, so the bridge's equality checks line up.
 */
export function bytes32FromSolanaAddress(value: string): `0x${string}` {
  return `0x${Array.from(new PublicKey(value).toBytes(), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}
