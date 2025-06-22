# Sources of Truth - Leaf Game Architecture

## Overview

The Leaf Game is a multiplayer text-based game built on the Hive blockchain with real-time communication via WebSockets. This document outlines the various sources of truth that maintain the game's state and data integrity.

## 1. Hive Blockchain (Primary Source of Truth)

The **Hive blockchain** serves as the primary source of truth for all persistent game data.

### Game Map Data
- **Location**: Stored in the game account's (`hive-109456`) `posting_json_metadata` field
- **Structure**: `egodeathgamedata.rooms_authors_exits`
- **Access**: Fetched via `useGameData.ts` hook using `client.database.call('get_accounts')`
- **Purpose**: Contains room definitions, exits, and overall game structure

### Room Content
Each room is a Hive post with the following structure:
- **`title`**: Room name
- **`body`**: Room description
- **`json_metadata`**: Room-specific metadata (exits, items, etc.)
- **Access**: Fetched via `client.database.call('get_content', [author, permlink])`

### Player Locations
- **Storage**: On-chain via blockchain transactions
- **Nature**: Immutable and verifiable
- **Updates**: Player movement writes to blockchain

### Builder Permissions
- **Management**: Through Hive community roles
- **Access**: Fetched via `client.hivemind.getCommunity()` call
- **Structure**: Defined in community's team structure

## 2. Signaling Server (Real-time State)

The **Node.js/Express server** (`server.js`) manages ephemeral real-time state.

### In-Memory Data Structures

```javascript
// Room state management
const rooms = new Map(); // Room ID -> Room Data

// Player presence tracking
const connectedUsers = new Map(); // Username -> Socket ID
const socketToUser = new Map(); // Socket ID -> Username

// Room building queue
const roomBuildQueue = new Map(); // Queue ID -> Build Request
```

### Real-time Features
- **Player Presence**: Tracks who is currently in each room
- **Chat System**: Manages real-time messaging between players
- **Room Updates**: Broadcasts room state changes to all connected players
- **Queue Management**: Handles room building requests

## 3. Client-Side State Management

The React application uses a sophisticated state management system with multiple layers.

### GameState Class (`GameState.ts`)
Core game logic and state management:
- **Player State**: Current player information, location, permissions
- **Current Room**: Active room data and exits
- **Game Map**: Local cache of the blockchain game map
- **Output Messages**: Game text output history

### React Hooks Architecture

#### `useGameState`
- Manages the core `GameState` instance
- Handles player login/logout
- Coordinates game actions

#### `useRoomState`
- Manages room-specific data using React reducer
- Handles room data updates and synchronization
- Maintains room state consistency

#### `useGameData`
- Fetches and caches blockchain game data
- Manages game map loading
- Handles builder permission checks

#### `useSocket`
- Manages WebSocket connections
- Handles real-time updates from signaling server
- Coordinates room joining/leaving

#### `useUserProfile`
- Manages user profile and permissions
- Handles user-specific settings
- Coordinates with blockchain for user data

## 4. Configuration and Constants

**`config.ts`** serves as the centralized configuration source of truth:

### Hive Configuration
```typescript
hive: {
  nodes: string[];
  chainId: string;
  accountPrefix: string;
  key: string;
}
```

### Game Configuration
```typescript
game: {
  name: string;
  account: string;
  startRoom: { author: string; permlink: string };
  defaultCharacterDescription: string;
}
```

### Server Configuration
```typescript
signalingServer: string;
admins: string[];
builders: string[];
```

## 5. Data Flow Architecture

```
Hive Blockchain (Primary Truth)
    ↓ (Read operations)
Client GameState
    ↓ (Real-time sync)
Signaling Server
    ↓ (WebSocket events)
Client UI Components
```

### Data Flow Description
1. **Blockchain First**: All persistent data originates from Hive
2. **Real-time Overlay**: Server provides current player presence and chat
3. **Client Caching**: Game map and room data cached locally for performance
4. **Event-Driven Updates**: WebSocket events trigger UI updates when state changes

## 6. State Synchronization Strategy

### Principles
- **Single Source of Truth**: Blockchain for persistent data
- **Derived State**: Client-side state derived from blockchain data
- **Ephemeral State**: Real-time presence managed by signaling server
- **Optimistic Updates**: UI updates immediately, blockchain confirms later

### Synchronization Patterns
1. **Initial Load**: Fetch game map and room data from blockchain
2. **Real-time Updates**: WebSocket events for player presence and chat
3. **State Reconciliation**: Merge blockchain data with real-time updates
4. **Conflict Resolution**: Blockchain data takes precedence over local state

## 7. Key State Management Patterns

### Immutable Data Sources
- **Blockchain Data**: Never modified locally, only read
- **Configuration**: Static configuration loaded at startup
- **Type Definitions**: TypeScript interfaces define data contracts

### Mutable State
- **Player Presence**: Managed by signaling server
- **UI State**: React component state and hooks
- **Cache**: Local game map and room data cache

### State Derivation
- **Room State**: Derived from blockchain data + real-time presence
- **Player Permissions**: Derived from community roles + local cache
- **Game Output**: Derived from game actions + real-time events

## 8. Error Handling and Recovery

### Blockchain Failures
- **Fallback**: Use cached game map data
- **Retry Logic**: Exponential backoff for failed requests
- **User Feedback**: Clear error messages for blockchain issues

### Network Failures
- **Reconnection**: Automatic WebSocket reconnection
- **State Recovery**: Re-sync with server on reconnection
- **Graceful Degradation**: Continue with cached data when offline

### Data Consistency
- **Validation**: TypeScript types ensure data structure consistency
- **Sanitization**: Input validation for user commands
- **Conflict Resolution**: Blockchain data overrides local state

## 9. Performance Considerations

### Caching Strategy
- **Game Map**: Cached locally after initial load
- **Room Data**: Cached per room to reduce blockchain calls
- **User Profiles**: Cached with periodic refresh

### Real-time Optimization
- **Event Filtering**: Only process relevant WebSocket events
- **Debouncing**: Prevent excessive UI updates
- **Connection Pooling**: Efficient WebSocket connection management

### Blockchain Optimization
- **Batch Requests**: Group multiple blockchain calls when possible
- **Selective Loading**: Only load necessary room data
- **Lazy Loading**: Load room data on demand

## 10. Security Considerations

### Data Integrity
- **Blockchain Verification**: All persistent data verified on-chain
- **Permission Checks**: Builder/admin permissions verified via blockchain
- **Input Validation**: All user inputs validated and sanitized

### Network Security
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **WebSocket Security**: Secure WebSocket connections with authentication
- **Rate Limiting**: Prevent abuse of server resources

### User Privacy
- **Minimal Data**: Only necessary data stored on server
- **Ephemeral Storage**: Real-time data not persisted unnecessarily
- **Blockchain Privacy**: Leverage blockchain's public nature for transparency

---

*This document provides a comprehensive overview of the Leaf Game's architecture and sources of truth. For implementation details, refer to the individual source files mentioned throughout this document. It is also subject to change without notice.* 