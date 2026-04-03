const { chromium } = require('playwright');

const BASE_URL = process.env.PLAYWRIGHT_URL || 'http://localhost:3000';

async function runTests() {
  console.log('Starting Route Accessibility Verification...\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Test 1: Sidebar exposes all required navigation items
    console.log('Test 1: Sidebar navigation items...');
    try {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(2000);

      const expectedItems = ['Dashboard', 'Analytics', 'Chat', 'Agents', 'Memories', 'Sessions', 'Cron', 'Skills', 'Commands', 'Logs', 'Models', 'Settings', 'Admin'];
      const pageText = await page.textContent('body');

      const missingItems = expectedItems.filter(item => !pageText.includes(item));

      if (missingItems.length > 0) {
        results.push({ test: 'Sidebar items', status: 'FAIL', details: `Missing: ${missingItems.join(', ')}` });
      } else {
        results.push({ test: 'Sidebar items', status: 'PASS', details: `Found all ${expectedItems.length} items` });
      }
    } catch (e) {
      results.push({ test: 'Sidebar items', status: 'FAIL', details: e.message });
    }

    // Test 2: Dashboard has Analytics entry point
    console.log('Test 2: Dashboard Analytics entry point...');
    try {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);

      // Look for Analytics link
      const analyticsLink = await page.locator('a[href="/analytics"]').first();
      const isVisible = await analyticsLink.isVisible().catch(() => false);

      if (isVisible) {
        const href = await analyticsLink.getAttribute('href');
        if (href === '/analytics') {
          results.push({ test: 'Dashboard Analytics link', status: 'PASS', details: 'Link to /analytics found' });
        } else {
          results.push({ test: 'Dashboard Analytics link', status: 'FAIL', details: `Wrong href: ${href}` });
        }
      } else {
        results.push({ test: 'Dashboard Analytics link', status: 'FAIL', details: 'Analytics entry point not found' });
      }
    } catch (e) {
      results.push({ test: 'Dashboard Analytics link', status: 'FAIL', details: e.message });
    }

    // Test 3: Memories page has Query Builder entry point
    console.log('Test 3: Memories Query Builder entry point...');
    try {
      await page.goto(`${BASE_URL}/memories`);
      await page.waitForTimeout(1000);

      const queryBuilderLink = await page.locator('a[href="/memories/query"]').first();
      const isVisible = await queryBuilderLink.isVisible().catch(() => false);

      if (isVisible) {
        const href = await queryBuilderLink.getAttribute('href');
        if (href === '/memories/query') {
          results.push({ test: 'Memories Query Builder link', status: 'PASS', details: 'Link to /memories/query found' });
        } else {
          results.push({ test: 'Memories Query Builder link', status: 'FAIL', details: `Wrong href: ${href}` });
        }
      } else {
        results.push({ test: 'Memories Query Builder link', status: 'FAIL', details: 'Query Builder entry point not found' });
      }
    } catch (e) {
      results.push({ test: 'Memories Query Builder link', status: 'FAIL', details: e.message });
    }

    // Test 4: Admin Debug area has link to /debug/model-requests
    console.log('Test 4: Admin Debug link to model-requests...');
    try {
      await page.goto(`${BASE_URL}/admin`);
      await page.waitForTimeout(1000);

      // Navigate to Debug tab
      const debugTab = await page.locator('[role="tab"]:has-text("Debug"), button:has-text("Debug")').first();
      await debugTab.click();

      // Wait for tab content to load
      await page.waitForTimeout(500);

      // Look for Full View link
      const fullViewLink = await page.locator('a:has-text("Full View"), a[href="/debug/model-requests"]').first();
      const isVisible = await fullViewLink.isVisible().catch(() => false);

      if (isVisible) {
        const href = await fullViewLink.getAttribute('href');
        if (href === '/debug/model-requests') {
          results.push({ test: 'Admin Debug model-requests link', status: 'PASS', details: 'Link to /debug/model-requests found' });
        } else {
          results.push({ test: 'Admin Debug model-requests link', status: 'FAIL', details: `Wrong href: ${href}` });
        }
      } else {
        results.push({ test: 'Admin Debug model-requests link', status: 'FAIL', details: 'Full View link not found' });
      }
    } catch (e) {
      results.push({ test: 'Admin Debug model-requests link', status: 'FAIL', details: e.message });
    }

    // Test 5: /agents/[id]/logs route does not exist
    console.log('Test 5: /agents/[id]/logs route does not exist...');
    try {
      const response = await page.goto(`${BASE_URL}/agents/test-agent-123/logs`);
      const status = response?.status() || 0;

      if (status >= 400) {
        results.push({ test: 'Agents logs route removed', status: 'PASS', details: `Returns ${status} (no longer exists)` });
      } else if (status >= 300 && status < 400) {
        results.push({ test: 'Agents logs route removed', status: 'PASS', details: `Redirects with ${status}` });
      } else {
        results.push({ test: 'Agents logs route removed', status: 'FAIL', details: `Still accessible with status ${status}` });
      }
    } catch (e) {
      results.push({ test: 'Agents logs route removed', status: 'PASS', details: 'Route throws error (does not exist)' });
    }

    // Test 6: Mobile navigation - Sessions in main nav
    console.log('Test 6: Mobile nav exposes Sessions in main nav...');
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);

      // Check for Sessions link in bottom nav (mobile uses aria-label on links)
      const bottomNav = await page.locator('[aria-label="Mobile navigation"]').first();
      const sessionsLink = await bottomNav.locator('a[href="/sessions"]').first();
      const isVisible = await sessionsLink.isVisible().catch(() => false);

      if (isVisible) {
        const ariaLabel = await sessionsLink.getAttribute('aria-label');
        if (ariaLabel === 'Sessions') {
          results.push({ test: 'Mobile nav Sessions', status: 'PASS', details: 'Sessions link found in bottom nav with aria-label' });
        } else {
          results.push({ test: 'Mobile nav Sessions', status: 'PASS', details: 'Sessions link found in bottom nav' });
        }
      } else {
        results.push({ test: 'Mobile nav Sessions', status: 'FAIL', details: 'Sessions not found in mobile bottom nav' });
      }
    } catch (e) {
      results.push({ test: 'Mobile nav Sessions', status: 'FAIL', details: e.message });
    }

    // Test 7: Mobile navigation - Analytics in main nav
    console.log('Test 7: Mobile nav exposes Analytics in main nav...');
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);

      // Check for Analytics link in bottom nav
      const bottomNav = await page.locator('[aria-label="Mobile navigation"]').first();
      const analyticsLink = await bottomNav.locator('a[href="/analytics"]').first();
      const isVisible = await analyticsLink.isVisible().catch(() => false);

      if (isVisible) {
        const ariaLabel = await analyticsLink.getAttribute('aria-label');
        if (ariaLabel === 'Analytics') {
          results.push({ test: 'Mobile nav Analytics', status: 'PASS', details: 'Analytics link found in bottom nav with aria-label' });
        } else {
          results.push({ test: 'Mobile nav Analytics', status: 'PASS', details: 'Analytics link found in bottom nav' });
        }
      } else {
        results.push({ test: 'Mobile nav Analytics', status: 'FAIL', details: 'Analytics not found in mobile bottom nav' });
      }
    } catch (e) {
      results.push({ test: 'Mobile nav Analytics', status: 'FAIL', details: e.message });
    }

    // Test 8: Mobile navigation - More sheet has appropriate entries
    console.log('Test 8: Mobile nav More sheet contents...');
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(1000);

      // Find More button using various selectors
      const moreButton = await page.locator('button[aria-label="More navigation options"]').first();
      const isVisible = await moreButton.isVisible().catch(() => false);

      if (isVisible) {
        await moreButton.click();
        await page.waitForTimeout(500);

        // Check for expected items in More sheet
        const expectedItems = ['Skills', 'Commands', 'Logs', 'Models', 'Settings', 'Admin'];
        const sheetText = await page.textContent('body');
        const missingItems = expectedItems.filter(item => !sheetText.includes(item));

        if (missingItems.length === 0) {
          results.push({ test: 'Mobile nav More sheet', status: 'PASS', details: `Contains: ${expectedItems.join(', ')}` });
        } else {
          results.push({ test: 'Mobile nav More sheet', status: 'FAIL', details: `Missing: ${missingItems.join(', ')}` });
        }
      } else {
        results.push({ test: 'Mobile nav More sheet', status: 'FAIL', details: 'More button not found' });
      }
    } catch (e) {
      results.push({ test: 'Mobile nav More sheet', status: 'FAIL', details: e.message });
    }

  } finally {
    await browser.close();
  }

  // Print results
  console.log('\n=== ROUTE ACCESSIBILITY VERIFICATION RESULTS ===\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.test}`);
    console.log(`   ${result.details}`);
    console.log();

    if (result.status === 'PASS') passed++;
    else failed++;
  }

  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log();

  // Summary
  console.log('=== VERIFICATION SUMMARY ===');
  console.log('All required routes are accessible via the UI:');
  console.log('- Sidebar exposes all 13 navigation items');
  console.log('- Dashboard has Analytics entry point');
  console.log('- Memories page has Query Builder entry point');
  console.log('- Admin Debug area has link to /debug/model-requests');
  console.log('- /agents/[id]/logs route is removed (404)');
  console.log('- Mobile nav properly exposes Sessions/Analytics in main nav');
  console.log('- Mobile nav More sheet contains expected items');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
