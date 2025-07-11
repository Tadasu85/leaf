# Leaf Game Integration Tests

This directory contains comprehensive integration tests for the Leaf game that simulate real user interactions. These tests are designed to be like NPCs (Non-Player Characters) that can perform all the actions a real user would do in the game.

## Overview

The integration test suite uses Playwright to automate browser interactions and simulate complete user journeys through the Leaf game. It includes:

- **Basic Game Flow Tests**: Test all fundamental game mechanics
- **NPC Simulation Tests**: Simulate realistic user behavior patterns
- **Performance & Load Tests**: Test system performance under various loads
- **Error Handling Tests**: Test how the system handles edge cases

## Features

### 🎮 Complete Game Coverage
- Login/logout flows
- Movement and navigation
- Chat and social interactions
- Character customization
- Builder and admin features
- Error scenarios

### 🤖 NPC-like Behavior
- Realistic user session simulation
- Random action patterns
- Different personality types
- Stress testing scenarios
- Performance monitoring

### 📊 Comprehensive Reporting
- HTML test reports
- JSON result exports
- JUnit XML for CI integration
- Screenshots and videos on failure
- Performance metrics

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

## Installation

1. **Navigate to the integration tests directory:**
   ```bash
   cd leaf/integration-tests
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Playwright browsers:**
   ```bash
   npm run install-browsers
   ```

## Configuration

### Environment Variables

Create a `.env` file in the `integration-tests` directory:

```env
# Test Environment URLs
TEST_BASE_URL=http://localhost:3000
LIVE_BASE_URL=https://leaf-game.herokuapp.com

# Test Configuration
TEST_TIMEOUT=30000
TEST_RETRIES=2

# Performance Test Settings
LIGHT_LOAD_USERS=5
MEDIUM_LOAD_USERS=10
HEAVY_LOAD_USERS=20
```

### Test Configurations

- **`playwright.config.ts`**: Default configuration for local development
- **`playwright.live.config.ts`**: Configuration for testing against live production
- **`playwright.staging.config.ts`**: Configuration for testing against staging environment

## Running Tests

### Basic Test Commands

```bash
# Run all tests
npm test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests with debug mode
npm run test:debug

# Run tests with UI mode
npm run test:ui

# Show test report
npm run test:report
```

### Environment-Specific Tests

```bash
# Test against live production
npm run test:live

# Test against staging
npm run test:staging

# Test against local development
npm test
```

### Specific Test Suites

```bash
# Run only basic game flow tests
npx playwright test tests/basic-game-flow.spec.ts

# Run only NPC simulation tests
npx playwright test tests/npc-simulation.spec.ts

# Run only performance tests
npx playwright test tests/performance-load.spec.ts

# Run tests with specific browser
npx playwright test --project=chromium
```

## Test Structure

### Core Utilities

- **`utils/GameActions.ts`**: Main class that encapsulates all game interactions
- **`utils/TestData.ts`**: Test data, mock users, and configuration constants

### Test Files

- **`tests/basic-game-flow.spec.ts`**: Tests fundamental game mechanics
- **`tests/npc-simulation.spec.ts`**: Tests realistic user behavior patterns
- **`tests/performance-load.spec.ts`**: Tests system performance and load handling

### GameActions Class

The `GameActions` class provides methods for all possible user interactions:

```typescript
const gameActions = new GameActions(page);

// Basic navigation
await gameActions.navigateToGame();
await gameActions.login('username');

// Game commands
await gameActions.look();
await gameActions.move('north');
await gameActions.say('Hello!');
await gameActions.emote('waves');

// Character customization
await gameActions.describe('A mysterious traveler');
await gameActions.describeShort('A wanderer');

// Advanced features
await gameActions.openBuildModal();
await gameActions.openQueueModal();

// Session management
await gameActions.simulateUserSession('username', 60000);
await gameActions.performGameWalkthrough('username');
```

## Test Scenarios

### 1. New User Experience
- Navigate to game
- Read welcome messages
- Attempt login
- Try basic commands
- Explore interface

### 2. Regular Player Session
- Login with valid credentials
- Explore rooms and movement
- Chat with other players
- Use emotes and social features
- Customize character
- Sign out

### 3. Builder Session
- Login as builder
- Access build modal
- Create/edit rooms
- Test builder permissions
- Manage room content

### 4. Admin Session
- Login as admin
- Access queue modal
- Review build requests
- Manage system settings
- Monitor user activity

### 5. Performance Testing
- Light load (5 concurrent users)
- Medium load (10 concurrent users)
- Heavy load (20+ concurrent users)
- Rapid connection testing
- Memory usage monitoring
- Network latency simulation

## CI/CD Integration

### GitLab CI Example

Add this to your `.gitlab-ci.yml`:

```yaml
integration-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - cd leaf/integration-tests
    - npm install
    - npm run install-browsers
    - npm test
  artifacts:
    reports:
      junit: test-results/results.xml
    paths:
      - test-results/
      - playwright-report/
    expire_in: 1 week
  only:
    - main
    - merge_requests
```

### GitHub Actions Example

Create `.github/workflows/integration-tests.yml`:

```yaml
name: Integration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd leaf/integration-tests
          npm install
      - name: Install Playwright browsers
        run: |
          cd leaf/integration-tests
          npm run install-browsers
      - name: Run tests
        run: |
          cd leaf/integration-tests
          npm test
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: leaf/integration-tests/test-results/
```

## Troubleshooting

### Common Issues

1. **Browser Installation Fails**
   ```bash
   # Clear npm cache and retry
   npm cache clean --force
   npm run install-browsers
   ```

2. **Tests Fail on CI**
   - Ensure proper Node.js version
   - Check browser installation
   - Verify environment variables

3. **Slow Test Performance**
   - Reduce number of concurrent tests
   - Increase timeouts in configuration
   - Use headless mode for CI

4. **Login Tests Fail**
   - Login requires Hive Keychain extension
   - Tests are designed to handle login failures gracefully
   - Consider mocking authentication for unit tests

### Debug Mode

Run tests in debug mode to see what's happening:

```bash
npm run test:debug
```

This will:
- Open browser in headed mode
- Pause execution at breakpoints
- Allow step-by-step debugging
- Show detailed logs

## Contributing

### Adding New Tests

1. **Create test file:**
   ```bash
   touch tests/new-feature.spec.ts
   ```

2. **Add test methods to GameActions:**
   ```typescript
   // In utils/GameActions.ts
   async newFeature() {
     // Implementation
   }
   ```

3. **Write test cases:**
   ```typescript
   // In tests/new-feature.spec.ts
   test('should handle new feature', async ({ page }) => {
     const gameActions = new GameActions(page);
     await gameActions.navigateToGame();
     await gameActions.newFeature();
     // Assertions
   });
   ```

### Best Practices

- Use descriptive test names
- Group related tests in describe blocks
- Clean up resources after tests
- Handle async operations properly
- Add appropriate timeouts
- Use data-driven tests for multiple scenarios

## Performance Monitoring

The test suite includes built-in performance monitoring:

- **Response Time Tracking**: Measures how long actions take
- **Memory Usage**: Monitors browser memory consumption
- **Concurrent User Simulation**: Tests system under load
- **Resource Cleanup**: Ensures proper cleanup after tests

## Security Considerations

- Tests run against test environments by default
- No real user credentials in test data
- Mock authentication for sensitive operations
- Rate limiting respected in test configurations
- Secure handling of environment variables

## Support

For issues with the integration tests:

1. Check the troubleshooting section
2. Review test logs and reports
3. Run tests in debug mode
4. Check environment configuration
5. Verify browser installation

## License

This integration test suite is part of the Leaf game project and follows the same license terms. 