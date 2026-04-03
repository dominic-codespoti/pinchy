import { test, expect } from '@playwright/test';

/**
 * Targeted verification: Recent Sessions sidebar title clipping fix
 * Verifies DOM structure, computed styles, and text truncation behavior
 * in the ChatSidebar component (desktop sidebar with Recent Sessions)
 */

const LONG_TITLE = 'This is an extremely long session title that would definitely overflow the sidebar container without proper truncation handling and would look terrible if it clipped awkwardly';

test.beforeEach(async ({ page }) => {
  // Mock agents API
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        agents: [
          {
            id: 'default',
            name: 'Default Agent',
            description: 'Test agent',
          },
        ],
      }),
    });
  });

  // Mock agent sessions API (used by chat sidebar)
  await page.route('**/api/agents/*/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [
          {
            id: 'session-1',
            title: LONG_TITLE,
            messageCount: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'session-2',
            title: 'Short',
            messageCount: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Navigate to chat page where sidebar is visible
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');

  // Wait for sessions to load
  await page.waitForSelector('.truncate', { timeout: 10000 });
});

test('1. PASS: title element has truncation CSS properties', async ({ page }) => {
  const titleElement = page.locator('.truncate').first();
  await expect(titleElement).toBeVisible();

  const styles = await titleElement.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      overflow: computed.overflow,
      textOverflow: computed.textOverflow,
      whiteSpace: computed.whiteSpace,
    };
  });

  // PASS/FAIL check
  expect(styles.textOverflow).toBe('ellipsis');
  expect(styles.whiteSpace).toBe('nowrap');
  expect(styles.overflow).toBe('hidden');
  console.log('✓ Truncation CSS: ellipsis + nowrap + hidden');
});

test('2. PASS: parent container allows proper truncation via min-w-0', async ({ page }) => {
  // Find the button containing the truncate element
  const sessionButton = page.locator('button').filter({ has: page.locator('.truncate') }).first();
  await expect(sessionButton).toBeVisible();

  // Check that the flex container inside the button has proper truncation setup
  const flexContainerCheck = await sessionButton.evaluate((btn) => {
    // The structure should be: button > div.flex-1.min-w-0 > ... > p.truncate
    const flexContainer = btn.querySelector('.flex-1.min-w-0');
    if (!flexContainer) return { found: false };

    const computed = window.getComputedStyle(flexContainer);
    return {
      found: true,
      minWidth: computed.minWidth,
      flex: computed.flex,
    };
  });

  // PASS/FAIL: min-w-0 should be '0px'
  expect(flexContainerCheck.found).toBe(true);
  expect(flexContainerCheck.minWidth).toBe('0px');
  console.log('✓ Flex container has min-w-0 for proper truncation');
});

test('3. PASS: tooltip structure exists for truncated titles', async ({ page }) => {
  // Check that tooltip infrastructure is present
  const tooltipCheck = await page.evaluate(() => {
    const truncateEl = document.querySelector('.truncate');
    if (!truncateEl) return { foundTruncate: false };

    // Walk up DOM to find tooltip-related wrappers
    let parent = truncateEl.parentElement;
    let depth = 0;
    const parents = [];

    while (parent && depth < 10) {
      parents.push({
        tag: parent.tagName,
        class: parent.className?.substring(0, 50),
        dataAttributes: Array.from(parent.attributes || [])
          .filter(a => a.name.startsWith('data-'))
          .map(a => a.name),
      });
      parent = parent.parentElement;
      depth++;
    }

    return {
      foundTruncate: true,
      truncateText: truncateEl.textContent?.substring(0, 50),
      parents,
      hasTooltipAncestor: parents.some(p =>
        p.dataAttributes.some(a => a.includes('tooltip') || a.includes('radix'))
      ),
    };
  });

  console.log('Tooltip structure check:', JSON.stringify(tooltipCheck, null, 2));

  // PASS/FAIL: Tooltip ancestor should exist
  expect(tooltipCheck.foundTruncate).toBe(true);
  expect(tooltipCheck.hasTooltipAncestor).toBe(true);
  console.log('✓ Tooltip structure exists with Radix UI attributes');
});

test('4. PASS: long titles are truncated (scrollWidth > clientWidth)', async ({ page }) => {
  const titleElement = page.locator('.truncate').first();

  const dimensions = await titleElement.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    textContent: el.textContent,
  }));

  console.log('Title dimensions:', dimensions);

  // PASS/FAIL: For long titles, scrollWidth should be greater than clientWidth
  // indicating that truncation is needed and the CSS is working
  expect(dimensions.textContent).toBeTruthy();
  expect(dimensions.textContent!.length).toBeGreaterThan(10);

  // Verify truncation is actually needed (long text)
  if (dimensions.textContent && dimensions.textContent.length > 50) {
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
    console.log(`✓ Long title truncated: scrollWidth(${dimensions.scrollWidth}) > clientWidth(${dimensions.clientWidth})`);
  }
});

test('5. PASS: no visual overflow in session item button', async ({ page }) => {
  const sessionButton = page.locator('button').filter({ has: page.locator('.truncate') }).first();
  await expect(sessionButton).toBeVisible();

  const overflowCheck = await sessionButton.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const children = Array.from(el.querySelectorAll('*'));

    // Check for elements overflowing the button
    const overflowing = children.filter(child => {
      const childRect = child.getBoundingClientRect();
      return childRect.right > rect.right + 1 || childRect.left < rect.left - 1;
    });

    return {
      buttonWidth: rect.width,
      overflowingCount: overflowing.length,
      hasVisualOverflow: overflowing.length > 0,
    };
  });

  // PASS/FAIL: No visual overflow
  expect(overflowCheck.hasVisualOverflow).toBe(false);
  expect(overflowCheck.overflowingCount).toBe(0);
  console.log('✓ No visual overflow from child elements');
});
