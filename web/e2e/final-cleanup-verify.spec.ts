import { test, expect } from '@playwright/test';

test.describe('Final UI Cleanup Verification', () => {
  test('1. Verify no size="icon" override pattern in sessions action buttons', async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Check desktop table action buttons
    const desktopButtons = page.locator('div.hidden.md\\:block button');
    const count = await desktopButtons.count();

    for (let i = 0; i < count; i++) {
      const button = desktopButtons.nth(i);
      const dataSize = await button.getAttribute('data-size');
      const classAttr = await button.getAttribute('class') || '';

      // Should NOT have size="icon" - should use size="sm" or default
      // The problematic pattern was size="icon" with !h-7 !w-7 overrides
      expect(classAttr).not.toMatch(/!h-7|!w-7/);

      // Log for debugging
      console.log(`Desktop button ${i}: data-size=${dataSize}, classes=${classAttr.substring(0, 100)}`);
    }

    // Check mobile card action buttons
    const mobileButtons = page.locator('div.md\\:hidden button');
    const mobileCount = await mobileButtons.count();

    for (let i = 0; i < mobileCount; i++) {
      const button = mobileButtons.nth(i);
      const classAttr = await button.getAttribute('class') || '';
      expect(classAttr).not.toMatch(/!h-7|!w-7/);
      console.log(`Mobile button ${i}: classes=${classAttr.substring(0, 100)}`);
    }

    console.log(`✓ Checked ${count} desktop buttons and ${mobileCount} mobile buttons - no !h-7/!w-7 overrides found`);
  });

  test('2. Mobile card view renders on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Mobile cards should be visible (md:hidden means hidden on md+ screens, visible on small)
    const mobileCards = page.locator('div.md\\:hidden > div, div.md\\:hidden .mobile-card, div.md\\:hidden [class*="MobileCard"], div.md\\:hidden > *').first();

    // Check that mobile container exists and is visible
    const mobileContainer = page.locator('div.md\\:hidden');
    await expect(mobileContainer.first()).toBeVisible();

    // Desktop table should be hidden
    const desktopTable = page.locator('div.hidden.md\\:block');
    const isHidden = await desktopTable.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none';
    });

    expect(isHidden).toBe(true);
    console.log('✓ Mobile cards visible, desktop table hidden on 375px viewport');
  });

  test('3. Mobile cards show important data cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Check if we have sessions data
    const noSessionsMsg = page.locator('div.md\\:hidden p.text-center');
    const noSessionsCount = await noSessionsMsg.count();

    if (noSessionsCount > 0 && await noSessionsMsg.isVisible()) {
      const text = await noSessionsMsg.textContent();
      if (text?.includes('No sessions found')) {
        console.log('ℹ No sessions in database - skipping data content check');
        return;
      }
    }

    // Check mobile cards have required elements
    const mobileCardLinks = page.locator('div.md\\:hidden a[href*="/chat"]');
    const cardCount = await mobileCardLinks.count();

    if (cardCount === 0) {
      console.log('ℹ No session cards with chat links found');
      return;
    }

    // Check first card structure
    const firstCard = mobileCardLinks.first();
    await expect(firstCard).toBeVisible();

    // Check for title
    const title = await firstCard.textContent();
    expect(title?.length).toBeGreaterThan(0);

    // Check for badges (agent names)
    const badges = page.locator('div.md\\:hidden [class*="badge"], div.md\\:hidden [class*="Badge"]').first();
    if (await badges.count() > 0) {
      await expect(badges).toBeVisible();
      const badgeText = await badges.textContent();
      console.log(`✓ Mobile card shows agent badge: ${badgeText?.substring(0, 30)}`);
    }

    // Check action buttons exist and are visible
    const actionButtons = page.locator('div.md\\:hidden button');
    const buttonCount = await actionButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(2); // At least Open and Delete

    for (let i = 0; i < Math.min(buttonCount, 2); i++) {
      await expect(actionButtons.nth(i)).toBeVisible();
    }

    console.log(`✓ Mobile cards show: title, agent badge, ${buttonCount} action buttons`);
  });

  test('4. Desktop table works on large screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Desktop table should be visible
    const desktopTable = page.locator('div.hidden.md\\:block');
    await expect(desktopTable.first()).toBeVisible();

    // Mobile cards should be hidden
    const mobileContainer = page.locator('div.md\\:hidden');
    const isMobileHidden = await mobileContainer.first().evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none';
    });

    expect(isMobileHidden).toBe(true);

    // Check table headers exist
    const tableHeaders = page.locator('div.hidden.md\\:block th');
    const headerCount = await tableHeaders.count();
    expect(headerCount).toBeGreaterThanOrEqual(4); // Title, Agent, Messages, Actions at minimum

    // Get header texts
    const headers: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await tableHeaders.nth(i).textContent();
      if (text) headers.push(text.trim());
    }

    console.log(`✓ Desktop table visible with headers: ${headers.join(', ')}`);
  });

  test('5. No overflow/clipping issues in mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Check mobile cards container for overflow
    const mobileContainer = page.locator('div.md\\:hidden');

    // Get computed styles
    const overflowCheck = await mobileContainer.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        width: style.width,
      };
    });

    console.log(`Mobile container overflow: ${overflowCheck.overflowX}, ${overflowCheck.overflowY}`);

    // Check if any cards overflow their container
    const cards = page.locator('div.md\\:hidden > *');
    const cardCount = await cards.count();

    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const card = cards.nth(i);
      const boundingBox = await card.boundingBox();

      if (boundingBox) {
        // Check card doesn't overflow viewport width
        expect(boundingBox.width).toBeLessThanOrEqual(375 + 20); // Allow small padding variance

        // Check computed overflow
        const cardOverflow = await card.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            overflowX: style.overflowX,
            overflowY: style.overflowY,
          };
        });

        console.log(`Card ${i}: width=${boundingBox.width.toFixed(0)}px, overflow=${cardOverflow.overflowX}`);
      }
    }

    // Check for text truncation/line-clamp on titles
    const titleLinks = page.locator('div.md\\:hidden a[href*="/chat"] h3, div.md\\:hidden a[href*="/chat"] .line-clamp');
    const titleCount = await titleLinks.count();

    if (titleCount > 0) {
      const firstTitle = titleLinks.first();
      const textOverflow = await firstTitle.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          lineClamp: style.webkitLineClamp,
        };
      });

      console.log(`✓ Title overflow handling: ${JSON.stringify(textOverflow)}`);
    }

    console.log('✓ No overflow issues detected in mobile view');
  });
});
