import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';

test.describe('Specific Username Tests', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await page.goto('http://localhost:3000/');
  });

  test('should use custom username "alice"', async ({ page }) => {
    const username = 'alice';
    console.log(`Testing with custom username: ${username}`);
    
    await gameActions.login(username);
    
    // Send some commands to verify the username is being used
    await gameActions.sendCommand('look');
    await gameActions.sendCommand('say Hello from Alice!');
    
    // Verify the username appears in the output
    await expect(page.locator('.game-output')).toContainText(username);
  });

  test('should use custom username "bob"', async ({ page }) => {
    const username = 'bob';
    console.log(`Testing with custom username: ${username}`);
    
    await gameActions.login(username);
    
    await gameActions.sendCommand('look');
    await gameActions.sendCommand('say Hi everyone, Bob here!');
    
    await expect(page.locator('.game-output')).toContainText(username);
  });

  test('should use any username you specify', async ({ page }) => {
    // You can change this to any username you want to test with
    const username = 'mycustomuser';
    console.log(`Testing with custom username: ${username}`);
    
    await gameActions.login(username);
    
    await gameActions.sendCommand('look');
    await gameActions.sendCommand('say Testing with custom username!');
    
    await expect(page.locator('.game-output')).toContainText(username);
  });

  test('should test a single custom username', async ({ page }) => {
    // You can easily change this to any username you want
    const username = 'alice';
    console.log(`Testing with custom username: ${username}`);
    
    await gameActions.login(username);
    await gameActions.sendCommand('look');
    await gameActions.sendCommand(`say Hello, I'm ${username}!`);
    
    await expect(page.locator('.game-output')).toContainText(username);
  });
}); 