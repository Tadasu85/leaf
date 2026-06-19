# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **ServerStatusNotifier**: Unobtrusive top-right card that appears when the signaling server is cold-starting (Render free tier). Shows after 5 seconds of connecting, fades out automatically when connected — uses existing `chat-status` UI classes to match the design system
- **Time-based events system**: Rooms whose exits change based on Hive block number. Phase is computed deterministically on every client from `startBlock` and `intervalBlocks` — no server coordination. Fully data-driven via game account metadata, no code changes needed to add new time-event rooms

### Changed
- **Dependency upgrade (June 2026)**: React 19, TypeScript 6, Node 24, Express 5, Socket.IO 4.8, Jest 30, and all associated tooling across both repos
- Removed deprecated `useGameState` hook (consolidated into `useGame`)
- Removed unused `@tanstack/react-query` dependency

### Fixed
- **SocketManager**: Now correctly emits `'connecting'` status when `connect()` is called, so UI can react immediately
- **SocketManager**: Added `connect_error` handler for initial connection failures (covers Render cold-start scenario where server hasn't responded yet)
- **SocketManager**: Raised `maxReconnectAttempts` from 5 to 10 (~161 second retry window vs ~31 seconds — enough to outlast any Render cold start)
- **SocketManager**: `attemptReconnect()` now guards against double-scheduling when both `connect_error` and `disconnect` fire
- **Login room display**: `displayRoom()` now called directly in `login()` rather than waiting on a socket event that never arrived
- **Hive API compatibility**: `get_content` no longer returns an `id` field — fixed all references to use `content.author` instead
- Fixed trust proxy configuration on Render (production server)

### Performance
- **20-50x faster room transitions** with bulk loading system
- **Reduced API calls** by 90% through upfront data loading
- **Improved memory management** with LRU caching

### Security
- Input validation with length limits, character allowlists, and injection detection
- Rate limiting: 100ms between commands client-side; 100 req/15min and 10 connections/min server-side

## [0.1.0] - 2024-07-26

### Added
- Initial framework structure for text-based adventure games
- Basic room navigation system
- Character customization commands
- Hive blockchain integration
- Test suite for core functionality
- WebSocket-based real-time communication
- Builder system for content creation
- Queue management for builder applications

### Changed
- Updated README to clarify Leaf framework and Ego Death game relationship
- Improved newline handling in game output
- Enhanced mobile responsiveness

### Fixed
- Resolved autofocus test issues in TextInputBox component
- Fixed room title display after look command
- Corrected test assertions for room data verification

### Known Issues
- Framework is still in active development
- Some features may be incomplete or subject to change 