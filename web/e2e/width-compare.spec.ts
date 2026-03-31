import { test } from '@playwright/test';

test.describe('Page Width Comparison', () => {
  const pages = [
    { name: 'agents-list', url: '/agents' },
    { name: 'agent-detail', url: '/agents/default' },
    { name: 'settings', url: '/settings/appearance' },
    { name: 'models', url: '/models' },
    { name: 'skills', url: '/skills' },
    { name: 'memories', url: '/memories' },
  ];

  for (const p of pages) {
    test(`screenshot ${p.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(p.url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `e2e/screenshots/width-${p.name}.png`, fullPage: false });
    });
  }
});
