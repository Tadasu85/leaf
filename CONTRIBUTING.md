# Contributing to Leaf

First off, thank you for considering contributing to Leaf! It's people like you that make Leaf such a great tool.

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Environment](#development-environment)
4. [Making Changes](#making-changes)
5. [Submitting Changes](#submitting-changes)
6. [Coding Standards](#coding-standards)
7. [Testing](#testing)
8. [Project Structure](#project-structure)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- Hive Keychain browser extension
- Git
- Node Version Manager (NVM)
  - Ubuntu: NVM version 0.39.0+
  - Windows: NVM version 1.2.1+
- Node.js 24.0+ (via NVM)
- NPM 10.5.1+

### Initial Setup

1. Fork the repository on GitLab
2. Clone your fork locally:
   ```bash
   git clone git@gitlab.com:YOUR_USERNAME/leaf.git
   cd leaf
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm start
   ```
5. Visit `http://localhost:3000` in your browser

## Development Environment

### Ubuntu Setup
- Install NVM version 0.39.0 or later
- Install Node.js 24.0 using NVM
- Install NPM 10.5.1 or later
- Install Hive Keychain browser extension
- Ensure you have your Hive keys installed in Keychain (minimum Active key required)

### Windows Setup
1. Install required software:
   - Sublime Text
   - Git
   - NVM for Windows
2. Open PowerShell as administrator and run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
   ```
3. Install Node.js via NVM:
   ```bash
   nvm install 24
   nvm use 24
   ```
4. Install Hive Keychain browser extension
5. Configure Hive keys in Keychain

## Making Changes

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Write or update tests as needed
4. Run the test suite:
   ```bash
   npm test
   ```
5. Ensure your code follows our style guidelines

## Submitting Changes

1. Push your changes to your fork
2. Submit a merge request to the main repository
3. Include a clear description of your changes
4. Reference any related issues

### Commit Message Guidelines

Follow the conventional commits format:
- feat: new feature
- fix: bug fix
- docs: documentation changes
- style: formatting, missing semicolons, etc.
- refactor: code restructuring
- test: adding tests
- chore: maintenance

## Coding Standards

### TypeScript
- Use TypeScript for all new code
- Include type definitions
- Follow ESLint configuration

### React
- Use functional components
- Implement proper error boundaries
- Follow React hooks best practices

### CSS
- Follow stylelint configuration
- Use BEM naming convention
- Maintain responsive design principles

## Testing

- Write tests for all new features
- Maintain existing tests (125 tests currently passing)
- Run tests before submitting changes:
  ```bash
  # All tests (runs in under 4 seconds)
  npm test
  
  # Specific test file
  npm test -- --testNamePattern="Component Name"
  
  # Watch mode for development
  npm test -- --watch
  ```

### Test Guidelines
- **Test Coverage**: Aim for comprehensive coverage of new features
- **Performance**: Tests should run quickly (avoid infinite loops or memory leaks)
- **Mocking**: Use simplified mocks to avoid complex dependencies
- **Isolation**: Each test should be independent and not affect others

## Project Structure

```
leaf/
├── src/
│   ├── components/      # React UI components
│   ├── hooks/           # Custom React hooks (useGame, useSocket, etc.)
│   ├── game/            # Core game logic
│   │   ├── state/       # GameState class
│   │   ├── blockchain/  # HiveClient, BulkDataLoader
│   │   ├── commands/    # CommandParser
│   │   ├── network/     # SocketManager
│   │   └── types/       # TypeScript interfaces
│   ├── contexts/        # React context providers
│   ├── utils/           # Logger, helpers
│   ├── App.tsx          # Root component
│   └── index.tsx        # Entry point
├── public/              # Static files
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

### Key Technologies
- React 19
- TypeScript 6
- @hiveio/dhive
- keychain-sdk
- Socket.IO client
- Jest for testing

## Questions or Problems?

- File an issue in the GitLab repository
- Contact the maintainers
- Join our community discussions

Thank you for contributing to Leaf! 