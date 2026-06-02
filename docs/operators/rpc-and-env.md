# RPC and environment configuration

base2sol can run without an `.env` file. Defaults are bundled for mainnet and
testnet.

Dedicated RPC endpoints are still recommended for reliability, especially for
Base -> Solana proving.

## Environment variables

```bash
NEXT_PUBLIC_BRIDGE_NETWORK=mainnet
NEXT_PUBLIC_SITE_URL=https://base2sol.xyz
NEXT_PUBLIC_BASE_RPC_URL=https://base-rpc.publicnode.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-rpc.publicnode.com
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com
```

`NEXT_PUBLIC_BRIDGE_NETWORK` may be:

- `mainnet`
- `testnet`

Any other value defaults to mainnet.

`NEXT_PUBLIC_SITE_URL` controls metadata URLs for Open Graph, Twitter cards, and
canonical links.

## Build-time behavior

Next.js inlines `NEXT_PUBLIC_*` values into the browser bundle at build time.

For Docker and Coolify, set these as build variables, not only runtime
variables, if you want the client defaults to change.

## Runtime RPC settings

Users can override RPC URLs from the in-app `RPC settings` panel.

These overrides affect the current browser session. They are useful when a
public endpoint is slow, rate-limited, or missing the log access needed for
proof generation.

The official `https://api.mainnet-beta.solana.com` endpoint rejects browser
origin requests on mainnet. Use a browser-allowed public endpoint or a dedicated
provider endpoint for `NEXT_PUBLIC_SOLANA_RPC_URL`.

The app also avoids using `https://mainnet.base.org` as the browser default for
mainnet because it can rate-limit contract reads such as ERC20 metadata. If the
Base RPC setting still points there, switch it to
`https://base-rpc.publicnode.com` or a dedicated browser-safe Base endpoint.

## Secrets

Never put secrets in `NEXT_PUBLIC_*` variables.

These values are visible to every browser that loads the app. Use public RPC
URLs or provider endpoints that are safe to expose.

## RPC reliability guidance

Base -> Solana proof generation depends on reading Base transaction logs and
matching those logs to Solana bridge state. Public RPCs can fail here because of
rate limits, log retention behavior, or latency.

For production, use:

- a reliable Base RPC for Base and Base Sepolia;
- a reliable Solana RPC for mainnet-beta and devnet;
- separate mainnet and testnet endpoints;
- endpoint monitoring outside the app.
