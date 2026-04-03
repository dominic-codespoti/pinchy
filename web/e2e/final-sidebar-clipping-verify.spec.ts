import { test, expect } from '@playwright/test';

/**
 * Verify actual behavior with real session data (no DOM manipulation)
 */

test('Sidebar clipping - real data verification', async ({ page }) => {
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const analysis = await page.evaluate(() => {
    const sidebar = document.querySelector('.flex.h-full.flex-col');
    if (!sidebar) return { error: 'Sidebar not found' };

    const scrollArea = sidebar.querySelector('[data-radix-scroll-area-viewport]');
    const scrollAreaWidth = scrollArea ?
      (scrollArea as HTMLElement).getBoundingClientRect().width : null;
    const sidebarWidth = sidebar.getBoundingClientRect().width;
    const viewportWidth = scrollAreaWidth || sidebarWidth;

    // Find actual session items (with correct structure)
    const sessionButtons = Array.from(sidebar.querySelectorAll('button')).filter(btn => {
      return btn.querySelector('.min-w-0.flex-1, [class*="min-w-0"][class*="flex-1"]') !== null &&
             btn.querySelector('.truncate') !== null;
    });

    const results = [];

    for (const btn of sessionButtons) {
      const titleEl = btn.querySelector('.truncate') as HTMLElement;
      if (!titleEl) continue;

      const btnRect = btn.getBoundingClientRect();
      const titleRect = titleEl.getBoundingClientRect();

      // Check for visual overflow
      const children = Array.from(btn.querySelectorAll('*'));
      const overflowing = children.filter(child => {
        const r = (child as HTMLElement).getBoundingClientRect();
        return r.right > btnRect.right + 2 || r.left < btnRect.left - 2;
      });

      // Check if button exceeds viewport
      const exceedsViewport = btnRect.width > viewportWidth + 2;

      results.push({
        title: titleEl.textContent?.substring(0, 50) || 'untitled',
        buttonWidth: Math.round(btnRect.width),
        titleWidth: Math.round(titleRect.width),
        titleScrollWidth: titleEl.scrollWidth,
        titleClientWidth: titleEl.clientWidth,
        isTruncated: titleEl.scrollWidth > titleEl.clientWidth,
        exceedsViewport,
        hasOverflow: overflowing.length > 0,
        overflowCount: overflowing.length,
      });
    }

    return {
      sidebarWidth: Math.round(sidebarWidth),
      scrollAreaWidth: scrollAreaWidth ? Math.round(scrollAreaWidth) : null,
      viewportWidth: Math.round(viewportWidth),
      sessionCount: sessionButtons.length,
      results,
    };
  });

  if ('error' in analysis) {
    throw new Error(analysis.error);
  }

  console.log('=== REAL DATA VERIFICATION ===');
  console.log(`Sidebar width: ${analysis.sidebarWidth}px`);
  console.log(`ScrollArea width: ${analysis.scrollAreaWidth}px`);
  console.log(`Viewport width: ${analysis.viewportWidth}px`);
  console.log(`Sessions found: ${analysis.sessionCount}`);

  let allPass = true;
  const measurements: any[] = [];

  for (let i = 0; i < analysis.results.length; i++) {
    const r = analysis.results[i];
    console.log(`\nSession ${i + 1}: "${r.title}"`);
    console.log(`  Button: ${r.buttonWidth}px (viewport: ${analysis.viewportWidth}px)`);
    console.log(`  Title: ${r.titleWidth}px, scroll: ${r.titleScrollWidth}, client: ${r.titleClientWidth}`);
    console.log(`  Truncated: ${r.isTruncated}`);
    console.log(`  Exceeds viewport: ${r.exceedsViewport}`);
    console.log(`  Has overflow: ${r.hasOverflow} (${r.overflowCount} elements)`);

    // Real sessions should:
    // 1. Not exceed viewport
    // 2. Not have visual overflow
    const checkViewport = !r.exceedsViewport;
    const checkOverflow = !r.hasOverflow;

    console.log(`  Check - Within viewport: ${checkViewport ? 'PASS' : 'FAIL'}`);
    console.log(`  Check - No overflow: ${checkOverflow ? 'PASS' : 'FAIL'}`);

    measurements.push({
      title: r.title,
      buttonWidth: r.buttonWidth,
      isTruncated: r.isTruncated,
      exceedsViewport: r.exceedsViewport,
      hasOverflow: r.hasOverflow,
    });

    if (!checkViewport || !checkOverflow) {
      allPass = false;
    }
  }

  // Summary
  const anyExceedsViewport = analysis.results.some(r => r.exceedsViewport);
  const anyHasOverflow = analysis.results.some(r => r.hasOverflow);

  console.log('\n=== SUMMARY ===');
  console.log(`Any exceeds viewport: ${anyExceedsViewport ? 'YES (FAIL)' : 'NO (PASS)'}`);
  console.log(`Any has overflow: ${anyHasOverflow ? 'YES (FAIL)' : 'NO (PASS)'}`);

  const result = {
    status: (!anyExceedsViewport && !anyHasOverflow) ? 'PASS' : 'FAIL',
    sidebarWidth: analysis.sidebarWidth,
    viewportWidth: analysis.viewportWidth,
    sessionCount: analysis.sessionCount,
    anyExceedsViewport,
    anyHasOverflow,
    measurements,
  };

  console.log('\n=== FINAL RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  expect(result.status).toBe('PASS');
});
