# Hooks Overview

This directory contains React hooks for managing the game's state and functionality. We've consolidated several hooks to reduce complexity and improve maintainability.

## Current Hooks

### Core Game Management
- **`useGame`** - Consolidated hook for game state, room state, game data, and user profile management
  - Replaces: `useGameState`, `useRoomState`, `useGameData`, `useUserProfile`
  - Manages: Game state, player data, room data, game JSON, user permissions, builder status

### Communication & Networking
- **`useSocket`** - WebSocket connection and real-time communication management
- **`useClients`** - Hive client and keychain initialization

### Game Logic
- **`useCommandHandler`** - Command parsing and execution
- **`useLocation`** - Location tracking and room navigation
- **`useGameOutput`** - Message output management and display

### UI State
- **`useModalState`** - Modal visibility state management

## Hook Consolidation Benefits

### Before (Complex)
```typescript
// Multiple separate hooks
const { gameState, player, currentRoom, login } = useGameState(gameJSON);
const { roomData, setRoomData, setGameJSON } = useRoomState();
const { isLoadedGame, fetchGameData, checkIfUserIsBuilder } = useGameData(client);
const { isBuilder, isAdmin, updateUserProfile } = useUserProfile();
```

### After (Simplified)
```typescript
// Single consolidated hook
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

## Usage Guidelines

1. **Use `useGame` for all game-related state** - This is the primary hook for game functionality
2. **Keep specialized hooks separate** - `useSocket`, `useGameOutput`, etc. serve specific purposes
3. **Minimize hook dependencies** - Prefer the consolidated hook over multiple separate ones
4. **Follow the documentation** - Each hook has specific usage patterns and return values

## Migration Notes

The following hooks have been removed and their functionality consolidated into `useGame`:
- ❌ `useGameState` → ✅ `useGame`
- ❌ `useRoomState` → ✅ `useGame`  
- ❌ `useGameData` → ✅ `useGame`
- ❌ `useUserProfile` → ✅ `useGame`

See `useGame.md` for detailed migration instructions.

```typescript
# Game Output Management System

This document explains how to use the centralized game output management system.

## Overview

The `useGameOutput` hook provides a unified way to manage all game output messages, including system messages, room descriptions, player messages, errors, and more. It replaces the previous scattered output management with a centralized, type-safe approach.

## Basic Usage

```typescript
import { useGameOutput } from './hooks/useGameOutput';

function MyComponent() {
  const {
    messages,
    addSystemMessage,
    addErrorMessage,
    addSuccessMessage,
    addInfoMessage,
    addPlayerMessage,
    addRoomMessage
  } = useGameOutput(gameState);

  // Add different types of messages
  addSystemMessage('System message here');
  addErrorMessage('Something went wrong!');
  addSuccessMessage('Operation completed successfully!');
  addInfoMessage('Here is some information.');
  addPlayerMessage('Hello everyone!', 'playerName');
  addRoomMessage('You enter a dark room...', true); // bold text
}
```

## Message Types

### System Messages
- **Purpose**: General system information, commands, etc.
- **Method**: `addSystemMessage(content, options?)`
- **Style**: Default text color

### Room Messages
- **Purpose**: Room descriptions, exits, environment details
- **Method**: `addRoomMessage(content, options?)`
- **Style**: Blue color scheme

### Player Messages
- **Purpose**: Chat messages, emotes from players
- **Method**: `addPlayerMessage(content, source, options?)`
- **Style**: Green color scheme with source attribution

### Error Messages
- **Purpose**: Error notifications, failed operations
- **Method**: `addErrorMessage(content, options?)`
- **Style**: Red background with left border

### Success Messages
- **Purpose**: Successful operations, confirmations
- **Method**: `addSuccessMessage(content, options?)`
- **Style**: Green background with left border

### Info Messages
- **Purpose**: Informational messages, tips, help text
- **Method**: `addInfoMessage(content, options?)`
- **Style**: Blue background with left border

## Advanced Features

### Auto-clearing Messages
```typescript
// Message will automatically disappear after 5 seconds
addInfoMessage('Temporary notification', { clearAfter: 5000 });
```

### Message Management
```typescript
const {
  removeMessage,
  clearMessages,
  clearMessagesByType,
  getMessagesByType,
  getRecentMessages
} = useGameOutput(gameState);

// Remove a specific message
removeMessage(messageId);

// Clear all messages
clearMessages();

// Clear only error messages
clearMessagesByType('error');

// Get only player messages
const playerMessages = getMessagesByType('player');

// Get last 20 messages
const recentMessages = getRecentMessages(20);
```

### Display Options

The `GameOutputWindow` component supports various display options:

```typescript
<GameOutputWindow 
  output={messages}
  maxMessages={200}           // Limit displayed messages
  showTimestamps={true}       // Show message timestamps
  showMessageTypes={true}     // Show message type labels
  className="custom-class"    // Additional CSS classes
/>
```

## Migration from Old System

### Before (Old System)
```typescript
const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);

const outPut = useCallback((text: string, bold?: boolean) => {
  setGameOutputMessage(prev => [...prev, { output: text, bold }]);
}, []);

// Usage
outPut('Hello world', true);
```

### After (New System)
```typescript
const { addSystemMessage, addErrorMessage } = useGameOutput(gameState);

// Usage
addSystemMessage('Hello world', { bold: true });
addErrorMessage('Something went wrong');
```

## Benefits

1. **Type Safety**: Each message type has its own method with proper TypeScript support
2. **Visual Distinction**: Different message types have distinct styling
3. **Centralized Management**: All output goes through one system
4. **Auto-cleanup**: Messages can automatically clear themselves
5. **Performance**: Built-in message limiting prevents memory issues
6. **Extensibility**: Easy to add new message types or features
7. **Consistency**: All components use the same output interface

## Integration with GameState

The hook automatically listens to GameState output events and converts them to the new format. This ensures backward compatibility while providing the new features.

```typescript
// GameState automatically emits output events
gameState.addOutputMessage('Room loaded successfully');

// useGameOutput hook automatically receives and processes these events
// No additional setup required
``` 