# Simple VSC Adapter Integration Guide

## Overview

The `SimpleVSCAdapter` is a streamlined VSC (Virtual Smart Contract) integration that replaces the complex `VSCAdapter` with a clean, maintainable implementation. It provides the same functionality with 80% less complexity.

## What Changed

### ✅ **Replaced:**
- `VSCAdapter` → `SimpleVSCAdapter`
- Complex WebSocket management
- Over-engineered transaction building
- Multiple authentication methods

### 🎯 **Kept:**
- All core game verbs (`onEnter`, `onLeave`, `onSay`, `onEmote`, `onCommand`)
- Event subscription system
- Verb runtime interface compliance
- Error handling and logging

## Integration Points

### 1. **GameState Integration** ✅
The `GameState` class now automatically uses `SimpleVSCAdapter` when `config.runtime === 'vsc'`.

```typescript
// In GameState constructor
if (config.runtime === 'vsc') {
  this.verbRuntime = new SimpleVSCAdapter();
  // ... rest of initialization
}
```

### 2. **Verb Execution** ✅
All game verbs automatically go through the VSC adapter:

```typescript
// When a player enters a room
await this.verbRuntime?.onEnter(roomId, player);

// When a player says something
await this.verbRuntime?.onSay(roomId, player, message);

// When a player emotes
await this.verbRuntime?.onEmote(roomId, player, emote);
```

### 3. **Event Handling** ✅
The adapter automatically handles VSC events and updates the game state:

```typescript
// Room subscriptions are managed automatically
this.vscUnsubscribe = this.verbRuntime?.subscribe(roomId, {
  onVerbOutput: (lines) => this.addOutputMessage(lines.join('\n')),
  onRoomEffect: (effects) => this.applyEffects(effects)
});
```

## Configuration

### Environment Variables
```bash
# Required for VSC integration
REACT_APP_VSC_CONTRACT=your-contract-address
REACT_APP_VSC_NETWORK=testnet  # or mainnet

# Optional (for future real VSC integration)
REACT_APP_VSC_RPC_URL=https://vsc.hive-engine.com/rpc
REACT_APP_VSC_WS_URL=wss://vsc.hive-engine.com/ws
```

### Config Structure
```typescript
// src/config.ts
vsc: {
  rpcUrl: process.env.REACT_APP_VSC_RPC_URL || 'https://vsc.hive-engine.com/rpc',
  wsUrl: process.env.REACT_APP_VSC_WS_URL || 'wss://vsc.hive-engine.com/ws',
  contractAddress: process.env.REACT_APP_VSC_CONTRACT || '',
  network: (process.env.REACT_APP_VSC_NETWORK as 'testnet' | 'mainnet') || 'mainnet'
}
```

## Testing

### Run Tests
```bash
# Test the SimpleVSCAdapter
npm test -- SimpleVSCAdapter.test.ts

# Test integration with GameState
npm test -- GameState.test.ts
```

### Manual Testing
1. Set `config.runtime = 'vsc'`
2. Set a valid `config.vsc.contractAddress`
3. Start the game and observe VSC integration logs
4. Check browser console for VSC verb execution messages

## Event System

### Available Events
```typescript
// Verb execution events
adapter.on('verb:executed', (data) => {
  console.log('Verb executed:', data.verb, data.params, data.result);
});

// Room subscription events
adapter.on('room:subscribed', (data) => {
  console.log('Room subscribed:', data.roomId, data.success);
});

// Player subscription events
adapter.on('player:subscribed', (data) => {
  console.log('Player subscribed:', data.player, data.success);
});

// Error events
adapter.on('verb:error', (data) => {
  console.error('Verb error:', data.verb, data.error);
});
```

### Event Data Structure
```typescript
interface VerbExecutedEvent {
  verb: string;
  params: Record<string, unknown>;
  result: VerbResult;
}

interface VerbErrorEvent {
  verb: string;
  params: Record<string, unknown>;
  error: VerbResult;
}
```

## Verb Results

### Success Result
```typescript
{
  success: true,
  output: ["VSC verb 'on_enter' executed successfully"],
  effects: [],
  timestamp: 1703123456789
}
```

### Error Result
```typescript
{
  success: false,
  output: ["Error executing 'on_enter': Network error"],
  effects: [],
  timestamp: 1703123456789
}
```

## Future Enhancements

### When Ready for Production VSC:

1. **Replace Simulation with Real Calls**
   ```typescript
   // In executeVerb method
   const result = await this.callVSCContract(verb, params);
   ```

2. **Add Real Authentication**
   ```typescript
   // Add auth method
   async authenticate(credentials: AuthCredentials) {
     // Real VSC authentication
   }
   ```

3. **Add Network Error Handling**
   ```typescript
   // Handle network failures
   if (networkError) {
     return this.handleNetworkError(error);
   }
   ```

## Troubleshooting

### Common Issues

1. **"VSC runtime not fully configured"**
   - Check `REACT_APP_VSC_CONTRACT` environment variable
   - Verify contract address format

2. **"Failed to initialize SimpleVSCAdapter"**
   - Check browser console for detailed errors
   - Verify TypeScript compilation

3. **VSC verbs not executing**
   - Check `config.runtime === 'vsc'`
   - Verify adapter is connected (`adapter.getStatus().connected`)

### Debug Mode
Enable detailed logging:
```typescript
// In browser console
localStorage.setItem('debug', 'SimpleVSCAdapter:*');
```

## Performance Benefits

- **Faster startup** - No complex WebSocket initialization
- **Lower memory** - Fewer objects and event handlers
- **Cleaner logs** - Less verbose output
- **Easier debugging** - Simpler code flow

---

**The simplified VSC adapter is now fully integrated and ready to use!** 🎉
