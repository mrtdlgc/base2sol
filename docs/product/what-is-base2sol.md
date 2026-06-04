# What is base2sol?

base2sol is a frontend for the Base <-> Solana bridge route powered by the
Base Bridge SDK.

The product exists because a generic bridge screen is not enough for token
teams. A team that has deployed a token on Base or Solana needs a clean way to
create the opposite-chain representation first. Once that representation
exists, users need a clear bridge interface for moving the token in both
directions.

base2sol combines those two jobs in one app.

## The main value proposition

base2sol lets a team make a Base token bridgeable to Solana, or a Solana token
bridgeable to Base, without asking users to manually understand bridge internals.

For a first-time Base token, the app:

1. takes the Base ERC20 contract address;
2. creates the Solana Token-2022 wrapped mint;
3. emits the registration message back to Base;
4. tracks the operation until the registration executes;
5. fills the new Solana mint into the transfer form.

After that, users can bridge the token from Base to Solana and back.

For a first-time Solana token, the app:

1. takes the Solana mint address;
2. fetches the mint decimals from Solana;
3. deploys a Base CrossChainERC20 representation through the Base bridge
   factory;
4. fills the new Base contract into the transfer form.

After that, users can bridge the token from Solana to Base and back.

## What base2sol is

- A browser-only bridge frontend.
- A product wrapper around the official Base Bridge route.
- A registration and transfer flow for Base ERC20s, Solana assets, and wrapped
  return assets.
- A deployment-ready Next.js app that can run on Coolify or any Docker host.

## What base2sol is not

- It is not a custodian. It never holds private keys.
- It is not a backend relayer. Protocol relayers are used only when the route and
  chosen relay mode support them.
- It is not a trusted token registry. Users and teams must verify addresses.
- It is not a market or swap product. It moves assets between chains.

## Why first-time registration matters

Bridge transfers require a known mapping between the token on the source chain
and the representation on the destination chain. For a token that has never
been bridged in the selected direction, that representation does not exist yet.

The registration flow is the setup step. Base-origin tokens create a Solana mint
and register that mint back on Base. Solana-origin tokens deploy a Base
CrossChainERC20 representation. Only after the destination representation exists
can normal transfers use the pair.
