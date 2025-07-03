# Leaf - A Framework for Text-Based Adventure Games on Hive

Leaf is a framework for building text-based adventure games on the Hive blockchain. It provides the infrastructure for creating interactive worlds where players can explore interconnected rooms, interact with the environment, and customize their characters.

## Components

### Leaf Server
The Leaf Server component provides real-time communication and state management for the game. It handles:
- WebSocket connections for real-time updates
- Room state synchronization
- Player presence tracking
- Chat and emote broadcasting
- Builder queue management
- P2P signaling for direct player connections

### Leaf Client
The client-side application that players interact with, featuring:
- Text-based adventure gameplay
- Hive blockchain integration
- Real-time player interactions
- Character customization
- Room exploration and movement
- Real-time updates via blockchain operations
- P2P communication between players

## Ego Death - The First Game Built on Leaf

Ego Death is the first game built using the Leaf framework. In this text-based adventure, players explore a mysterious world, interact with their environment, and customize their character's appearance and description.

### Features

- Text-based adventure gameplay
- Hive blockchain integration
- Real-time player interactions
- Character customization
- Room exploration and movement
- Real-time updates via blockchain operations
- P2P communication between players
- Builder system for content creation
- Queue management system
- Real-time chat and emotes
- Room state synchronization
- Automatic player tracking

## Prerequisites

- [Hive Keychain](https://hive-keychain.com/) browser extension
- Node.js and npm
- Git
- A Hive account (create one at [Ecency](https://ecency.com/))

## Installation

### Server Setup
1. Install Node.js and npm (recommended: use NVM)
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22
   nvm use 22
   ```

2. Clone the repository
   ```bash
   git clone https://gitlab.com/Tadasu85/leaf_server.git
   cd leaf_server
   ```

3. Install dependencies
   ```bash
   npm install
   ```

4. Configure environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. Start the server
   ```bash
   npm start
   ```

### Client Setup
1. Clone the client repository
   ```bash
   git clone https://gitlab.com/Tadasu85/leaf.git
   cd leaf
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Start the development server
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Environment Configuration

The application uses environment variables to configure the WebSocket signaling server connection:

### `REACT_APP_SIGNALING_SERVER`
- **Description**: Primary signaling server URL
- **Default**: None (falls back to environment-specific defaults)
- **Example**: `https://your-signaling-server.com`

### `REACT_APP_PRODUCTION_SIGNALING_SERVER`
- **Description**: Production-specific signaling server URL (used when `NODE_ENV=production`)
- **Default**: `https://leaf-server-5lrq.onrender.com`
- **Example**: `https://your-production-server.com`

### Configuration Logic

The signaling server URL is determined in this order:

1. `REACT_APP_SIGNALING_SERVER` (if set, used for all environments)
2. If in production (`NODE_ENV=production`):
   - `REACT_APP_PRODUCTION_SIGNALING_SERVER` (if set)
   - Fallback to `https://leaf-server-5lrq.onrender.com`
3. If in development:
   - Fallback to `http://localhost:4001`

### Setting Environment Variables

#### For Development
Create a `.env` file in the `leaf` directory:
```
REACT_APP_SIGNALING_SERVER=http://localhost:4001
```

#### For Production
Set the environment variable in your deployment platform:
```bash
REACT_APP_PRODUCTION_SIGNALING_SERVER=https://your-actual-production-server.com
```

## Game Commands

### Basic Commands
- `login <username>` - Log in with your Hive username
- `look` - View current room description
- `look self` - View your character description
- `look <object>` - Look at a specific detail or player in the room
- `north/south/east/west` - Move in the specified direction

### Character Customization
- `@describe <description>` - Set your character's description
- `@describeshort <short description>` - Set your character's short description

### Social Interaction
- `say <message>` - Send a message to all players in the room
- `emote <action>` - Perform an emote visible to all players in the room

### Builder Commands (Builder Role Required)
- Use the "Build" button in the top-right corner to access the builder interface
- Create and modify rooms
- Add room details and exits
- Manage room content

### Queue Management (Game Account Only)
- Use the "Queue" button in the top-right corner to access the queue management interface
- View and manage the builder queue
- Approve or reject builder applications

## Technical Architecture

### Sources of Truth

The Leaf Game uses a sophisticated multi-layered architecture with clear sources of truth:

#### 1. Hive Blockchain (Primary Source of Truth)
- **Game Map Data**: Stored in the game account's `posting_json_metadata` field
- **Room Content**: Each room is a Hive post with title, body, and metadata
- **Player Locations**: On-chain via blockchain transactions
- **Builder Permissions**: Managed through Hive community roles
- **Build Queue**: App-managed through builder posts with specific metadata

#### 2. Signaling Server (Real-time State)
- **Player Presence**: Tracks who is currently in each room
- **Chat System**: Manages real-time messaging between players
- **Room Updates**: Broadcasts room state changes to all connected players
- **User Sessions**: Tracks user connections and session data

#### 3. Client-Side State Management
- **GameState Class**: Core game logic and state management
- **React Hooks Architecture**: Multiple specialized hooks for different concerns
- **Configuration**: Centralized configuration via `config.ts`

### Data Flow Architecture

```
Hive Blockchain (Primary Truth)
    ↓ (Read operations)
Client GameState
    ↓ (Real-time sync)
Signaling Server
    ↓ (WebSocket events)
Client UI Components
```

### State Synchronization Strategy

- **Single Source of Truth**: Blockchain for persistent data
- **Derived State**: Client-side state derived from blockchain data
- **Ephemeral State**: Real-time presence managed by signaling server
- **Optimistic Updates**: UI updates immediately, blockchain confirms later

## Bulk Loading Architecture

The Leaf game uses a **bulk data loading** approach that loads all game data upfront from the blockchain instead of incrementally loading rooms as players move. This provides significant performance improvements while maintaining memory efficiency.

### Key Benefits

- **Instant room transitions**: No more loading delays when moving between rooms
- **Reduced API calls**: All room data is loaded once at startup
- **Better user experience**: Smooth, responsive gameplay
- **Memory efficiency**: LRU caching and data compression prevent memory bloat

### Performance Characteristics

- **Startup Time**: ~2-5 seconds (one-time cost for persistent performance gains)
- **Room Transitions**: <10ms (20-50x faster than incremental loading)
- **Memory Usage**: Configurable limits with automatic cache management
- **Cache Efficiency**: 80-95% hit rate typical

### Memory Management

- **LRU Cache**: Least Recently Used cache eviction prevents memory bloat
- **Data Compression**: Whitespace removal and optimization reduce memory footprint
- **Configurable Limits**: Memory usage can be capped and monitored
- **Batch Processing**: Rooms are loaded in batches to avoid overwhelming the API

## Technical Features

### Server Features
- WebSocket-based real-time communication
- Room state management and synchronization
- Player presence tracking
- Chat and emote broadcasting
- Builder queue management
- P2P signaling for direct player connections
- Automatic room cleanup
- Connection state management

### Client Features
- **P2P Communication**
  - Real-time peer-to-peer connections between players
  - Automatic connection management
  - Reliable message delivery
  - Connection state synchronization

- **Room System**
  - Dynamic room state updates
  - Player presence tracking
  - Automatic room joining/leaving
  - Room detail management
  - Exit system for navigation

- **Blockchain Integration**
  - Hive blockchain operations for game state
  - Custom JSON operations for game actions
  - Account metadata management
  - Real-time blockchain stream processing

- **Security**
  - Hive Keychain integration for secure operations
  - Permission-based access control
  - Builder role management
  - Queue system for content creation

### Security & Performance Improvements

#### Input Validation & Security
- **CommandParser Security**:
  - Length limits (500 chars total, 100 for commands, 400 for args)
  - Character validation (alphanumeric, spaces, basic punctuation)
  - Injection pattern detection (blocks script tags, javascript: URLs, etc.)
  - Rate limiting (100ms between commands)
  - Input sanitization and validation

#### Optimistic Movement System
- **Instant Response**: No waiting for blockchain confirmation
- **No Double Movement**: Prevents the duplicate movement bug
- **Better UX**: Smooth, responsive movement experience
- **Error Handling**: Graceful fallback if blockchain fails

#### Real-time Communication
- **Chat Functionality**: Players can communicate in the same room
- **Real-time Updates**: Player join/leave notifications work properly
- **Proper Cleanup**: Socket connections are properly managed during login/logout
- **Room-based Chat**: Chat channels are properly joined when entering rooms

## Development

### Running Tests
```bash
# Server tests
cd leaf_server
npm test

# Client tests
cd leaf
npm test
```

### Building for Production
```bash
# Server build
cd leaf_server
npm run build

# Client build
cd leaf
npm run build
```

### Development Tools

#### Memory Monitor
Development tool for monitoring:
- **Cache statistics**: Size, hit rate, memory usage
- **Browser memory**: Real-time memory usage tracking
- **Cache management**: Manual cache clearing
- **Visual indicators**: Color-coded warnings for high memory usage

#### Debug Commands
```javascript
// Get cache statistics
const stats = gameState.getHiveClient().getCacheStats();
console.log(stats);

// Clear cache
gameState.getHiveClient().clearCache();

// Check if bulk data is loaded
const isLoaded = gameState.getHiveClient().isBulkDataLoaded();
```

## Contributing

We welcome contributions to both the Leaf framework and Ego Death game! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, development process, and how to contribute to the project.

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
