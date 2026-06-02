# Register a Base token on Solana

Use this guide when a Base ERC20 has never been bridged to Solana before.

Registration creates the Solana Token-2022 mint and registers that mint back on
Base. After registration executes, the token can be bridged Base -> Solana.

## Prerequisites

- A deployed ERC20 contract on Base or Base Sepolia.
- Phantom with SOL on the selected Solana cluster.
- MetaMask on Base or Base Sepolia if you plan to execute the registration
  manually.
- The ERC20 name, symbol, and decimals. base2sol can fetch these from the Base
  contract when the RPC supports the read.

## Step 1: Choose the environment

Select `Mainnet` for Base mainnet and Solana mainnet-beta.

Select `Testnet` for Base Sepolia and Solana devnet.

Changing environments disconnects wallets so the app does not accidentally keep
a wallet connected to the wrong chain.

## Step 2: Choose the registration flow

In the bridge form:

1. Set `Bridge direction` to `Base -> Solana`.
2. Set `What are you moving?` to `Base token`.
3. Set `Token status` to `Create new mint`.

The form changes from transfer mode to registration mode.

## Step 3: Enter the Base token

Paste the Base ERC20 contract address into `Base token contract`.

Click `Fetch ERC20 metadata` when available. Review every fetched value before
continuing.

## Step 4: Set Solana token metadata

Fill:

- `Solana token name`
- `Symbol`
- `Base decimals`
- `Solana decimals`

The Solana decimals must be less than or equal to the Base decimals. If the
Base token uses 18 decimals, a Solana mint with 9 decimals creates a scalar of
`10^9`.

## Step 5: Choose registration execution

`Relay for me` pays the protocol relay fee so the Base execution can happen
automatically when supported.

`I'll execute` skips the relay payment and requires a manual execute step from
the operation panel.

Testnet defaults to manual execution because devnet relay funding and timing can
be inconsistent.

## Step 6: Create mint and register

Click `Create mint & register`.

Phantom signs the Solana transaction. The app then shows:

- the created Solana mint;
- the initiation transaction;
- the registration message status.

Wait for the operation status to become `Complete`. If manual execution is
required, connect MetaMask and click the execute button in the operation panel.

## Step 7: Bridge the token

After the registration message executes on Base, base2sol fills the new Solana
mint into the destination token field and switches to `Use existing mint`.

You can now start a normal Base -> Solana transfer.

## Common mistakes

| Symptom | Fix |
| --- | --- |
| Phantom says there is no SOL | Make sure Phantom is on the same cluster as the selected environment and has SOL on that cluster. |
| Solana decimals are rejected | Use a value less than or equal to the Base token decimals. |
| Registration is not complete | Wait until the operation status is `Complete`; do not start the transfer before Base has executed the registration. |
| Metadata fetch fails | Switch the Base RPC to `https://base-rpc.publicnode.com` or a dedicated endpoint. If only name or symbol fails, enter the missing values manually. |
