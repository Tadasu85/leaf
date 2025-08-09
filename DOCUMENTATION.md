# Leaf Documentation Index

Welcome to the Leaf framework documentation! This index will help you find the information you need quickly.

## 📖 Getting Started

### For New Users
- **[README.md](README.md)** - Main project overview, quick start guide, and key features
- **[CHANGELOG.md](CHANGELOG.md)** - Recent changes and version history

### For Developers
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines, coding standards, and contribution process
- **[TIME_EVENTS_README.md](TIME_EVENTS_README.md)** - Technical documentation for the blockchain-based time events system

### For Mobile Development
- **[MOBILE_ROADMAP.md](MOBILE_ROADMAP.md)** - Mobile development plans, features, and implementation timeline

## 🏗️ Architecture Documentation

### Core Systems
- **Blockchain Integration**: Hive blockchain as primary source of truth
- **Real-time Communication**: WebSocket-based signaling server
- **State Management**: React hooks architecture with GameState class
- **Performance**: Bulk data loading with LRU caching
 - **Programmability**: VSC-backed verb runtime (see docs/programmability.md)

### Technical Features
- **Bulk Loading**: 20-50x faster room transitions
- **Memory Management**: Automatic cache management and monitoring
- **Security**: Input validation, rate limiting, and permission-based access
- **Mobile Support**: Responsive design with PWA capabilities

## 🎮 Game Features

### Player Features
- Text-based adventure gameplay
- Character customization
- Real-time chat and emotes
- Room exploration and movement
- Mobile-responsive interface

### Builder Features
- Room creation and modification
- Queue management system
- Time-based events creation
- Content management tools

### Technical Features
- Blockchain-based persistence
- Real-time player interactions
- Automatic state synchronization
- Performance monitoring tools

## 🔧 Development Resources

### Testing
- **125 passing tests** covering core functionality
- **Fast execution** (under 4 seconds)
- **Comprehensive coverage** of components and hooks
- **Memory leak prevention** with proper cleanup

### Performance
- **Bulk data loading** for instant room transitions
- **LRU caching** with automatic memory management
- **90% reduction in API calls** through upfront loading
- **Mobile optimization** for slower connections

### Security
- **Input validation** with length limits and character validation
- **Rate limiting** (100ms between commands)
- **Injection detection** and blocking
- **Permission-based access** control

## 📱 Mobile Development

### Current Status
- ✅ Responsive design for screens ≤700px
- ✅ Mobile keychain integration
- ✅ Touch-friendly UI elements
- ✅ PWA basic functionality
- ✅ Accessibility features

### Planned Features
- Mobile-optimized text input
- Bottom navigation bar
- Command auto-complete
- Touch-friendly exit buttons
- Service worker for offline caching

## ⏰ Time-Based Events

### Available Systems
- **Ferry System**: 6-phase transportation between locations
- **Market Cycles**: Trading opportunities with time-based availability
- **Weather Systems**: Dynamic environmental changes
- **Custom Events**: User-defined time-based events

### Technical Implementation
- Blockchain heartbeat mechanism
- Configurable intervals (default: 100 blocks ≈ 5 minutes)
- Dynamic room state updates
- Automatic phase cycling

## 🚀 Deployment

### Client Deployment
- Production build with `npm run build`
- Static file hosting (Netlify, Vercel, etc.)
- Environment variable configuration
- PWA deployment considerations

### Server Deployment
- WebSocket signaling server
- Real-time communication handling
- Connection state management
- Health check endpoints

## 📊 Monitoring & Debugging

### Development Tools
- **Memory Monitor**: Real-time cache and memory usage
- **Debug Commands**: Cache statistics and management
- **Performance Tracking**: Room transition timing
- **Error Boundaries**: Graceful error handling

### Production Monitoring
- WebSocket connection health
- Memory usage tracking
- Performance metrics
- Error logging and reporting

## 🤝 Contributing

### Getting Started
1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Set up development environment
3. Run tests to ensure everything works
4. Create feature branch and make changes
5. Submit merge request with clear description

### Code Standards
- TypeScript for all new code
- React functional components with hooks
- Comprehensive test coverage
- Performance-conscious development
- Accessibility-first approach

## 📞 Support & Community

### Documentation Issues
- File an issue in the GitLab repository
- Suggest improvements to documentation
- Report outdated or incorrect information

### Development Questions
- Check existing documentation first
- Review test files for implementation examples
- Contact maintainers for complex issues
- Join community discussions

---

*This documentation is maintained by the Leaf development team. For questions or suggestions, please file an issue in the GitLab repository.* 