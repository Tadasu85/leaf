# Blockchain-Based Time Events System

This system uses the Hive blockchain as a heartbeat mechanism for time-based game events, eliminating the need for traditional server-side timers.

## Overview

Instead of using traditional heartbeat functions or server-side timers, this system leverages the Hive blockchain's natural flow of operations and blocks to trigger time-based events. Each block on the Hive blockchain represents approximately 3 seconds of real time, providing a reliable and decentralized timing mechanism.

## How It Works

1. **Blockchain Listening**: The system listens to new blocks on the Hive blockchain
2. **Time Event Registration**: Rooms can be registered for time-based events with specific intervals
3. **Phase Management**: Each time event has multiple phases that cycle based on the configured interval
4. **Dynamic Updates**: Room exits and descriptions change automatically based on the current phase

## Ferry Room Example

The ferry room demonstrates this system with 6 phases:

1. **Docked at Port A** - Players can exit north to Port A or board the ferry
2. **Departing Port A** - Ferry is leaving, only boarding available
3. **At Sea** - Ferry is sailing, only boarding available
4. **Arriving at Port B** - Ferry is approaching Port B, only boarding available
5. **Docked at Port B** - Players can exit south to Port B or board the ferry
6. **Departing Port B** - Ferry is returning to Port A, only boarding available

## Usage

### For Players

1. Navigate to a ferry room (e.g., `ferry-port-a`, `ferry-port-b`, `ferry-interior`)
2. The room's exits will change automatically based on the ferry's current phase
3. Wait for the ferry to dock at your desired port before attempting to exit

### For Builders

Time-event rooms are configured via the **Build** button in the sidebar (requires builder permissions). When creating a room, enable the "Time Event" option and fill in:
- **Interval Blocks**: How many blocks between phase changes (default: 100 blocks ≈ 5 minutes)
- **Phases**: Each phase has a name, description, and set of exits

The `startBlock` is set automatically at admin approval time — no manual configuration needed. Once approved, the room becomes live and all clients derive its current phase deterministically from the blockchain.

### For Developers

#### Creating Custom Time Events

Time-event rooms are fully data-driven — no code changes required. Add a `timeEvent` field to the room's entry in the game account's `posting_json_metadata`:

```json
{
  "my-room-permlink": {
    "author": "builder-username",
    "exits": {},
    "timeEvent": {
      "type": "ferry",
      "intervalBlocks": 100,
      "startBlock": 12345678,
      "phases": [
        {
          "phase": 0,
          "name": "Phase 1",
          "description": "Description for phase 1",
          "exits": { "north": "destination-permlink" }
        },
        {
          "phase": 1,
          "name": "Phase 2",
          "description": "Description for phase 2",
          "exits": {}
        }
      ]
    }
  }
}
```

`startBlock` is written automatically at admin approval time. The client computes the current phase as:

```
currentPhase = floor((currentBlock - startBlock) / intervalBlocks) % numPhases
```

Every client at the same block number arrives at the same phase — no server coordination needed.

#### Listening for Time Events

```typescript
// The system automatically emits 'timeEventDetected' events
hiveClient.on('timeEventDetected', (timeEvent: BlockchainTimeEvent) => {
  console.log('Time event detected:', timeEvent);
  // Handle the phase change
});
```

## Technical Details

### Block Timing

- **Hive Block Time**: ~3 seconds per block
- **Default Ferry Interval**: 100 blocks ≈ 5 minutes
- **Customizable**: Any interval can be set based on game needs

### Event Types

- **ferry**: Transportation between locations
- **market**: Trading and commerce events
- **weather**: Environmental changes
- **custom**: User-defined events

### Phase Structure

Each phase includes:
- **phase**: Numeric identifier
- **name**: Display name for the phase
- **description**: Description shown to players
- **exits**: Available exits during this phase
- **duration**: How long this phase lasts (in blocks)

## Benefits

1. **Decentralized**: No central server required for timing
2. **Reliable**: Uses blockchain's immutable time flow
3. **Scalable**: Can handle multiple time events simultaneously
4. **Transparent**: All timing is based on public blockchain data
5. **Consistent**: Same timing across all clients

## Future Enhancements

- **Weather Systems**: Dynamic weather changes affecting gameplay
- **Market Cycles**: Trading opportunities that appear and disappear
- **Seasonal Events**: Special events tied to blockchain time
- **Player Schedules**: NPCs and events that follow time-based patterns

## Testing

Run the test suite to verify the time event system:

```bash
npm test -- TimeEventSystem.test.tsx
```

The tests verify:
- Ferry room registration
- Phase change handling
- Dynamic exit application
- Phase cycling behavior 