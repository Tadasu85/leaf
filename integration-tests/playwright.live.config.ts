import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration for testing against live production environment
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/live-results.json' }],
    ['junit', { outputFile: 'test-results/live-results.xml' }]
  ],
  use: {
    baseURL: process.env.LIVE_BASE_URL || 'https://leaf-game.herokuapp.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 45000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  // No webServer for live testing
}); 