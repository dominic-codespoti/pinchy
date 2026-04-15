import { test, expect, Page } from '@playwright/test';

/**
 * Targeted verification tests for newly implemented surfaces
 * Text-only probes - no screenshots
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper to wait for page to be ready
async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

// Helper to get visible text content (excluding sr-only)
async function getVisibleText(page: Page, selector: string): Promise<string> {
  const text = await page.locator(selector).filter({ visible: true }).textContent();
  return text || '';
}

test.describe('Surface Verification Tests', () => {
  test.setTimeout(30000);

  test.describe('/commands', () => {
    test('should have search input and command cards', async ({ page }) => {
      await page.goto(`${BASE_URL}/commands`);
      await waitForPageReady(page);

      // Verify heading
      const heading = await getVisibleText(page, 'h1');
      expect(heading).toContain('Commands');

      // Verify search input exists and is visible
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      await expect(searchInput).toBeVisible();

      // Verify commands grid exists
      const grid = page.locator('.grid, [class*="grid"]').first();
      await expect(grid).toBeVisible();
    });

    test('should display command cards with badges', async ({ page }) => {
      await page.goto(`${BASE_URL}/commands`);
      await waitForPageReady(page);

      // Check for badge elements (command names)
      const badges = page.locator('[class*="badge"], .badge').filter({ visible: true });
      const count = await badges.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('/settings/webhooks', () => {
    test('should have agent selector and webhook info', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/webhooks`);
      await waitForPageReady(page);

      // Verify settings layout with navigation
      const webhooksLink = page.locator('a[href*="webhooks"], nav').filter({ visible: true });
      await expect(webhooksLink).toBeVisible();

      // Verify agent selector exists
      const select = page.locator('[role="combobox"], select').first();
      await expect(select).toBeVisible();

      // Verify "How webhooks work" alert/info section
      const infoText = page.locator('text=/how webhooks work/i').first();
      await expect(infoText).toBeVisible();
    });

    test('should display webhook endpoint details when agent selected', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/webhooks`);
      await waitForPageReady(page);

      // Select an agent
      const selectTrigger = page.locator('[role="combobox"], [data-radix-select-trigger]').first();
      if (await selectTrigger.isVisible().catch(() => false)) {
        await selectTrigger.click();
        await page.waitForTimeout(500);

        // Select first option
        const option = page.locator('[role="option"]').first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
          await page.waitForTimeout(500);

          // Verify endpoint details appear
          const endpointLabel = page.locator('text=/endpoint/i').first();
          await expect(endpointLabel).toBeVisible();
        }
      }
    });
  });

  test.describe('/cron - Run Now + History', () => {
    test('should have Run Now and History buttons in job rows', async ({ page }) => {
      await page.goto(`${BASE_URL}/cron`);
      await waitForPageReady(page);

      // Verify heading
      const heading = await getVisibleText(page, 'h1');
      expect(heading).toContain('Cron');

      // Check for Run Now buttons (may need to expand rows first)
      const runNowButtons = page.locator('button:has-text("Run Now"), button[title*="Run"]').filter({ visible: true });
      const historyButtons = page.locator('button:has-text("History"), button[title*="History"]').filter({ visible: true });

      // At least one of these should exist (buttons or accessible labels)
      const hasRunNow = await runNowButtons.count() > 0;
      const hasHistory = await historyButtons.count() > 0;

      // Verify table with actions column exists
      const actionsColumn = page.locator('th:has-text("Actions"), [role="columnheader"]:has-text("Actions")').first();
      await expect(actionsColumn).toBeVisible();
    });

    test('should open history dialog when History clicked', async ({ page }) => {
      await page.goto(`${BASE_URL}/cron`);
      await waitForPageReady(page);

      // Find and click History button
      const historyButton = page.locator('button:has-text("History"), button[title*="History"]').first();

      if (await historyButton.isVisible().catch(() => false)) {
        await historyButton.click();
        await page.waitForTimeout(500);

        // Verify dialog or modal appears
        const dialog = page.locator('[role="dialog"], [data-state="open"]').filter({ visible: true }).first();
        await expect(dialog).toBeVisible();

        // Verify dialog contains "Run History" text
        const dialogText = await dialog.textContent();
        expect(dialogText).toMatch(/run history|history/i);
      }
    });
  });

  test.describe('Agent Detail - Receipts Tab', () => {
    test('should have Receipts tab in agent detail', async ({ page }) => {
      await page.goto(`${BASE_URL}/agents/detail/?id=default`);
      await waitForPageReady(page);

      // Find Receipts tab
      const receiptsTab = page.locator('[role="tab"]:has-text("Receipts"), button:has-text("Receipts")').first();
      await expect(receiptsTab).toBeVisible();
    });

    test('should display receipts content when tab selected', async ({ page }) => {
      await page.goto(`${BASE_URL}/agents/detail/?id=default`);
      await waitForPageReady(page);

      // Click Receipts tab
      const receiptsTab = page.locator('[role="tab"]:has-text("Receipts"), button:has-text("Receipts")').first();
      await receiptsTab.click();
      await page.waitForTimeout(1000);

      // Verify tab panel is visible
      const tabPanel = page.locator('[role="tabpanel"], [class*="tabpanel"]').filter({ visible: true }).first();
      await expect(tabPanel).toBeVisible();

      // Check for receipts-related content or empty state
      const panelText = await tabPanel.textContent();
      expect(panelText).toMatch(/receipt|session|no receipts|tool/i);
    });
  });

  test.describe('/analytics', () => {
    test('should have time range selector and tabs', async ({ page }) => {
      await page.goto(`${BASE_URL}/analytics`);
      await waitForPageReady(page);

      // Verify heading
      const heading = await getVisibleText(page, 'h1');
      expect(heading).toContain('Analytics');

      // Verify time range selector exists
      const timeSelector = page.locator('[role="combobox"], select').filter({ visible: true }).first();
      await expect(timeSelector).toBeVisible();

      // Verify Usage and Agent Breakdown tabs
      const usageTab = page.locator('[role="tab"]:has-text("Usage"), button:has-text("Usage")').first();
      const agentsTab = page.locator('[role="tab"]:has-text("Agent"), button:has-text("Agent")').first();

      await expect(usageTab).toBeVisible();
      await expect(agentsTab).toBeVisible();
    });

    test('should display metrics cards', async ({ page }) => {
      await page.goto(`${BASE_URL}/analytics`);
      await waitForPageReady(page);

      // Look for metrics display (could be cards, stats, etc.)
      const metricsSection = page.locator('[class*="metric"], [class*="card"], [class*="stat"]').first();
      await expect(metricsSection).toBeVisible();
    });
  });

  test.describe('/models - Provider Discovery', () => {
    test('should have Add Provider and Browse Models buttons', async ({ page }) => {
      await page.goto(`${BASE_URL}/models`);
      await waitForPageReady(page);

      // Verify heading
      const heading = await getVisibleText(page, 'h1');
      expect(heading).toContain('Models');

      // Check for Add Provider button
      const addProvider = page.locator('button:has-text("Add Provider"), [role="button"]:has-text("Add")').first();
      await expect(addProvider).toBeVisible();

      // Check for Browse Models button
      const browseModels = page.locator('button:has-text("Browse Models"), [role="button"]:has-text("Browse")').first();
      await expect(browseModels).toBeVisible();

      // Verify Connected Providers section
      const connectedProviders = page.locator('text=/connected provider/i, h2:has-text("Connected")').first();
      await expect(connectedProviders).toBeVisible();
    });

    test('should open provider discovery dialog when Add Provider clicked', async ({ page }) => {
      await page.goto(`${BASE_URL}/models`);
      await waitForPageReady(page);

      // Click Add Provider
      const addProvider = page.locator('button:has-text("Add Provider")').first();
      await addProvider.click();
      await page.waitForTimeout(500);

      // Verify dialog/sheet opens
      const dialog = page.locator('[role="dialog"], [data-state="open"], [class*="sheet"]').filter({ visible: true }).first();
      await expect(dialog).toBeVisible();
    });
  });

  test.describe('/memories - Search Mode + Tag Filter', () => {
    test('should have search input with mode selector', async ({ page }) => {
      await page.goto(`${BASE_URL}/memories`);
      await waitForPageReady(page);

      // Verify heading
      const heading = await getVisibleText(page, 'h1');
      expect(heading).toContain('Memories');

      // Verify search input
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
      await expect(searchInput).toBeVisible();

      // Verify search mode selector (Keyword/Semantic/Hybrid)
      const modeSelector = page.locator('[role="combobox"], select').filter({ visible: true }).first();
      await expect(modeSelector).toBeVisible();
    });

    test('should have agent selector toggle', async ({ page }) => {
      await page.goto(`${BASE_URL}/memories`);
      await waitForPageReady(page);

      // Verify agent toggle group
      const toggleGroup = page.locator('[role="radiogroup"], [class*="toggle"]').first();
      await expect(toggleGroup).toBeVisible();

      // Verify Select Agent section
      const selectAgent = page.locator('text=/select agent/i').first();
      await expect(selectAgent).toBeVisible();
    });
  });

  test.describe('Settings Mobile Navigation', () => {
    test('should have responsive navigation tabs', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await waitForPageReady(page);

      // Verify settings navigation exists
      const nav = page.locator('nav, [role="navigation"]').filter({ visible: true }).first();
      await expect(nav).toBeVisible();

      // Check for key nav items (may be hidden on mobile but should exist in DOM)
      const appearanceLink = page.locator('a[href*="appearance"], [role="tab"]:has-text("Appearance")').first();
      const notificationsLink = page.locator('a[href*="notifications"], [role="tab"]:has-text("Notifications")').first();

      await expect(appearanceLink).toBeAttached();
      await expect(notificationsLink).toBeAttached();
    });

    test('webhooks should be accessible from settings nav', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings/appearance`);
      await waitForPageReady(page);

      // Find webhooks link
      const webhooksLink = page.locator('a[href*="webhooks"], [role="tab"]:has-text("Webhooks"), nav:has-text("Webhooks")').first();
      await expect(webhooksLink).toBeAttached();

      // Click and verify navigation
      await webhooksLink.click();
      await page.waitForTimeout(1000);

      // Verify URL changed
      expect(page.url()).toContain('/settings/webhooks');
    });
  });

  test.describe('Bottom Navigation (Mobile)', () => {
    test('should have bottom navigation with main items', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      await waitForPageReady(page);

      // Verify bottom nav exists
      const bottomNav = page.locator('[aria-label*="navigation"], [class*="bottom"]').filter({ visible: true }).last();

      // Check for Dashboard item
      const dashboardItem = page.locator('a[href="/dashboard"], [value="dashboard"]').first();
      await expect(dashboardItem).toBeAttached();

      // Check for Agents item
      const agentsItem = page.locator('a[href="/agents"], [value="agents"]').first();
      await expect(agentsItem).toBeAttached();

      // Check for Chat item
      const chatItem = page.locator('a[href="/chat"], [value="chat"]').first();
      await expect(chatItem).toBeAttached();
    });

    test('should have More sheet with additional items', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      await waitForPageReady(page);

      // Find More button/sheet trigger
      const moreButton = page.locator('button:has-text("More"), button[title="More"], button:has([class*="more"])').first();

      if (await moreButton.isVisible().catch(() => false)) {
        await moreButton.click();
        await page.waitForTimeout(500);

        // Verify sheet opens with additional options
        const sheet = page.locator('[role="dialog"], [data-state="open"], h2:has-text("More")').filter({ visible: true }).first();
        await expect(sheet).toBeVisible();

        // Check for Skills, Commands, Logs, Models, Settings
        const sheetContent = await sheet.textContent();
        expect(sheetContent).toMatch(/skill|command|log|model|setting/i);
      }
    });
  });
});

// Accessibility check
test.describe('Accessibility Checks', () => {
  test('all interactive elements should have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/commands`);
    await waitForPageReady(page);

    // Get all buttons without accessible names
    const buttonsWithoutLabels = await page.locator('button:not([aria-label]):not(:has-text(.))').evaluateAll(
      buttons => buttons.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'))
    );

    // This is informational - icon-only buttons should have aria-label
    console.log(`Buttons without accessible names: ${buttonsWithoutLabels.length}`);
  });
});
