# What is base2sol?

base2sol is a frontend for the Base <-> Solana bridge route powered by the
Base Bridge SDK.

The product exists because a generic bridge screen is not enough for token
teams. A team that has deployed an ERC20 on Base needs a clean way to create the
Solana representation first. Once that representation exists, users need a clear
bridge interface for moving the token in both directions.

base2sol combines those two jobs in one app.

## The main value proposition

base2sol lets a team make a Base token bridgeable to Solana without asking users
to manually understand bridge internals.

For a first-time Base token, the app:

1. takes the Base ERC20 contract address;
2. creates the Solana Token-2022 wrapped mint;
3. emits the registration message back to Base;
4. tracks the operation until the registration executes;
5. fills the new Solana mint into the transfer form.

After that, users can bridge the token from Base to Solana and back.

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
and the representation on the destination chain. For a Base ERC20 that has never
been bridged to Solana, that mapping does not exist yet.

The registration flow is the setup step. It creates the Solana mint and tells
Base about the new representation. Only after that message executes can normal
Base -> Solana transfers use the mint.
