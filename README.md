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
- P2P Communication
  - Real-time peer-to-peer connections between players
  - Automatic connection management
  - Reliable message delivery
  - Connection state synchronization

- Room System
  - Dynamic room state updates
  - Player presence tracking
  - Automatic room joining/leaving
  - Room detail management
  - Exit system for navigation

- Blockchain Integration
  - Hive blockchain operations for game state
  - Custom JSON operations for game actions
  - Account metadata management
  - Real-time blockchain stream processing

- Security
  - Hive Keychain integration for secure operations
  - Permission-based access control
  - Builder role management
  - Queue system for content creation

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

## Contributing

We welcome contributions to both the Leaf framework and Ego Death game! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, development process, and how to contribute to the project.

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
