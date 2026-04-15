import { test, expect } from '@playwright/test';

/**
 * Hydration mismatch detection test for /settings/appearance
 * 
 * Run: NEXT_PUBLIC_ENABLE_MOCKS=true npx playwright test e2e/hydration-appearance.spec.ts --reporter=list
 */

test('detect hydration mismatch on /settings/appearance', async ({ page }) => {
  const hydrationErrors: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];

  // Listen for console messages
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    
    // Check for hydration-related messages
    if (text.toLowerCase().includes('hydrat') || 
        text.toLowerCase().includes('did not match') ||
        text.toLowerCase().includes('server') && text.toLowerCase().includes('client')) {
      hydrationErrors.push(text);
    }
    
    if (type === 'error') {
      consoleErrors.push(text);
    } else if (type === 'warning') {
      consoleWarnings.push(text);
    }
  });

  // Navigate to the appearance settings page
  await page.goto('/settings/appearance', {
    waitUntil: 'networkidle',
    timeout: 20000,
  });

  // Wait for React to fully settle
  await page.waitForTimeout(2000);

  // Log what we found
  console.log('=== Hydration Check Results ===');
  console.log(`Hydration errors found: ${hydrationErrors.length}`);
  hydrationErrors.forEach((err, i) => console.log(`  [${i + 1}] ${err.slice(0, 200)}`));
  
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.forEach((err, i) => console.log(`  [${i + 1}] ${err.slice(0, 200)}`));
  
  console.log(`Console warnings: ${consoleWarnings.length}`);
  consoleWarnings.forEach((warn, i) => console.log(`  [${i + 1}] ${warn.slice(0, 200)}`));

  // The test passes if no hydration errors - but we report FAIL if there are any
  if (hydrationErrors.length > 0) {
    throw new Error(`FAIL: Hydration mismatch detected: ${hydrationErrors[0].slice(0, 100)}`);
  }
  
  // Check console errors for hydration-related issues
  const hydrationRelatedErrors = consoleErrors.filter(e => 
    e.toLowerCase().includes('hydrat') || 
    e.toLowerCase().includes('did not match') ||
    (e.toLowerCase().includes('server') && e.toLowerCase().includes('client'))
  );
  
  if (hydrationRelatedErrors.length > 0) {
    throw new Error(`FAIL: Hydration-related console error: ${hydrationRelatedErrors[0].slice(0, 100)}`);
  }
  
  console.log('PASS: No hydration mismatch detected');
});
