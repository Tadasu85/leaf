# Leaf - A Framework for Text-Based Adventure Games on Hive

Leaf is a framework for building text-based adventure games on the Hive blockchain. It provides the infrastructure for creating interactive worlds where players can explore interconnected rooms, interact with the environment, and customize their characters.

## Ego Death - The First Game Built on Leaf

Ego Death is the first game built using the Leaf framework. In this text-based adventure, players explore a mysterious world, interact with their environment, and customize their character's appearance and description.

### Features

- Text-based adventure gameplay
- Hive blockchain integration
- Character customization
- Room exploration and movement
- Real-time updates via blockchain operations

## Prerequisites

- [Hive Keychain](https://hive-keychain.com/) browser extension
- Node.js and npm
- Git

## Installation

### Ubuntu
1. Install Node.js and npm (recommended: use NVM)
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22
   nvm use 22
   ```

2. Clone the repository
   ```bash
   git clone https://github.com/yourusername/leaf.git
   cd leaf
   ```

3. Install dependencies
   ```bash
   npm install
   ```

4. Start the development server
   ```bash
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

### Windows
1. Install required software:
   - [Git](https://git-scm.com/download/win)
   - [NVM for Windows](https://github.com/coreybutler/nvm-windows/releases)

2. Open PowerShell as Administrator and run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
   ```

3. Install and use Node.js:
   ```powershell
   nvm install 22
   nvm use 22
   ```

4. Clone the repository and install dependencies:
   ```powershell
   git clone https://github.com/yourusername/leaf.git
   cd leaf
   npm install
   ```

5. Start the development server:
   ```powershell
   npm start
   ```

6. Open your browser and navigate to `http://localhost:3000`

## Ego Death Game Commands

- `login <username>` - Log in with your Hive username
- `look` - View current room description
- `look self` - View your character description
- `north/south/east/west` - Move in the specified direction
- `@describe <description>` - Set your character's description
- `@describeshort <short description>` - Set your character's short description

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

## Contributing

We welcome contributions to both the Leaf framework and Ego Death game! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, development process, and how to contribute to the project.

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
