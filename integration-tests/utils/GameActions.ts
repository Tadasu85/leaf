import { Page, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

/**
 * GameActions class - simulates all possible user interactions in the Leaf game
 * This is essentially an NPC controller that can perform any action a real user would
 */
export class GameActions {
  private page: Page;
  private isLoggedIn: boolean = false;
  private currentUsername: string | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the game and wait for it to load
   */
  async navigateToGame() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
    
    // Wait for the game title to be visible
    await this.page.waitForSelector('.Title', { timeout: 10000 });
    
    // Wait for the command input to be available
    await this.page.waitForSelector('input[placeholder*="command"]', { timeout: 10000 });
  }

  /**
   * Login with a specific username
   * Note: This simulates the login process but requires the Hive Keychain extension
   */
  async login(username: string) {
    if (this.isLoggedIn) {
      console.log(`Already logged in as ${this.currentUsername}`);
      return;
    }

    console.log(`Attempting to login as ${username}`);
    
    // Type the login command
    const commandInput = this.page.locator('input[placeholder*="command"]');
    await commandInput.fill(`login ${username}`);
    await commandInput.press('Enter');

    // Wait for login process to complete
    // This is a simplified version - in reality, the Hive Keychain would handle the actual authentication
    await this.page.waitForTimeout(3000);

    // Check if login was successful by looking for username in header
    try {
      await this.page.waitForSelector('.user-signout-container', { timeout: 10000 });
      this.isLoggedIn = true;
      this.currentUsername = username;
      console.log(`Successfully logged in as ${username}`);
    } catch (error) {
      console.log(`Login failed for ${username} - this is expected if Hive Keychain is not available`);
      // In a real test environment, you might want to mock the Hive Keychain
    }
  }

  /**
   * Send a command to the game
   */
  async sendCommand(command: string) {
    const commandInput = this.page.locator('input[placeholder*="command"]');
    await commandInput.fill(command);
    await commandInput.press('Enter');
    await this.page.waitForTimeout(1000); // Wait for command to process
  }

  /**
   * Look around the current room
   */
  async look() {
    await this.sendCommand('look');
  }

  /**
   * Look at self (character description)
   */
  async lookSelf() {
    await this.sendCommand('look self');
  }

  /**
   * Move in a direction
   */
  async move(direction: 'north' | 'south' | 'east' | 'west') {
    await this.sendCommand(direction);
  }

  /**
   * Say something in the current room
   */
  async say(message: string) {
    await this.sendCommand(`say ${message}`);
  }

  /**
   * Perform an emote
   */
  async emote(action: string) {
    await this.sendCommand(`emote ${action}`);
  }

  /**
   * Set character description
   */
  async describe(description: string) {
    await this.sendCommand(`@describe ${description}`);
  }

  /**
   * Set short character description
   */
  async describeShort(description: string) {
    await this.sendCommand(`@describeshort ${description}`);
  }

  /**
   * Open the build modal (if user is a builder)
   */
  async openBuildModal() {
    const buildButton = this.page.locator('button:has-text("Build")');
    if (await buildButton.isVisible()) {
      await buildButton.click();
      await this.page.waitForSelector('[data-testid="build-modal"]', { timeout: 5000 });
    }
  }

  /**
   * Open the queue modal (if user is admin)
   */
  async openQueueModal() {
    const queueButton = this.page.locator('button:has-text("Queue")');
    if (await queueButton.isVisible()) {
      await queueButton.click();
      await this.page.waitForSelector('[data-testid="queue-modal"]', { timeout: 5000 });
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    const signOutButton = this.page.locator('button:has-text("Sign Out")');
    if (await signOutButton.isVisible()) {
      await signOutButton.click();
      this.isLoggedIn = false;
      this.currentUsername = null;
    }
  }

  /**
   * Get the current game output messages
   */
  async getGameOutput(): Promise<string[]> {
    const outputElements = this.page.locator('.output-message');
    const messages = await outputElements.allTextContents();
    return messages.map(msg => msg.trim()).filter(msg => msg.length > 0);
  }

  /**
   * Wait for a specific message to appear in game output
   */
  async waitForMessage(message: string, timeout: number = 10000) {
    await this.page.waitForFunction(
      (msg) => {
        const outputElements = document.querySelectorAll('.output-message');
        return Array.from(outputElements).some(el => 
          el.textContent?.includes(msg)
        );
      },
      message,
      { timeout }
    );
  }

  /**
   * Check if user is logged in
   */
  isUserLoggedIn(): boolean {
    return this.isLoggedIn;
  }

  /**
   * Get current username
   */
  getCurrentUsername(): string | null {
    return this.currentUsername;
  }

  /**
   * Simulate a complete user session with random actions
   */
  async simulateUserSession(username: string, duration: number = 60000) {
    console.log(`Starting user session simulation for ${username}`);
    
    await this.login(username);
    
    if (!this.isLoggedIn) {
      console.log(`Cannot simulate session - login failed for ${username}`);
      return;
    }

    const startTime = Date.now();
    const actions = [
      () => this.look(),
      () => this.lookSelf(),
      () => this.say(faker.lorem.sentence()),
      () => this.emote(faker.helpers.arrayElement(['waves', 'smiles', 'nods', 'shrugs'])),
      () => this.move(faker.helpers.arrayElement(['north', 'south', 'east', 'west'])),
    ];

    while (Date.now() - startTime < duration) {
      const randomAction = faker.helpers.arrayElement(actions);
      try {
        await randomAction();
        await this.page.waitForTimeout(faker.number.int({ min: 2000, max: 5000 }));
      } catch (error) {
        console.log(`Action failed: ${error}`);
      }
    }

    await this.signOut();
    console.log(`Completed user session simulation for ${username}`);
  }

  /**
   * Perform a complete game walkthrough
   */
  async performGameWalkthrough(username: string) {
    console.log(`Starting complete game walkthrough for ${username}`);
    
    await this.login(username);
    
    if (!this.isLoggedIn) {
      console.log(`Cannot perform walkthrough - login failed for ${username}`);
      return;
    }

    // 1. Look around
    await this.look();
    await this.page.waitForTimeout(2000);

    // 2. Look at self
    await this.lookSelf();
    await this.page.waitForTimeout(2000);

    // 3. Set character description
    await this.describe('A mysterious traveler exploring the digital realm');
    await this.page.waitForTimeout(2000);

    // 4. Try to move in all directions
    const directions = ['north', 'south', 'east', 'west'] as const;
    for (const direction of directions) {
      await this.move(direction);
      await this.page.waitForTimeout(2000);
    }

    // 5. Interact socially
    await this.say('Hello, is anyone here?');
    await this.page.waitForTimeout(2000);
    
    await this.emote('looks around curiously');
    await this.page.waitForTimeout(2000);

    // 6. Try builder features if available
    await this.openBuildModal();
    await this.page.waitForTimeout(2000);

    // 7. Try admin features if available
    await this.openQueueModal();
    await this.page.waitForTimeout(2000);

    // 8. Sign out
    await this.signOut();
    
    console.log(`Completed game walkthrough for ${username}`);
  }
} 