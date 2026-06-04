# Bridge Solana to Base

Use this guide when the source asset is on Solana and the destination is Base.

## Prerequisites

- Phantom connected to Solana mainnet-beta or devnet.
- Enough SOL for transaction fees.
- A Base recipient address.
- A Base CrossChainERC20 representation for SPL or Token-2022 transfers.
- MetaMask if you choose manual execution on Base.

## Step 1: Select the route

1. Select the correct environment.
2. Set `Bridge direction` to `Solana -> Base`.
3. Choose the asset type:
   - `SOL`
   - `Solana token`
   - `Base token on Solana`

## Step 2: Enter token mapping

For SPL or Token-2022 transfers, enter:

- the Solana mint address;
- the mapped Base token contract.

If the Solana mint has never been registered on Base, complete
[Register a Solana token on Base](register-a-solana-token.md) first.

For `Base token on Solana`, enter the Solana wrapped mint that represents the
Base token.

The app requires `Verify pair` before `Start transfer` is enabled for existing
token mappings. If the Solana mint does not exist, the Base token cannot be
read, or the required bridge registration is missing, the transfer stays
blocked.

## Step 3: Enter amount and recipient

Enter the human-readable amount and source decimals.

Enter the Base recipient address as an EVM address beginning with `0x`.

## Step 4: Choose relay mode

`Relay for me` pays the protocol relay fee and lets the protocol relayer execute
the destination message on Base.

`I'll execute` requires MetaMask for the final Base transaction.

Auto-relay is the simplest user flow when it is available. Manual execution is
useful for testnet, debugging, or when a user wants to avoid the relay payment.

## Step 5: Start transfer

Click `Start transfer` and sign with Phantom.

base2sol stores the outgoing message and begins polling for execution status.

## Step 6: Complete the operation

If auto-relay was selected, wait for status `Complete`.

If manual execution was selected:

1. connect MetaMask;
2. wait until the operation panel enables execution;
3. click `Execute on Base`;
4. sign the Base transaction.

The operation is complete once the message executes on Base.
