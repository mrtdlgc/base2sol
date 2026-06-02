# Wallets and signing

base2sol signs entirely in the browser.

## Wallets

| Wallet | Used for |
| --- | --- |
| MetaMask | Base and Base Sepolia transactions. |
| Phantom | Solana mainnet-beta and devnet transactions. |

## Signing matrix

| Flow | Initiate | Prove | Execute |
| --- | --- | --- | --- |
| Register Base token on Solana | Phantom | Not user-facing | MetaMask if manual execution is selected |
| Base -> Solana | MetaMask | Phantom | Phantom |
| Solana -> Base with auto-relay | Phantom | Not applicable | Protocol relayer |
| Solana -> Base with manual execution | Phantom | Not applicable | MetaMask |

## Network switching

Changing the selected base2sol environment disconnects both wallets. This avoids
keeping a wallet session connected to the wrong network or cluster.

MetaMask is asked to use the configured Base chain.

Phantom must be set by the user to the correct Solana cluster. For testnet,
enable developer mode and select devnet in Phantom.

## Associated token accounts

For Base -> Solana token transfers, the destination must be a token account.

When the user enters a Solana wallet owner, base2sol derives the associated
token account for the destination mint. If it does not exist, Phantom creates it
before the Base transaction is submitted.

This prevents a Base transaction from being initiated with a destination account
that cannot receive the token.

## Local storage

The latest active operation is stored in localStorage per environment. This lets
the browser restore a pending operation after a reload.

localStorage is not a transaction history. Clearing the operation only clears
the local UI state; it does not revert an on-chain transaction.
