# base2sol

base2sol is a non-custodial frontend for the official Base Bridge
Base <-> Solana route.

It is built for token teams and power users who need to:

- register a Base ERC20 as a Solana Token-2022 mint for the first time;
- register a Solana SPL or Token-2022 mint as a Base CrossChainERC20 for the
  first time;
- bridge registered Base assets to Solana;
- bridge Solana assets or wrapped Base assets back to Base;
- resume pending bridge operations from the browser.

base2sol uses the vendored `base/bridge-sdk` package and signs transactions
with the user's browser wallets. There is no app backend and no server-side key
material.

## Documentation

The full documentation source lives in [`docs/`](docs/README.md).
The app renders those Markdown files directly at `/docs`, so documentation
ships with the product and does not depend on a hosted docs provider.

Start here:

- [What is base2sol?](docs/product/what-is-base2sol.md)
- [How the bridge works](docs/product/how-it-works.md)
- [Register a Base token on Solana](docs/guides/register-a-base-token.md)
- [Register a Solana token on Base](docs/guides/register-a-solana-token.md)
- [Bridge Base to Solana](docs/guides/bridge-base-to-solana.md)
- [Bridge Solana to Base](docs/guides/bridge-solana-to-base.md)
- [Request a known pair](docs/guides/request-known-pair.md)
- [Run and deploy](docs/operators/run-and-deploy.md)

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

No `.env` file is required for local development. Optional public RPC overrides
are documented in [RPC and environment configuration](docs/operators/rpc-and-env.md).

## Scripts

```bash
npm run dev         # Next.js development server
npm run typecheck   # TypeScript type gate
npm run build       # Production build
```

`next build` can compile successfully on this Windows host and then fail with
`spawn EPERM` while spawning a worker. Use `npm run typecheck` as the local type
gate. Linux Docker/Coolify builds do not use this Windows worker path.

## Important Safety Notes

- The vendored bridge SDK is work in progress. Start with tiny amounts.
- Use pair verification before signing. The app can read bridge registration
  and on-chain metadata, but known pairs are convenience listings, not a trusted
  token registry.
- `NEXT_PUBLIC_*` variables are visible in the browser bundle. Only put public
  site metadata and public RPC URLs in them.
- Public RPC endpoints may rate-limit or lag. A dedicated Base RPC is strongly
  recommended for Base -> Solana proving.
