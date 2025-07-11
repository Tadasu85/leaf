import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';
import { TEST_USERS } from '../utils/TestData';

test.describe('Username Definition Tests', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await page.goto('http://localhost:3000/');
  });

  test('should test with predefined usernames', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test each predefined username
    for (const user of TEST_USERS.slice(0, 3)) { // Test first 3 users
      console.log(`Testing with predefined username: ${user.username} (${user.role})`);
      
      // Type the login command but don't send it
      await commandInput.fill(`login ${user.username}`);
      await expect(commandInput).toHaveValue(`login ${user.username}`);
      
      // Verify the command is typed correctly
      console.log(`✓ Successfully typed login command for ${user.username}`);
      
      // Clear for next test
      await commandInput.fill('');
    }
  });

  test('should test with custom usernames', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Define your custom usernames here
    const customUsernames = [
      'alice',
      'bob', 
      'charlie',
      'diana',
      'eve',
      'frank',
      'grace',
      'henry'
    ];
    
    for (const username of customUsernames) {
      console.log(`Testing with custom username: ${username}`);
      
      // Type the login command but don't send it
      await commandInput.fill(`login ${username}`);
      await expect(commandInput).toHaveValue(`login ${username}`);
      
      console.log(`✓ Successfully typed login command for ${username}`);
      
      // Clear for next test
      await commandInput.fill('');
    }
  });

  test('should test username with special characters', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test usernames with special characters
    const specialUsernames = [
      'user_123',
      'test-user',
      'player.name',
      'gamer123',
      'cool_user',
      'test.user.123'
    ];
    
    for (const username of specialUsernames) {
      console.log(`Testing with special username: ${username}`);
      
      await commandInput.fill(`login ${username}`);
      await expect(commandInput).toHaveValue(`login ${username}`);
      
      console.log(`✓ Successfully typed login command for ${username}`);
      
      await commandInput.fill('');
    }
  });

  test('should test username validation', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test various username formats
    const testUsernames = [
      'a',                    // Very short
      'verylongusername123',  // Very long
      'USERNAME',             // All caps
      'userName',             // Mixed case
      '123456',               // All numbers
      'user-name',            // With hyphen
      'user_name',            // With underscore
      'user.name',            // With dot
    ];
    
    for (const username of testUsernames) {
      console.log(`Testing username format: ${username}`);
      
      await commandInput.fill(`login ${username}`);
      await expect(commandInput).toHaveValue(`login ${username}`);
      
      console.log(`✓ Successfully typed login command for ${username}`);
      
      await commandInput.fill('');
    }
  });

  test('should demonstrate username definition in test data', async ({ page }) => {
    console.log('Available predefined usernames:');
    
    for (const user of TEST_USERS) {
      console.log(`- ${user.username} (${user.role}): ${user.description}`);
    }
    
    // Test using a specific predefined user
    const selectedUser = TEST_USERS.find(user => user.username === 'alice');
    if (selectedUser) {
      console.log(`\nSelected user for testing: ${selectedUser.username}`);
      
      const commandInput = page.locator('input[placeholder*="command"]');
      await commandInput.fill(`login ${selectedUser.username}`);
      await expect(commandInput).toHaveValue(`login ${selectedUser.username}`);
      
      console.log(`✓ Ready to test with ${selectedUser.username}`);
    }
  });
}); 