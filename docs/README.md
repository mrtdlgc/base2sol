# Welcome to base2sol

base2sol is a production-oriented browser interface for bridging between Base
and Solana through the official Base Bridge route.

The product is designed around the workflow that matters most to token teams:
take an ERC20 that already exists on Base, create its Solana representation, and
then let users bridge between Base and Solana from the same interface.

These docs are plain Markdown in the repository and are rendered by the
base2sol app itself at `/docs`.

## What base2sol does

base2sol gives teams a frontend for the complete token lifecycle:

1. Register a Base ERC20 on Solana.
2. Create the corresponding Solana Token-2022 mint.
3. Execute the registration message on Base.
4. Bridge the token from Base to Solana.
5. Bridge the Solana representation back to Base.

It also supports native and already-registered route flows such as SOL, ETH,
SPL tokens, Base ERC20s, and bridge-wrapped return assets.

## Who it is for

base2sol is for:

- token teams that launched on Base and want a Solana representation;
- Solana teams that need a Base bridge surface for their asset;
- operators deploying a branded bridge frontend;
- users who understand token addresses and want explicit bridge controls.

It is not a centralized exchange, a custodian, or a token-list authority.

## Core concepts

| Concept | Meaning |
| --- | --- |
| Registered pair | A source-chain token and destination-chain representation known to the bridge. |
| First-time registration | The flow that creates a Solana Token-2022 mint for a Base ERC20 and registers it back on Base. |
| Scalar | The decimal conversion used when Base and Solana token decimals differ. |
| Prove | The Base -> Solana step that anchors a Base message against the Solana bridge state. |
| Execute | The final destination-chain transaction that completes the message. |

## Start here

- New to the product: [What is base2sol?](product/what-is-base2sol.md)
- Token team: [Register a Base token on Solana](guides/register-a-base-token.md)
- User moving funds: [Bridge Base to Solana](guides/bridge-base-to-solana.md)
- Operator: [Run and deploy](operators/run-and-deploy.md)
- Maintainer: [Request a known pair](guides/request-known-pair.md)

## Safety posture

base2sol is non-custodial. MetaMask and Phantom sign in the browser. No private
keys leave the user's machine.

That does not remove bridge risk. Pair verification reads bridge registration
and token metadata from chain state, but it does not certify token legitimacy.
Always verify token addresses, use trusted RPC endpoints, and test with a small
amount before moving meaningful value.
