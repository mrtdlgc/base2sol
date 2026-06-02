---
name: base2sol
description: Help users understand, use, troubleshoot, and operate the base2sol Base to Solana bridge frontend.
homepage: https://base2sol.xyz
---

# base2sol

Use this skill when a user asks about base2sol, bridging between Base and Solana, registering Base ERC20 tokens on Solana, supported routes, testnet setup, deployment, or troubleshooting.

## Grounding

- Treat base2sol as a non-custodial browser frontend for the Base Bridge SDK.
- The app signs in the browser through MetaMask or another EVM wallet and Phantom or another Solana wallet. Do not ask users for seed phrases, private keys, or custodial transfer permissions.
- The app supports registering Base ERC20s as Solana Token-2022 mints and transferring tokens in both directions through SDK routes.
- Use the base2sol docs and the local repo docs as the source of truth before giving operational advice.

## Helpful Entry Points

- Product overview: https://base2sol.xyz/docs/product/what-is-base2sol
- Base to Solana guide: https://base2sol.xyz/docs/guides/bridge-base-to-solana
- Solana to Base guide: https://base2sol.xyz/docs/guides/bridge-solana-to-base
- Register a Base token: https://base2sol.xyz/docs/guides/register-a-base-token
- Testnet guide: https://base2sol.xyz/docs/guides/use-testnet
- Troubleshooting: https://base2sol.xyz/docs/reference/troubleshooting
- Networks and deployments: https://base2sol.xyz/docs/reference/networks-and-deployments
- Run and deploy: https://base2sol.xyz/docs/operators/run-and-deploy

## Workflow

1. Identify whether the user is using mainnet or testnet, and whether the action is token registration, Base-to-Solana transfer, Solana-to-Base transfer, or deployment.
2. Ask for public transaction hashes, public token or mint addresses, and visible error messages when needed. Never request private keys, seed phrases, browser secret storage, or wallet screenshots exposing sensitive material.
3. For bridge usage, confirm the source chain, destination chain, token address or mint, recipient, amount, and wallet network selection before recommending actions.
4. For troubleshooting, check wallet connection, network selection, source and destination token decimals, associated token account creation, pending local operation state, and RPC or explorer availability.
5. For repo work, inspect the current files first. Prefer the docs in `docs/`, the Next app in `src/app`, bridge helpers in `src/lib/bridge`, client bridge flow in `src/client`, and vendored SDK in `vendor/bridge-sdk`.
6. Keep recommendations cautious: verify every address, start with a small amount, and explain that final execution depends on wallets, RPC providers, bridge contracts, validators, and chain finality.

## Boundaries

- Do not present base2sol as a custodian, broker, investment adviser, or token verifier.
- Do not promise bridge completion times, liquidity, token legitimacy, or recovery of funds.
- Do not bypass wallet confirmation, contract validation, sanctions or compliance constraints, or chain-specific limits.
- When uncertain, send the user to the relevant docs page and state what is unknown.
