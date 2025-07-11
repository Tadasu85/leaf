import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';
import { TEST_USERS } from '../utils/TestData';

test.describe('Custom Username Tests', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await page.goto('http://localhost:3000/');
  });

  test('should use specific predefined username', async ({ page }) => {
    // Use a specific predefined user
    const testUser = TEST_USERS[0]; // 'testuser1'
    
    console.log(`Testing with username: ${testUser.username}`);
    
    // Login with specific username
    await gameActions.login(testUser.username);
    
    // Verify the username appears in the output
    await expect(page.locator('.game-output')).toContainText(testUser.username);
  });

  test('should test with builder account', async ({ page }) => {
    const builderUser = TEST_USERS.find(user => user.role === 'builder');
    expect(builderUser).toBeDefined();
    
    console.log(`Testing with builder account: ${builderUser!.username}`);
    
    await gameActions.login(builderUser!.username);
    
    // Test builder-specific functionality
    await gameActions.sendCommand('look');
    await expect(page.locator('.game-output')).toContainText(builderUser!.username);
  });

  test('should test with admin account', async ({ page }) => {
    const adminUser = TEST_USERS.find(user => user.role === 'admin');
    expect(adminUser).toBeDefined();
    
    console.log(`Testing with admin account: ${adminUser!.username}`);
    
    await gameActions.login(adminUser!.username);
    
    // Test admin-specific functionality
    await gameActions.sendCommand('look');
    await expect(page.locator('.game-output')).toContainText(adminUser!.username);
  });
}); 