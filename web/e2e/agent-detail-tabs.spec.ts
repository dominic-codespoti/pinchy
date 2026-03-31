import { test } from '@playwright/test';

test('screenshot agent detail tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  await page.goto('/agents/default');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/screenshots/detail-overview.png', fullPage: true });
  
  // Files tab
  const filesTab = page.locator('[role="tab"]').filter({ hasText: /files/i });
  if (await filesTab.isVisible()) {
    await filesTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/detail-files.png', fullPage: true });
  }
  
  // Memory tab
  const memTab = page.locator('[role="tab"]').filter({ hasText: /memory/i });
  if (await memTab.isVisible()) {
    await memTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/detail-memory.png', fullPage: true });
  }
  
  // Sessions tab
  const sessTab = page.locator('[role="tab"]').filter({ hasText: /sessions/i });
  if (await sessTab.isVisible()) {
    await sessTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/detail-sessions.png', fullPage: true });
  }
});
