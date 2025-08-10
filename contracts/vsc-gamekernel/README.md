# VSC GameKernel Contract

This directory contains the VSC (Virtual Smart Chain) smart contract for Leaf's verb runtime.

## VSC Toolchain

We're using the official VSC client library `@vsc.eco/client` which provides:

- **vClient**: Main client for interacting with VSC network
- **vTransaction**: Transaction builder for contract calls
- **Multiple authentication methods**: Hive Keychain, direct keys, ETH wallets, DIDs

## Setup

1. **Install dependencies**:
   ```bash
   npm install @vsc.eco/client @hiveio/dhive keychain-sdk dids key-did-provider-ed25519 key-did-resolver dag-jose-utils
   ```

2. **Environment variables** (create `.env` file):
   ```bash
   VSC_API_URL=https://vsc.hive-engine.com/api/v1/graphql
   VSC_NETWORK_ID=mainnet
   ```

## Contract Development

VSC contracts are written in a custom format that gets deployed to the VSC network. The contract structure follows:

```typescript
interface ContractCall {
  op: 'call_contract'
  action: string        // Function name to call
  contract_id: string   // Contract address on VSC
  payload: any          // Function parameters
}
```

## Testing

Use the VSC client to test contract interactions:

```typescript
import { vClient, vTransaction } from '@vsc.eco/client'

const client = new vClient({
  api: 'https://vsc.hive-engine.com/api/v1/graphql',
  loginType: 'offchain'
})

// Login with DID or Hive Keychain
await client.login(did)

const tx = new vTransaction()
tx.setTx({
  op: 'call_contract',
  action: 'onEnter',
  contract_id: 'your-contract-id',
  payload: { roomId: 'room1', player: 'player1' }
})

await tx.broadcast(client)
```

## Deployment

Contracts are deployed through the VSC network using the VSC client. The deployment process involves:

1. Creating the contract bytecode/definition
2. Submitting a deployment transaction
3. Getting the contract ID for future calls

## Integration with Leaf

The `VSCAdapter` in Leaf's codebase uses this client to:
- Call contract functions (onEnter, onLeave, onSay, etc.)
- Subscribe to contract events
- Handle real-time game logic through VSC smart contracts

This enables Leaf to remove dependency on `leaf_server` by moving game logic to decentralized smart contracts.
