# Troubleshooting

This page explains the most common base2sol messages and what to do next.

## Phantom says there is no SOL

Make sure Phantom is connected to the same cluster selected in base2sol.

For testnet, Phantom must be on devnet and funded with devnet SOL. Mainnet SOL
does not pay devnet fees.

## Transaction did not pass signature verification

This usually means the wallet signed one transaction message but the submitted
wire transaction differed.

Refresh the page, reconnect Phantom, and try again. If the error persists, test
with a tiny amount and capture the full activity log before moving value.

## Solana bridge state is stale

Example:

```text
Solana bridge state is stale (behind transaction block).
Bridge state block: 42280500, Transaction block: 42282347
```

The Base transaction is in a block newer than the latest Base block posted to
Solana bridge state. Wait for the bridge state update, then click `Prove` again.

This is expected during Base -> Solana flows.

## Message not found

If execute says the message was not found on Solana, the message has not been
proven yet.

Click `Prove`, wait for status `Ready to execute`, then click execute again.

## ERC20 approval appears before bridge transfer

Base ERC20 transfers require allowance for the Base bridge contract.

If allowance is missing, MetaMask asks for an approval transaction before the
bridge transaction. The activity panel logs both phases separately.

## Could not fetch ERC20 metadata

The app reads `decimals` from the Base token contract before converting a human
amount into smallest units. For registration convenience, it also tries to read
`name` and `symbol`.

If `name` or `symbol` is rate-limited, base2sol still keeps the fetched
decimals and lets you enter the missing metadata manually. If `decimals` cannot
be fetched, switch the in-app Base RPC from `https://mainnet.base.org` to
`https://base-rpc.publicnode.com` or a dedicated Base endpoint.

## Public RPC is unreliable

Use the in-app `RPC settings` panel or configure build-time RPC variables.

For production deployments, public RPC endpoints are useful defaults but should
not be treated as the operational path for meaningful transfers.

On mainnet, `https://api.mainnet-beta.solana.com` can return `HTTP error
(403)` to browser-origin requests. Use a browser-allowed Solana mainnet RPC,
such as the bundled default, or a dedicated provider endpoint.

On Base mainnet, `https://mainnet.base.org` can return `over rate limit` for
browser ERC20 reads. The bundled mainnet default is
`https://base-rpc.publicnode.com`, and the metadata reader also tries
`https://1rpc.io/base` as a fallback.

## Phantom confirmed, then the app reported a registration error

If Phantom showed a confirmation and the transaction landed on Solana, do not
retry the registration immediately. The old browser confirmation watcher could
fail after submission, leaving the app without a saved operation even though
Solana created the mint and outgoing message.

Open the `Current operation` panel, paste the Solana transaction signature into
`Recover registration`, and click `Recover`. base2sol reconstructs the pending
Base registration message and resumes status polling from the on-chain
transaction.

## Recipient token account creation expired

Example:

```text
Signature ... has expired: block height exceeded
```

For Base -> Solana token transfers, base2sol first makes sure the Solana
recipient token account exists. If that Phantom-signed setup transaction
expires, no Base transfer has been submitted yet.

Try the transfer again. If the Solana setup transaction landed late, base2sol
will detect and reuse the token account. If it did not land, base2sol will ask
Phantom to create it again with a fresh blockhash.

## Approval confirmed, then bridgeToken reverted

If the approval transaction succeeds but `bridgeToken` reverts with
`TransferFromFailed()`, the bridge transfer was not submitted. The most common
cause is public-RPC read-after-write lag: the approval receipt is visible, but a
following simulation still reads stale allowance state.

base2sol waits for the updated allowance to become visible before simulating the
bridge transfer. If the RPC remains stale, retry the transfer after a few
seconds; the existing approval will be reused.
