import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';

test.describe('UI Only Tests (No Login)', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await page.goto('http://localhost:3000/');
  });

  test('should display game interface correctly', async ({ page }) => {
    // Check that the command input is visible and enabled
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
    
    // Check that the game output area exists
    await expect(page.locator('[class*="output"]').first()).toBeVisible();
  });

  test('should handle command input without sending', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test typing a command without pressing Enter
    await commandInput.fill('look');
    await expect(commandInput).toHaveValue('look');
    
    // Clear the input
    await commandInput.fill('');
    await expect(commandInput).toHaveValue('');
  });

  test('should test command input with username', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test typing a login command without sending it
    const username = 'alice';
    await commandInput.fill(`login ${username}`);
    await expect(commandInput).toHaveValue(`login ${username}`);
    
    // Don't press Enter to avoid triggering Keychain
    console.log(`Typed login command for ${username} but didn't send it`);
  });

  test('should handle various command inputs', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    const testCommands = [
      'look',
      'say Hello world',
      'emote waves',
      'north',
      'south',
      'east',
      'west',
      '@describe A test character',
      '@describeshort Test'
    ];
    
    for (const command of testCommands) {
      await commandInput.fill(command);
      await expect(commandInput).toHaveValue(command);
      
      // Clear for next test
      await commandInput.fill('');
    }
  });

  test('should display welcome messages', async ({ page }) => {
    // Wait for welcome messages to appear
    await page.waitForTimeout(2000);
    
    const output = await gameActions.getGameOutput();
    
    // Check for welcome messages
    const hasWelcomeMessage = output.some(message => 
      message.includes('Hive account') || 
      message.includes('login command') ||
      message.includes('keychain extension')
    );
    
    expect(hasWelcomeMessage).toBeTruthy();
  });
}); 