# Register a Solana token on Base

Use this guide when a Solana SPL or Token-2022 mint has never been bridged to
Base before.

Registration deploys a Base CrossChainERC20 representation for the Solana mint.
After deployment, users can bridge the Solana token to Base.

## Prerequisites

- A Solana SPL or Token-2022 mint on mainnet-beta or devnet.
- MetaMask on Base or Base Sepolia.
- The token name and symbol you want users to see on Base.
- The Solana mint decimals. base2sol can fetch these from the mint account.

## Step 1: Choose the environment

Select `Mainnet` for Base mainnet and Solana mainnet-beta.

Select `Testnet` for Base Sepolia and Solana devnet.

Changing environments disconnects wallets so the app does not accidentally keep
a wallet connected to the wrong chain.

## Step 2: Choose the registration flow

In the bridge form:

1. Set `Bridge direction` to `Solana -> Base`.
2. Set `What are you moving?` to `Solana token`.
3. Set `Token status` to `Create Base ERC20`.

The form changes from transfer mode to registration mode.

## Step 3: Enter the Solana mint

Paste the Solana mint address into `Solana mint address`.

Click `Fetch mint details` to read the mint decimals and supply from Solana.
Review the fetched decimals before continuing.

## Step 4: Set Base token metadata

Fill:

- `Base token name`
- `Symbol`

`Solana decimals` is read-only. It is filled from the mint when you fetch its
details, and the Base ERC20 always mirrors those decimals exactly. The bridge
mints the Base representation 1:1 with the Solana amount, so matching decimals is
what keeps displayed balances correct.

## Step 5: Create the Base ERC20

Click `Create Base ERC20`.

base2sol re-reads the mint decimals, then MetaMask signs a Base transaction that
calls the bridge's CrossChainERC20Factory with those decimals. When the
transaction confirms, base2sol fills the new Base token contract into the
destination token field and switches back to `Use existing ERC20`.

## Step 6: Bridge the token

Run `Verify pair` and review both addresses.

You can now start a normal Solana -> Base transfer.

## Common mistakes

| Symptom | Fix |
| --- | --- |
| MetaMask is required | Solana-token registration deploys a Base ERC20, so the setup transaction is signed on Base. |
| Mint details fail to load | Check that the mint exists on the selected Solana cluster and that the Solana RPC is reachable. |
| Mint is "not bridgeable" | The mint uses a Token-2022 extension base2sol cannot bridge: a transfer hook, the non-transferable extension, or a frozen-by-default account state. The bridge locks tokens with a plain transfer, which these extensions block. Plain SPL and Token-2022 mints (including transfer-fee mints) are supported. |
| `Create Base ERC20` is disabled | Click `Fetch mint details` first. The button stays disabled until the current mint's decimals are read and the mint is confirmed bridgeable. |
| Deployment reverts | The same name, symbol, decimals, and Solana mint may already have been deployed. Switch to `Use existing ERC20` and enter that Base token. |
| Transfer is still blocked | Run `Verify pair` after deployment and confirm the Base token and Solana mint addresses. |
