# Security model and limitations

base2sol is a non-custodial frontend. It reduces operational complexity, but it
does not remove bridge, wallet, RPC, or token-contract risk.

## Security model

- Private keys remain in MetaMask and Phantom.
- The app builds transactions in the browser.
- RPC providers submit transactions and read chain state.
- Pending operation state is stored locally in the user's browser.
- No base2sol backend signs, relays, stores private keys, or stores user funds.

## User responsibilities

Users and token teams must verify:

- Base token contract addresses;
- Solana mint addresses;
- recipient addresses;
- token decimals;
- selected network;
- wallet prompts before signing.

The pair verification panel helps with this by reading on-chain metadata and
bridge registration state. It does not prove that a token is official, endorsed,
or safe.

## Current limitations

| Limitation | Impact |
| --- | --- |
| Manual token mapping for existing pairs | Users must know or verify the destination token address. |
| One active operation per environment | The UI restores only the latest pending operation for mainnet and testnet. |
| No quote display | Users see transaction prompts but not a full fee quote before each route. |
| Public RPC defaults | Defaults are convenient but may be too slow or rate-limited for production. |
| Vendored SDK | SDK changes must be rebuilt and reviewed locally. |

## Operational guidance

- Start with tiny amounts.
- Prefer dedicated RPCs in production.
- Treat presets as convenience data, not authority.
- Review known-pair requests as listing requests, not security audits.
- Keep the vendored SDK pinned and review diffs before updating.
- Document known token mappings for your users.

## What clearing an operation does

`Clear` removes the local operation from the browser. It does not cancel or
reverse any on-chain transaction.

If a transaction has already been submitted, inspect it on the relevant chain
explorer and continue from the operation status when possible.
