import { test, expect } from '@playwright/test';

/**
 * Targeted Settings Cleanup Verification
 * Verifies: redirect, navigation links, subpages work, no redundant UI
 */

const BASE_URL = 'http://localhost:3000';

// 1. Verify /settings redirects to /settings/appearance
test('/settings redirects to /settings/appearance', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForLoadState('networkidle');

  const finalUrl = page.url();
  const pathname = new URL(finalUrl).pathname;

  expect(pathname).toBe('/settings/appearance');
});

// 2. Verify Settings index page has proper content via appearance page
test('Settings landing at /settings/appearance has proper content', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings/appearance`);
  await page.waitForLoadState('networkidle');

  // Verify the appearance page has proper content
  const heading = page.locator('h1').first();
  await expect(heading).toHaveText('Settings');

  // Verify subtitle is present
  const subtitle = page.locator('p').filter({ hasText: /application preferences/i });
  await expect(subtitle).toBeVisible();
});

// 3. All settings subpages are accessible
test('settings tabs/subpages are accessible', async ({ page }) => {
  // Use desktop viewport so button text is visible
  await page.setViewportSize({ width: 1280, height: 720 });

  const subpages = [
    { path: '/settings/appearance', label: 'Appearance' },
    { path: '/settings/notifications', label: 'Notifications' },
    { path: '/settings/security', label: 'Security' },
    { path: '/settings/advanced', label: 'Advanced' },
    { path: '/settings/mcp', label: 'MCP Servers' },
    { path: '/settings/maintenance', label: 'Maintenance' },
    { path: '/settings/webhooks', label: 'Webhooks' },
  ];

  for (const { path, label } of subpages) {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads without error
    const heading = page.locator('h1').first();
    await expect(heading).toHaveText('Settings');

    // Verify the tab button for this section is present (by aria-label which is always visible)
    const tabButton = page.locator('nav a[aria-label="' + label + '"], nav button[title="' + label + '"]').first();
    await expect(tabButton).toBeVisible();
  }
});

// 4. Sidebar Settings link points to /settings/appearance
test('sidebar Settings link points to /settings/appearance', async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  // Check desktop sidebar - find Settings link by href
  const settingsLink = page.locator('a[href="/settings/appearance"]');

  // Verify the link is visible and has correct text
  await expect(settingsLink).toBeVisible();
  const linkText = await settingsLink.textContent();
  expect(linkText).toContain('Settings');

  // Verify the href attribute
  const href = await settingsLink.getAttribute('href');
  expect(href).toBe('/settings/appearance');
});

// 5. Mobile nav Settings link points to /settings/appearance
test('mobile nav Settings link points to /settings/appearance', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  // Open mobile menu (hamburger button)
  const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i]').first();
  const isVisible = await menuButton.isVisible().catch(() => false);

  if (isVisible) {
    await menuButton.click();
    await page.waitForTimeout(300);

    // Check for Settings link in mobile nav
    const settingsLink = page.locator('a[href="/settings/appearance"]');

    // The link should exist in the mobile nav
    const count = await settingsLink.count();
    expect(count).toBeGreaterThan(0);

    // Verify href
    const href = await settingsLink.first().getAttribute('href');
    expect(href).toBe('/settings/appearance');
  }
});

// 6. No redundant /settings/index landing page content exists
test('no redundant /settings/index landing page content exists', async ({ page }) => {
  // Navigate directly to appearance page - this should be the landing
  await page.goto(`${BASE_URL}/settings/appearance`);
  await page.waitForLoadState('networkidle');

  // There should be exactly one "Settings" h1 heading (not duplicates)
  const settingsHeadings = page.locator('h1').filter({ hasText: 'Settings' });
  const count = await settingsHeadings.count();
  expect(count).toBe(1);

  // Should not see duplicate navigation or redundant landing cards
  const redundantPatterns = [
    'Settings Overview',
    'Select a setting',
    'Choose a category',
  ];

  for (const pattern of redundantPatterns) {
    const element = page.locator('text=' + pattern);
    const exists = await element.count() > 0;
    if (exists) {
      throw new Error(`Redundant landing content found: "${pattern}"`);
    }
  }
});
