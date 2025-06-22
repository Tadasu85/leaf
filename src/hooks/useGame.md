# useGame Hook - Consolidated Game State Management

The `useGame` hook is a consolidated hook that combines the functionality of multiple previous hooks into a single, comprehensive game state management system.

## What it Replaces

This hook consolidates the following previous hooks:
- `useGameState` - Game state, player, current room management
- `useRoomState` - Room data and game JSON management  
- `useGameData` - Game data fetching and builder status
- `useUserProfile` - User profile and permissions management

## Usage

```typescript
import { useGame } from './hooks/useGame';

function MyComponent() {
  const { client } = useClients();
  
  const {
    // Game State
    gameState,
    isLoading,
    error,
    player,
    currentRoom,
    login,
    
    // Room State
    roomData,
    gameJSON,
    isLoadedGame,
    updateRoomData,
    updateGameJSON,
    hasRoomDataChanged,
    
    // Game Data
    fetchGameData,
    checkIfUserIsBuilder,
    
    // User State
    userProfileJSON,
    setUserProfileJSON,
    isBuilder,
    isAdmin,
    updateUserProfile
  } = useGame(client);
}
```

## Benefits

1. **Reduced Complexity**: One hook instead of four separate hooks
2. **Better State Coordination**: All related state is managed together
3. **Cleaner Component Code**: Fewer hook calls in components
4. **Easier Testing**: Single hook to test instead of multiple
5. **Better Performance**: Reduced re-renders and state synchronization issues

## Migration Guide

### Before (Multiple Hooks)
```typescript
const { gameState, player, currentRoom, login } = useGameState(gameJSON);
const { roomData, setRoomData, setGameJSON } = useRoomState();
const { isLoadedGame, fetchGameData, checkIfUserIsBuilder } = useGameData(client);
const { isBuilder, isAdmin, updateUserProfile } = useUserProfile();
```

### After (Single Hook)
```typescript
const {
  gameState,
  player,
  currentRoom,
  login,
  roomData,
  updateRoomData,
  updateGameJSON,
  isLoadedGame,
  fetchGameData,
  checkIfUserIsBuilder,
  isBuilder,
  isAdmin,
  updateUserProfile
} = useGame(client);
```

## State Management

The hook manages three main areas of state:

### Game State
- `gameState`: The main GameState instance
- `isLoading`: Loading state for game initialization
- `error`: Error state for game operations
- `player`: Current player data
- `currentRoom`: Current room data
- `login`: Login function

### Room State
- `roomData`: Current room information
- `gameJSON`: Game map data
- `isLoadedGame`: Whether game data is loaded
- `updateRoomData`: Function to update room data
- `updateGameJSON`: Function to update game JSON
- `hasRoomDataChanged`: Function to check if room data changed

### User State
- `userProfileJSON`: User profile data
- `isBuilder`: Whether user is a builder
- `isAdmin`: Whether user is an admin
- `updateUserProfile`: Function to update user profile

### Game Data
- `fetchGameData`: Function to fetch game data from blockchain
- `checkIfUserIsBuilder`: Function to check builder status 