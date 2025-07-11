import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';
import { TEST_USERS, PERFORMANCE_CONFIGS } from '../utils/TestData';

test.describe('NPC Simulation Tests', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await gameActions.navigateToGame();
  });

  test('should simulate a complete new user experience', async ({ page }) => {
    console.log('Starting new user experience simulation');
    
    // 1. Navigate and read welcome message
    await page.waitForTimeout(2000);
    const output = await gameActions.getGameOutput();
    expect(output.length).toBeGreaterThan(0);
    
    // 2. Try to login (will fail without Hive Keychain, but that's expected)
    await gameActions.login('newuser123');
    await page.waitForTimeout(3000);
    
    // 3. Try basic commands even without login
    await gameActions.look();
    await page.waitForTimeout(1000);
    
    await gameActions.sendCommand('help');
    await page.waitForTimeout(1000);
    
    // 4. Verify game is still responsive
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
    
    console.log('Completed new user experience simulation');
  });

  test('should simulate regular player session', async ({ page }) => {
    console.log('Starting regular player session simulation');
    
    // Simulate a regular player session
    await gameActions.simulateUserSession('regularplayer', 30000); // 30 seconds
    
    // Verify session completed
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    
    console.log('Completed regular player session simulation');
  });

  test('should simulate builder session', async ({ page }) => {
    console.log('Starting builder session simulation');
    
    // Try to login as a builder
    await gameActions.login('testbuilder');
    await page.waitForTimeout(3000);
    
    // Try to access builder features
    await gameActions.openBuildModal();
    await page.waitForTimeout(2000);
    
    // Perform some builder actions
    await gameActions.sendCommand('look');
    await page.waitForTimeout(1000);
    
    await gameActions.say('Testing builder features');
    await page.waitForTimeout(1000);
    
    // Sign out
    await gameActions.signOut();
    
    console.log('Completed builder session simulation');
  });

  test('should simulate admin session', async ({ page }) => {
    console.log('Starting admin session simulation');
    
    // Try to login as an admin
    await gameActions.login('testadmin');
    await page.waitForTimeout(3000);
    
    // Try to access admin features
    await gameActions.openQueueModal();
    await page.waitForTimeout(2000);
    
    // Perform some admin actions
    await gameActions.sendCommand('look');
    await page.waitForTimeout(1000);
    
    await gameActions.say('Testing admin features');
    await page.waitForTimeout(1000);
    
    // Sign out
    await gameActions.signOut();
    
    console.log('Completed admin session simulation');
  });

  test('should perform complete game walkthrough', async ({ page }) => {
    console.log('Starting complete game walkthrough');
    
    // Perform a complete walkthrough
    await gameActions.performGameWalkthrough('walkthroughuser');
    
    // Verify walkthrough completed
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    
    console.log('Completed game walkthrough');
  });

  test('should handle multiple rapid sessions', async ({ page }) => {
    console.log('Starting multiple rapid sessions test');
    
    const usernames = ['user1', 'user2', 'user3', 'user4', 'user5'];
    
    for (const username of usernames) {
      console.log(`Simulating session for ${username}`);
      
      // Quick session for each user
      await gameActions.login(username);
      await page.waitForTimeout(1000);
      
      await gameActions.look();
      await page.waitForTimeout(500);
      
      await gameActions.say(`Hello from ${username}`);
      await page.waitForTimeout(500);
      
      await gameActions.signOut();
      await page.waitForTimeout(1000);
    }
    
    // Verify game is still responsive after multiple sessions
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
    
    console.log('Completed multiple rapid sessions test');
  });

  test('should simulate realistic user behavior patterns', async ({ page }) => {
    console.log('Starting realistic user behavior simulation');
    
    // Simulate a user who explores thoroughly
    await gameActions.login('explorer');
    await page.waitForTimeout(2000);
    
    // Look around first
    await gameActions.look();
    await page.waitForTimeout(2000);
    
    // Look at self
    await gameActions.lookSelf();
    await page.waitForTimeout(2000);
    
    // Set character description
    await gameActions.describe('An intrepid explorer mapping the digital frontier');
    await page.waitForTimeout(2000);
    
    // Try all directions systematically
    const directions = ['north', 'south', 'east', 'west'] as const;
    for (const direction of directions) {
      await gameActions.move(direction);
      await page.waitForTimeout(3000);
      
      await gameActions.look();
      await page.waitForTimeout(2000);
      
      await gameActions.say(`Exploring the ${direction} area`);
      await page.waitForTimeout(2000);
    }
    
    // Social interaction
    await gameActions.say('This place is fascinating!');
    await page.waitForTimeout(2000);
    
    await gameActions.emote('looks around in wonder');
    await page.waitForTimeout(2000);
    
    // Sign out
    await gameActions.signOut();
    
    console.log('Completed realistic user behavior simulation');
  });

  test('should handle stress testing with multiple actions', async ({ page }) => {
    console.log('Starting stress testing');
    
    // Perform many actions rapidly
    const actions = [
      () => gameActions.look(),
      () => gameActions.say('Stress test message'),
      () => gameActions.emote('waves'),
      () => gameActions.move('north'),
      () => gameActions.move('south'),
      () => gameActions.lookSelf(),
    ];
    
    // Execute actions rapidly
    for (let i = 0; i < 20; i++) {
      const action = actions[i % actions.length];
      try {
        await action();
        await page.waitForTimeout(500);
      } catch (error) {
        console.log(`Action ${i} failed: ${error}`);
      }
    }
    
    // Verify game is still responsive
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
    
    console.log('Completed stress testing');
  });

  test('should simulate different user personalities', async ({ page }) => {
    console.log('Starting personality simulation test');
    
    const personalities = [
      {
        name: 'shy',
        actions: [
          () => gameActions.look(),
          () => gameActions.lookSelf(),
          () => gameActions.emote('nervously fidgets'),
        ]
      },
      {
        name: 'social',
        actions: [
          () => gameActions.say('Hello everyone!'),
          () => gameActions.say('How is everyone doing?'),
          () => gameActions.emote('waves enthusiastically'),
          () => gameActions.say('This is such a great place!'),
        ]
      },
      {
        name: 'explorer',
        actions: [
          () => gameActions.move('north'),
          () => gameActions.look(),
          () => gameActions.move('east'),
          () => gameActions.look(),
          () => gameActions.say('Fascinating!'),
        ]
      }
    ];
    
    for (const personality of personalities) {
      console.log(`Simulating ${personality.name} personality`);
      
      await gameActions.login(`user_${personality.name}`);
      await page.waitForTimeout(2000);
      
      for (const action of personality.actions) {
        try {
          await action();
          await page.waitForTimeout(2000);
        } catch (error) {
          console.log(`Action failed for ${personality.name}: ${error}`);
        }
      }
      
      await gameActions.signOut();
      await page.waitForTimeout(1000);
    }
    
    console.log('Completed personality simulation test');
  });
}); 