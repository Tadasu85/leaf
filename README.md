# Leaf - A Framework for Text-Based Adventure Games on Hive

Leaf is a framework for building text-based adventure games on the Hive blockchain. It provides the infrastructure for creating interactive worlds where players can explore interconnected rooms, interact with the environment, and customize their characters.

## 🎮 Ego Death - The First Game Built on Leaf

Ego Death is the first game built using the Leaf framework. In this text-based adventure, players explore a mysterious world, interact with their environment, and customize their character's appearance and description.

### Key Features
- **Text-based adventure gameplay** with command-line interface
- **Hive blockchain integration** for persistent game state
- **Real-time player interactions** via WebSocket communication
- **Character customization** and room exploration
- **Builder system** for content creation
- **Queue management** for builder applications
- **Time-based events** using blockchain heartbeat
- **Mobile-responsive design** with PWA support

## 🚀 Quick Start

### Prerequisites
- [Hive Keychain](https://hive-keychain.com/) browser extension
- Node.js 24+ and npm
- A Hive account (create one at [Ecency](https://ecency.com/))

### Installation

#### 1. Clone and Setup Client
```bash
git clone https://gitlab.com/Tadasu85/leaf.git
cd leaf
npm install
npm start
```

#### 2. Clone and Setup Server (Optional - for development)
```bash
git clone https://gitlab.com/Tadasu85/leaf_server.git
cd leaf_server
npm install
npm start
```

#### 3. Open Your Browser
Navigate to `http://localhost:3000` and start playing!

## 🎯 Game Commands

### Basic Commands
- `login <username>` - Log in with your Hive username
- `look` - View current room description
- `look self` - View your character description
- `look <object>` - Look at a specific detail or player
- `north/south/east/west` - Move in the specified direction

### Character Customization
- `@describe <description>` - Set your character's description
- `@describeshort <short description>` - Set your character's short description

### Social Interaction
- `say <message>` - Send a message to all players in the room
- `emote <action>` - Perform an emote visible to all players

### Builder Commands (Builder Role Required)
- Use the "Build" button to access the builder interface
- Create and modify rooms, add details and exits

### Queue Management (Game Account Only)
- Use the "Queue" button to manage builder applications

## 🏗️ Technical Architecture

### Sources of Truth

#### 1. Hive Blockchain (Primary Source of Truth)
- **Game Map Data**: Stored in game account's `posting_json_metadata`
- **Room Content**: Each room is a Hive post with title, body, and metadata
- **Player Locations**: On-chain via blockchain transactions
- **Builder Permissions**: Managed through Hive community roles

#### 2. Signaling Server (Real-time State)
- **Player Presence**: Tracks who is currently in each room
- **Chat System**: Manages real-time messaging between players
- **Room Updates**: Broadcasts room state changes to all connected players

#### 3. Client-Side State Management
- **GameState Class**: Core game logic and state management
- **React Hooks Architecture**: Multiple specialized hooks for different concerns
- **Bulk Data Loading**: Loads all game data upfront for instant room transitions

### Performance Features
- **20-50x faster room transitions** with bulk loading
- **90% reduction in API calls** through upfront data loading
- **LRU caching** with automatic memory management
- **Instant room switching** (<10ms vs previous 200-500ms)

## 🔧 Development

### Running Tests
```bash
# All tests (125 tests, runs in under 4 seconds)
npm test

# Specific test file
npm test -- --testNamePattern="App Component"

# Watch mode
npm test -- --watch
```

### Building for Production
```bash
npm run build
```

### Development Tools
- **Memory Monitor**: Real-time cache and memory usage tracking
- **Debug Commands**: Cache statistics and management
- **Hot Reloading**: Automatic reload on code changes

## 📱 Mobile Support

Leaf has basic mobile support in progress:
- **Responsive Design**: Layout adapts for smaller screens
- **Mobile Keychain Integration**: Detects mobile platform and adapts login flow
- **Debug Panel**: On-device log viewer for mobile debugging

Full mobile optimisation (touch-friendly input, bottom nav, PWA, offline support) is planned. See [MOBILE_ROADMAP.md](MOBILE_ROADMAP.md) for details.

## ⏰ Time-Based Events

Leaf includes a blockchain-based time events system that uses the Hive blockchain as a heartbeat mechanism:
- **Ferry System**: Transportation between locations with 6 phases
- **Market Cycles**: Trading opportunities that appear and disappear
- **Weather Systems**: Dynamic environmental changes
- **Custom Events**: User-defined time-based events

See [TIME_EVENTS_README.md](TIME_EVENTS_README.md) for technical details.

## 🔒 Security Features

- **Input Validation**: Length limits, character validation, injection detection
- **Rate Limiting**: 100ms between commands to prevent spam
- **Permission-Based Access**: Builder roles and queue management
- **Hive Keychain Integration**: Secure blockchain operations

## 📚 Documentation

- **[DOCUMENTATION.md](DOCUMENTATION.md)** - Complete documentation index and overview
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines and contribution process
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and recent changes
- **[MOBILE_ROADMAP.md](MOBILE_ROADMAP.md)** - Mobile development plans and features
- **[TIME_EVENTS_README.md](TIME_EVENTS_README.md)** - Time-based events system documentation

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, development process, and how to contribute to the project.

## 📄 License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
