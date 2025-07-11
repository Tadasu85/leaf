import { test, expect } from '@playwright/test';
import { GameActions } from '../utils/GameActions';
import { PERFORMANCE_CONFIGS } from '../utils/TestData';

test.describe('Performance and Load Tests', () => {
  test('should handle light load (5 users)', async ({ browser }) => {
    console.log('Starting light load test with 5 users');
    
    const config = PERFORMANCE_CONFIGS.light;
    const contexts = [];
    const gameActions = [];
    
    // Create multiple browser contexts (simulating different users)
    for (let i = 0; i < config.users; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
    }
    
    // Simulate concurrent user sessions
    const startTime = Date.now();
    const promises = gameActions.map((actions, index) => 
      actions.simulateUserSession(`user${index}`, config.sessionDuration)
    );
    
    await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Light load test completed in ${endTime - startTime}ms`);
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle medium load (10 users)', async ({ browser }) => {
    console.log('Starting medium load test with 10 users');
    
    const config = PERFORMANCE_CONFIGS.medium;
    const contexts = [];
    const gameActions = [];
    
    // Create multiple browser contexts
    for (let i = 0; i < config.users; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
    }
    
    // Simulate concurrent user sessions
    const startTime = Date.now();
    const promises = gameActions.map((actions, index) => 
      actions.simulateUserSession(`user${index}`, config.sessionDuration)
    );
    
    await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Medium load test completed in ${endTime - startTime}ms`);
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle rapid user connections', async ({ browser }) => {
    console.log('Starting rapid connection test');
    
    const contexts = [];
    const gameActions = [];
    
    // Create 20 contexts rapidly
    for (let i = 0; i < 20; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
    }
    
    // Navigate all pages simultaneously
    const startTime = Date.now();
    const promises = gameActions.map(actions => actions.navigateToGame());
    
    await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Rapid connection test completed in ${endTime - startTime}ms`);
    
    // Verify all pages loaded correctly
    for (const actions of gameActions) {
      const page = actions['page'];
      const commandInput = page.locator('input[placeholder*="command"]');
      await expect(commandInput).toBeVisible();
    }
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle concurrent command execution', async ({ browser }) => {
    console.log('Starting concurrent command execution test');
    
    const contexts = [];
    const gameActions = [];
    
    // Create 5 contexts
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
    }
    
    // Execute commands concurrently
    const commands = ['look', 'say Hello', 'emote waves', 'look self'];
    const startTime = Date.now();
    
    const promises = gameActions.map(actions => 
      Promise.all(commands.map(cmd => actions.sendCommand(cmd)))
    );
    
    await Promise.all(promises);
    const endTime = Date.now();
    
    console.log(`Concurrent command execution completed in ${endTime - startTime}ms`);
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
  });

  test('should handle memory usage under load', async ({ browser }) => {
    console.log('Starting memory usage test');
    
    const contexts = [];
    const gameActions = [];
    
    // Create contexts gradually to test memory usage
    for (let i = 0; i < 10; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
      await page.waitForTimeout(1000);
      
      console.log(`Created context ${i + 1}/10`);
    }
    
    // Perform actions on all contexts
    const promises = gameActions.map((actions, index) => 
      actions.simulateUserSession(`memoryuser${index}`, 15000)
    );
    
    await Promise.all(promises);
    
    // Clean up
    for (const context of contexts) {
      await context.close();
    }
    
    console.log('Memory usage test completed');
  });

  test('should handle network latency simulation', async ({ browser }) => {
    console.log('Starting network latency simulation test');
    
    // Create context with slow network simulation
    const context = await browser.newContext({
      ...browser.newContext().context,
      // Simulate slow 3G network
      extraHTTPHeaders: {
        'X-Simulate-Latency': '1000'
      }
    });
    
    const page = await context.newPage();
    const actions = new GameActions(page);
    
    await actions.navigateToGame();
    
    // Perform actions with longer timeouts
    const startTime = Date.now();
    
    await actions.look();
    await page.waitForTimeout(3000);
    
    await actions.say('Testing with simulated latency');
    await page.waitForTimeout(3000);
    
    await actions.move('north');
    await page.waitForTimeout(3000);
    
    const endTime = Date.now();
    
    console.log(`Network latency test completed in ${endTime - startTime}ms`);
    
    await context.close();
  });

  test('should handle browser crash recovery', async ({ browser }) => {
    console.log('Starting browser crash recovery test');
    
    const contexts = [];
    const gameActions = [];
    
    // Create multiple contexts
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
    }
    
    // Close some contexts to simulate crashes
    for (let i = 0; i < 2; i++) {
      await contexts[i].close();
    }
    
    // Continue with remaining contexts
    const remainingActions = gameActions.slice(2);
    const promises = remainingActions.map((actions, index) => 
      actions.simulateUserSession(`recoveryuser${index}`, 10000)
    );
    
    await Promise.all(promises);
    
    // Clean up remaining contexts
    for (let i = 2; i < contexts.length; i++) {
      await contexts[i].close();
    }
    
    console.log('Browser crash recovery test completed');
  });

  test('should handle resource cleanup', async ({ browser }) => {
    console.log('Starting resource cleanup test');
    
    const contexts = [];
    const gameActions = [];
    
    // Create contexts
    for (let i = 0; i < 8; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const actions = new GameActions(page);
      
      contexts.push(context);
      gameActions.push(actions);
      
      await actions.navigateToGame();
    }
    
    // Perform actions
    const promises = gameActions.map((actions, index) => 
      actions.simulateUserSession(`cleanupuser${index}`, 8000)
    );
    
    await Promise.all(promises);
    
    // Clean up contexts one by one
    for (const context of contexts) {
      await context.close();
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between closures
    }
    
    console.log('Resource cleanup test completed');
  });
}); 