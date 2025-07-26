# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Comprehensive test suite with 125 passing tests
- Memory monitoring and cache management tools
- Bulk data loading architecture for improved performance
- Real-time chat and emote system
- Builder queue management system
- Time-based events using blockchain heartbeat
- Mobile-responsive design with PWA support
- Security improvements with input validation and rate limiting

### Changed
- **BREAKING**: Completely rewrote test suite to fix infinite loops and memory issues
- Updated useSocket hook dependency management to prevent infinite re-renders
- Improved useGameData hook to remove circular dependencies
- Enhanced README with comprehensive technical documentation
- Optimized bulk loading system for instant room transitions
- Improved mobile detection and keychain integration

### Fixed
- **CRITICAL**: Fixed infinite loop in useSocket hook causing memory leaks
- **CRITICAL**: Resolved circular dependencies in useGameData hook
- Fixed test suite hanging and running out of memory
- Resolved autofocus test issues in TextInputBox component
- Fixed room title display after look command
- Corrected test assertions for room data verification
- Fixed mobile keychain integration issues
- Resolved WebSocket connection cleanup problems

### Performance
- **20-50x faster room transitions** with bulk loading system
- **Reduced API calls** by 90% through upfront data loading
- **Improved memory management** with LRU caching
- **Faster test execution** (under 4 seconds vs previous hanging)

### Security
- Added comprehensive input validation and sanitization
- Implemented rate limiting for commands (100ms between commands)
- Added injection pattern detection and blocking
- Enhanced permission-based access control

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