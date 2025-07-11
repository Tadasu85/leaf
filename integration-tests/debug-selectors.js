const { chromium } = require('@playwright/test');

async function debugSelectors() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to local development server...');
    await page.goto('http://localhost:3000/');
    
    console.log('Waiting for page to load...');
    await page.waitForLoadState('networkidle');
    
    console.log('\n=== Page Title ===');
    console.log(await page.title());
    
    console.log('\n=== Looking for game elements ===');
    
    // Check for title elements
    const titleSelectors = [
      '.Title',
      '.title',
      'h1',
      '[class*="title"]',
      '[class*="Title"]'
    ];
    
    for (const selector of titleSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.count() > 0) {
          console.log(`✓ Found title with selector: ${selector}`);
          console.log(`  Text: "${await element.textContent()}"`);
        }
      } catch (e) {
        console.log(`✗ Selector not found: ${selector}`);
      }
    }
    
    // Check for input elements
    const inputSelectors = [
      'input[placeholder*="command"]',
      'input[placeholder*="Command"]',
      'input[type="text"]',
      'input',
      'textarea'
    ];
    
    console.log('\n=== Looking for input elements ===');
    for (const selector of inputSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.count() > 0) {
          console.log(`✓ Found input with selector: ${selector}`);
          console.log(`  Placeholder: "${await element.getAttribute('placeholder')}"`);
          console.log(`  Type: "${await element.getAttribute('type')}"`);
        }
      } catch (e) {
        console.log(`✗ Selector not found: ${selector}`);
      }
    }
    
    // Check for game output elements
    const outputSelectors = [
      '.game-output-window',
      '.game-output',
      '.output',
      '[class*="output"]',
      '[class*="game"]'
    ];
    
    console.log('\n=== Looking for game output elements ===');
    for (const selector of outputSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.count() > 0) {
          console.log(`✓ Found output with selector: ${selector}`);
          console.log(`  Text: "${(await element.textContent()).substring(0, 100)}..."`);
        }
      } catch (e) {
        console.log(`✗ Selector not found: ${selector}`);
      }
    }
    
    // Take a screenshot for manual inspection
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log('\n=== Screenshot saved as debug-screenshot.png ===');
    
    // Wait a bit so we can see the page
    console.log('\nWaiting 10 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debugSelectors(); 