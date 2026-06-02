# How the bridge works

base2sol is a client-side app. It builds bridge transactions in the browser,
asks MetaMask or Phantom to sign them, and tracks the resulting cross-chain
message.

There is no base2sol server in the transaction path.

## Architecture

```text
User browser
  |
  |-- MetaMask signs Base / Base Sepolia transactions
  |
  |-- Phantom signs Solana / devnet transactions
  |
  |-- base2sol builds operations with bridge-sdk
  |
  |-- RPC providers submit and read chain state
```

The vendored SDK copy lives in `vendor/bridge-sdk`. The app wraps it with:

- wallet adapters in `src/client/wallets`;
- route and network helpers in `src/lib/bridge`;
- operation persistence in `src/client/useBridgeOperation.ts`;
- the bridge console UI in `src/components`.

## First-time Base token registration

When a Base ERC20 has not been bridged before, base2sol starts from Solana:

1. Phantom creates the Solana Token-2022 mint through the bridge program.
2. The bridge emits a Solana -> Base registration message.
3. The operation panel tracks that message.
4. If manual relay is selected, the user executes the message on Base with
   MetaMask.
5. Once the message is executed on Base, the Base bridge knows the Solana mint
   and decimal scalar.

The app then switches the user back to the existing-mint transfer flow.

## Base -> Solana transfers

For Base -> Solana, the source transaction happens on Base.

1. base2sol validates the source token, destination mint, amount, and recipient.
2. If needed, Phantom creates the recipient associated token account on Solana.
3. MetaMask signs the Base approval transaction when ERC20 allowance is missing.
4. MetaMask signs the Base bridge transaction.
5. The user waits for the Base checkpoint to appear in Solana bridge state.
6. Phantom proves the message on Solana.
7. Phantom executes the message on Solana.

The bridge state update is not continuous. A Base transaction can be confirmed
while Solana still indexes an older Base block. In that case, wait and click
`Prove` again later.

## Solana -> Base transfers

For Solana -> Base, the source transaction happens on Solana.

1. Phantom signs the lock or burn transaction on Solana.
2. If auto-relay is selected, the protocol relayer executes the Base message.
3. If manual relay is selected, MetaMask executes the message on Base.
4. base2sol polls until the operation is executed.

## Local operation recovery

base2sol stores the latest pending operation per environment in localStorage.
If the browser tab is closed, the app restores that operation when the user
returns to the same network.

This is a convenience feature, not a canonical history index. The current app
tracks one active operation per environment.
