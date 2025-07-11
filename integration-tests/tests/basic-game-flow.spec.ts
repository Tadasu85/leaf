import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';
import { TEST_USERS, GAME_COMMANDS, SAMPLE_CHAT_MESSAGES } from '../utils/TestData';

test.describe('Leaf Game Integration Tests', () => {
  let gameActions: GameActions;

  test.beforeEach(async ({ page }) => {
    gameActions = new GameActions(page);
    await gameActions.navigateToGame();
  });

  test('should load the game interface correctly', async ({ page }) => {
    // Check that the game title is visible
    await expect(page.locator('.Title')).toBeVisible();
    
    // Check that the command input is available
    await expect(page.locator('input[placeholder*="command"]')).toBeVisible();
    
    // Check that the game output area exists
    await expect(page.locator('[class*="output"]').first()).toBeVisible();
  });

  test('should display welcome message for new users', async ({ page }) => {
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

  test('should handle login command input', async ({ page }) => {
    const commandInput = page.locator('input[placeholder*="command"]');
    
    // Test typing a login command
    await commandInput.fill('login testuser');
    await expect(commandInput).toHaveValue('login testuser');
    
    // Test submitting the command
    await commandInput.press('Enter');
    await expect(commandInput).toHaveValue('');
  });

  test('should process basic game commands', async ({ page }) => {
    // Test each basic command
    for (const command of GAME_COMMANDS.basic) {
      await gameActions.sendCommand(command);
      await page.waitForTimeout(1000);
      
      // Verify command was processed (input should be cleared)
      const commandInput = page.locator('input[placeholder*="command"]');
      await expect(commandInput).toHaveValue('');
    }
  });

  test('should handle social interactions', async ({ page }) => {
    // Test chat messages
    for (const message of SAMPLE_CHAT_MESSAGES.slice(0, 3)) {
      await gameActions.say(message);
      await page.waitForTimeout(1000);
    }
    
    // Test emotes
    await gameActions.emote('waves');
    await gameActions.emote('smiles');
    await gameActions.emote('nods');
    
    await page.waitForTimeout(2000);
  });

  test('should handle character customization', async ({ page }) => {
    // Test character description commands
    await gameActions.describe('A mysterious traveler exploring the digital realm');
    await page.waitForTimeout(1000);
    
    await gameActions.describeShort('A wanderer');
    await page.waitForTimeout(1000);
    
    // Test looking at self
    await gameActions.lookSelf();
    await page.waitForTimeout(1000);
  });

  test('should handle movement commands', async ({ page }) => {
    const directions = ['north', 'south', 'east', 'west'] as const;
    
    for (const direction of directions) {
      await gameActions.move(direction);
      await page.waitForTimeout(2000);
      
      // Verify the command was processed
      const commandInput = page.locator('input[placeholder*="command"]');
      await expect(commandInput).toHaveValue('');
    }
  });

  test('should handle invalid commands gracefully', async ({ page }) => {
    const invalidCommands = [
      'invalidcommand123',
      'move up',
      'jump',
      'fly',
      'teleport'
    ];
    
    for (const command of invalidCommands) {
      await gameActions.sendCommand(command);
      await page.waitForTimeout(1000);
      
      // Verify command was processed (input should be cleared)
      const commandInput = page.locator('input[placeholder*="command"]');
      await expect(commandInput).toHaveValue('');
    }
  });

  test('should maintain game state during session', async ({ page }) => {
    // Perform a series of actions
    await gameActions.look();
    await page.waitForTimeout(1000);
    
    await gameActions.say('Testing game state persistence');
    await page.waitForTimeout(1000);
    
    await gameActions.move('north');
    await page.waitForTimeout(2000);
    
    await gameActions.look();
    await page.waitForTimeout(1000);
    
    // Verify the game is still responsive
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
  });

  test('should handle rapid command input', async ({ page }) => {
    const commands = [
      'look',
      'say Hello',
      'emote waves',
      'look self',
      'north'
    ];
    
    // Send commands rapidly
    for (const command of commands) {
      await gameActions.sendCommand(command);
      await page.waitForTimeout(500); // Short delay
    }
    
    // Wait for all commands to process
    await page.waitForTimeout(3000);
    
    // Verify game is still responsive
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
  });

  test('should display game output correctly', async ({ page }) => {
    // Perform some actions to generate output
    await gameActions.look();
    await page.waitForTimeout(1000);
    
    await gameActions.say('Testing output display');
    await page.waitForTimeout(1000);
    
    // Get the output and verify it's not empty
    const output = await gameActions.getGameOutput();
    expect(output.length).toBeGreaterThan(0);
    
    // Verify output contains our message
    const hasOurMessage = output.some(message => 
      message.includes('Testing output display')
    );
    expect(hasOurMessage).toBeTruthy();
  });

  test('should handle long input gracefully', async ({ page }) => {
    const longMessage = 'A'.repeat(500); // Very long message
    
    await gameActions.say(longMessage);
    await page.waitForTimeout(2000);
    
    // Verify the game is still responsive
    const commandInput = page.locator('input[placeholder*="command"]');
    await expect(commandInput).toBeVisible();
    await expect(commandInput).toBeEnabled();
  });

  test('should handle special characters in input', async ({ page }) => {
    const specialMessages = [
      'Hello! How are you?',
      'Testing "quotes" and \'apostrophes\'',
      'Message with @ symbols and # hashtags',
      'Testing unicode: 🎮 🚀 🌟',
      'Message with numbers: 123 456 789'
    ];
    
    for (const message of specialMessages) {
      await gameActions.say(message);
      await page.waitForTimeout(1000);
      
      // Verify command was processed
      const commandInput = page.locator('input[placeholder*="command"]');
      await expect(commandInput).toHaveValue('');
    }
  });
}); 