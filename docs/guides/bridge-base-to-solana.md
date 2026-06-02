# Bridge Base to Solana

Use this guide when the Base asset already has a registered Solana destination.

If the Base ERC20 has never been registered on Solana, complete
[Register a Base token on Solana](register-a-base-token.md) first.

## Prerequisites

- MetaMask connected to Base or Base Sepolia.
- Phantom connected to Solana mainnet-beta or devnet.
- A registered destination Solana mint for token transfers.
- Enough source-chain funds for the transfer and enough gas for the Base
  transaction.

## Step 1: Select the route

1. Select the correct environment.
2. Set `Bridge direction` to `Base -> Solana`.
3. Choose the asset type:
   - `Base token`
   - `ETH`
   - `Solana token on Base`

For a Base ERC20 that is already registered, keep `Token status` set to
`Use existing mint`.

## Step 2: Enter token mapping

For ERC20 and wrapped-token transfers, enter:

- the Base token contract;
- the registered Solana mint.

The app requires `Verify pair` before `Start transfer` is enabled for existing
token mappings. For native Base ERC20s, verification must confirm that the Base
token and Solana mint are registered with the bridge.

For native SOL destinations, use the bridge native-SOL sentinel only when the
UI specifically asks for a SOL destination token:

```text
SoL1111111111111111111111111111111111111111
```

## Step 3: Enter amount and decimals

Enter the amount as a human-readable value, such as `0.001`.

Enter the source token decimals. For `Base token`, this means the Base ERC20
decimals, not the Solana mint decimals. base2sol fetches ERC20 metadata when it
can and converts the value to source-chain smallest units before submitting the
bridge operation.

## Step 4: Enter recipient

For Solana token transfers, the recipient can be:

- a Solana wallet owner; or
- an exact token account.

The recommended mode is `Wallet`. base2sol derives the associated token account
and creates it if needed before the Base transaction is sent.

Use `Token account` only when you already know the exact account that should
receive the token.

## Step 5: Start transfer

Click `Start transfer`.

For ERC20s, MetaMask may ask for two transactions:

1. approval for the Base bridge contract;
2. the bridge transaction itself.

The activity panel logs approval, simulation, submission, and confirmation.

## Step 6: Wait for Solana bridge state

After the Base transaction confirms, Solana must receive a bridge state update
that covers the Base block containing your transaction.

If `Prove` fails with a stale state message, wait and try again. This is normal
when the Base checkpoint has not reached Solana yet.

## Step 7: Prove and execute

Once the Base block is covered:

1. Click `Prove`.
2. Sign with Phantom.
3. Wait for status `Ready to execute`.
4. Click `Execute on Solana`.
5. Sign with Phantom again.

When the operation status is `Complete`, the destination message has executed.

## Status meanings

| Status | Meaning |
| --- | --- |
| Waiting | Source transaction exists, but the destination is not executable yet. |
| Ready to execute | The message has been proven and can be executed. |
| Executing | The destination transaction is in progress. |
| Complete | The message executed on the destination chain. |
