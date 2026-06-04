# Supported assets and routes

base2sol supports the Base <-> Solana routes exposed by the vendored bridge SDK.

## Route matrix

| Direction | UI option | Source asset | Destination behavior |
| --- | --- | --- | --- |
| Base -> Solana | Base token | Native Base ERC20 | Locks on Base and mints or releases the registered Solana representation. |
| Base -> Solana | ETH | Native ETH on Base | Locks ETH through the bridge native-ETH path. |
| Base -> Solana | Solana token on Base | Bridge-wrapped Base representation of a Solana asset | Burns on Base and releases the original Solana asset. |
| Solana -> Base | SOL | Native SOL | Locks SOL and creates the Base-side representation. |
| Solana -> Base | Solana token | SPL or Token-2022 mint | Locks the Solana token and mints or unlocks the mapped Base ERC20. |
| Solana -> Base | Base token on Solana | Wrapped Base token mint | Burns on Solana and unlocks the original Base ERC20. |

## First-time vs existing tokens

For `Base token`, the UI separates two cases:

- `Create new mint`: use this when the Base ERC20 has never been registered on
  Solana.
- `Use existing mint`: use this when the Solana mint already exists and you know
  its address.

The first-time flow is registration only. After registration executes, the app
fills the Solana mint and returns to the transfer flow.

For `Solana token`, the UI also separates two cases:

- `Create Base ERC20`: use this when the Solana mint has never been registered
  on Base.
- `Use existing ERC20`: use this when the Base CrossChainERC20 representation
  already exists and you know its address.

The Solana-token first-time flow deploys the Base ERC20 representation through
the Base bridge's CrossChainERC20Factory. It is a direct Base transaction, not a
cross-chain message.

## Token mappings

Token transfers need a source token and a destination token. base2sol accepts
those addresses directly in the UI.

The app includes a pair verification check for entered token pairs. It reads:

- Base ERC20 metadata;
- Solana mint program, decimals, supply, and initialization status;
- bridge scalar registration for the Base token and Solana mint;
- whether the pair appears in the app's known-pair presets.

Existing token transfers require pair verification before initiation. If the
remote token does not exist or a native Base-token pair is not registered with
the bridge, `Start transfer` remains blocked.

This verifies on-chain facts, not token legitimacy. Known mainnet presets may
exist as conveniences, but they are not a trusted registry. Always verify token
contracts and mints before signing.

Current known mainnet presets include `B2S` and `SOL`.

## Decimals and scalar

The bridge uses a scalar when the Base token decimals and Solana mint decimals
differ.

For a first-time Base token registration:

- `Base decimals` are read from the ERC20 when metadata fetch succeeds.
- `Solana decimals` default to a value no higher than the Base decimals.
- `Base scalar` is `10^(baseDecimals - solanaDecimals)`.

For a first-time Solana token registration, the Base ERC20 representation uses
the Solana mint decimals.

For existing Base token transfers, the amount field is converted with the Base
ERC20 decimals. For example, a token with 18 Base decimals and 9 Solana decimals
uses a scalar of `10^9`, so `1` Base token becomes `1_000_000_000` Solana
smallest units.

Solana decimals must be less than or equal to Base decimals.

## Native SOL sentinel

The bridge uses a sentinel address for native SOL:

```text
SoL1111111111111111111111111111111111111111
```

This is not the SPL wrapped SOL mint. Use it only where the UI or docs refer to
the bridge native-SOL sentinel.
