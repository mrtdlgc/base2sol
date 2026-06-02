# Networks and deployments

base2sol uses the bridge deployments bundled in the vendored SDK.

## Supported environments

| Environment | Base chain | Chain ID | Solana cluster |
| --- | --- | ---: | --- |
| Mainnet | Base | 8453 | Solana mainnet-beta |
| Testnet | Base Sepolia | 84532 | Solana devnet |

## Default RPC endpoints

| Environment | Base RPC | Solana RPC |
| --- | --- | --- |
| Mainnet | `https://base-rpc.publicnode.com` | `https://solana-rpc.publicnode.com` |
| Testnet | `https://sepolia.base.org` | `https://api.devnet.solana.com` |

## Base bridge contracts

| Environment | Bridge contract |
| --- | --- |
| Mainnet | `0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188` |
| Testnet | `0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B` |

## Solana programs

| Environment | Bridge program | Relayer program |
| --- | --- | --- |
| Mainnet | `HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM` | `g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9` |
| Testnet | `7c6mteAcTXaQ1MFBCrnuzoZVTTAEfZwa6wgy4bqX3KXC` | `56MBBEYAtQAdjT4e1NzHD8XaoyRSTvfgbSVVcEcHj51H` |

## Solana bridge state accounts

These are the bridge state PDAs derived from the bridge program and the SDK's
`BRIDGE_SEED`.

| Environment | Bridge state account |
| --- | --- |
| Mainnet | `DMtzswCcRcsMmJasgHTNZcBHZvdBkrBe248CBdEXxpJm` |
| Testnet | `4nLSFFbRMa1dYz5kE5nNrujqjiGeMh1yMfXuP4qDGZ2g` |

## Native SOL sentinel

```text
SoL1111111111111111111111111111111111111111
```

This sentinel represents native SOL in bridge mappings. It is not the SPL
wrapped SOL mint.
