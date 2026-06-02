# Use testnet

base2sol supports a test environment made of Base Sepolia and Solana devnet.

Use testnet before mainnet registration or transfer flows.

## Networks

| base2sol environment | Base network | Solana cluster |
| --- | --- | --- |
| Mainnet | Base | Solana mainnet-beta |
| Testnet | Base Sepolia | Solana devnet |

## Wallet setup

MetaMask must be connected to Base Sepolia.

Phantom must have developer mode enabled and must be connected to devnet. SOL on
mainnet or another cluster will not pay devnet transaction fees.

## Registration behavior

First-time Base token registration defaults to manual execution on testnet.

That means:

1. Phantom creates the Solana devnet mint.
2. base2sol tracks the registration message.
3. MetaMask executes that message on Base Sepolia when it is ready.

## Base -> Solana proving delay

Base -> Solana requires the Solana bridge state to catch up to the Base Sepolia
block that contains your transaction.

If you see a stale state warning, the Base transaction can still be valid. Wait
for the next bridge state update and try `Prove` again.

## Common testnet checklist

- Base Sepolia ETH for MetaMask gas.
- Devnet SOL for Phantom fees.
- Correct environment selected in base2sol.
- Correct wallet network selected in both wallets.
- Dedicated RPC if public endpoints rate-limit.
- Small test amount.
