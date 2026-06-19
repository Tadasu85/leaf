# Hooks Overview

This directory contains React hooks for managing the game's state and functionality.

## Current Hooks

### Core Game Management
- **`useGame`** - Consolidated hook for game state, room state, game data, and user profile management
  - Manages: game state, player data, room data, game JSON, user permissions, builder status, command handling

### Communication & Networking
- **`useSocket`** - WebSocket connection and real-time communication management
- **`useClients`** - Hive client and keychain initialisation

### Game Output
- **`useGameOutput`** - Typed message output management (system/room/player/error/success/info)

### UI State
- **`useModalState`** - Modal visibility state management
- **`useBuildApprovalQueue`** - Fetch pending room approvals for admin queue

## Hook Consolidation

The following hooks were consolidated into `useGame` and have been removed:

| Removed | Replaced by |
|---------|------------|
| `useGameState` | `useGame` |
| `useRoomState` | `useGame` |
| `useGameData` | `useGame` |
| `useUserProfile` | `useGame` |

## Usage

In components, access game state via `useGameContext()` (which wraps `useGame` internally):

```typescript
import { useGameContext } from '../contexts/GameContext';

function MyComponent() {
  const {
    gameState,
    player,
    currentRoom,
    login,
    isLoginComplete,
    isBuilder,
    isAdmin,
    handleCommand,
  } = useGameContext();
}
```

For direct hook usage outside of the context:

```typescript
import { useGame } from './useGame';

const { gameState, player, currentRoom, login } = useGame(client, keychain);
```

See `useGame.md` for the full API reference.
