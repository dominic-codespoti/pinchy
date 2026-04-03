const { chromium } = require('playwright');

async function inspectRecentSessions() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Navigate to /chat via the backend proxy
  await page.goto('http://localhost:3131/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('=== RECENT SESSIONS INSPECTION (Backend Port) ===\n');

  // Look for "Recent Sessions" heading first
  const recentHeading = await page.getByText('Recent Sessions').first();
  if (await recentHeading.isVisible().catch(() => false)) {
    console.log('Found "Recent Sessions" heading');

    // Get all clickable elements in the sidebar that look like session items
    const allButtons = await page.locator('aside button, aside a, [class*="sidebar"] button, [class*="sidebar"] a').all();
    console.log(`Total buttons/links in sidebar: ${allButtons.length}`);

    // Find elements that have the session-item pattern (look for specific classes)
    const sessionItems = await page.locator('[class*="session"], [data-session-id], a[href^="/chat"]').all();
    console.log(`Found ${sessionItems.length} session-like items`);

    // Check the specific Recent Sessions section
    const section = await recentHeading.locator('..').locator('..');
    const sectionBox = await section.boundingBox();
    console.log(`\nRECENT SESSIONS SECTION:`);
    console.log(`  width: ${sectionBox?.width}px, height: ${sectionBox?.height}px`);

    // Look for the actual list container
    const listContainer = await page.locator('[class*="rounded-lg"]').filter({ has: page.locator('a, button') }).first();
    const listBox = await listContainer.boundingBox();
    console.log(`\nLIST CONTAINER (rounded-lg):`);
    console.log(`  width: ${listBox?.width}px`);
    console.log(`  x: ${listBox?.x}, y: ${listBox?.y}`);

    // Get the first actual session row
    const firstSessionRow = await page.locator('aside a, [class*="sidebar"] a').filter({ hasText: /.+/ }).first();
    const isVisible = await firstSessionRow.isVisible().catch(() => false);

    if (isVisible) {
      const rowBox = await firstSessionRow.boundingBox();
      console.log(`\nFIRST SESSION ROW (link):`);
      console.log(`  width: ${rowBox?.width}px, height: ${rowBox?.height}px`);
      console.log(`  x: ${rowBox?.x}, y: ${rowBox?.y}`);

      // Hover state
      await firstSessionRow.hover();
      await page.waitForTimeout(600);

      const hoverBox = await firstSessionRow.boundingBox();
      console.log(`\nAFTER HOVER:`);
      console.log(`  width: ${hoverBox?.width}px, height: ${hoverBox?.height}px`);

      // Check computed styles - specifically looking for ring/outline
      const detailedStyles = await firstSessionRow.evaluate(el => {
        const cs = window.getComputedStyle(el);
        return {
          // Critical hover effect properties
          ringWidth: cs.getPropertyValue('--tw-ring-width') || 'none',
          ringColor: cs.getPropertyValue('--tw-ring-color') || 'none',
          ringOffsetWidth: cs.getPropertyValue('--tw-ring-offset-width') || '0',
          ringInset: cs.getPropertyValue('--tw-ring-inset') || 'none',
          // Box properties
          width: cs.width,
          height: cs.height,
          padding: cs.padding,
          // Visual effects
          boxShadow: cs.boxShadow,
          outline: cs.outline,
          outlineOffset: cs.outlineOffset,
          outlineWidth: cs.outlineWidth,
          border: cs.border,
          borderWidth: cs.borderWidth,
          // Positioning
          position: cs.position,
          transform: cs.transform,
          margin: cs.margin,
          // Overflow context
          overflow: cs.overflow,
        };
      });

      console.log('\nDETAILED HOVER STYLES:');
      console.log(JSON.stringify(detailedStyles, null, 2));

      // Check the specific ring classes applied
      const classNames = await firstSessionRow.getAttribute('class');
      console.log(`\nCLASS NAMES: ${classNames}`);

      // Check parent ScrollArea specifically
      const scrollViewport = await firstSessionRow.locator('..').locator('..').locator('..').locator('..');
      const scrollStyles = await scrollViewport.evaluate(el => {
        const cs = window.getComputedStyle(el);
        return {
          width: cs.width,
          maxWidth: cs.maxWidth,
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          padding: cs.padding,
          paddingRight: cs.paddingRight,
        };
      });
      console.log('\nSCROLL VIEWPORT (4th ancestor):');
      console.log(JSON.stringify(scrollStyles, null, 2));

      // Check if the row extends beyond scroll viewport
      const scrollBox = await scrollViewport.boundingBox();
      if (scrollBox && hoverBox) {
        const rowRight = hoverBox.x + hoverBox.width;
        const scrollRight = scrollBox.x + scrollBox.width;
        console.log(`\nOVERFLOW CHECK:`);
        console.log(`  row right edge: ${rowRight}px`);
        console.log(`  scroll viewport right edge: ${scrollRight}px`);
        console.log(`  overflow: ${rowRight > scrollRight ? rowRight - scrollRight : 0}px`);
      }
    }
  } else {
    console.log('Recent Sessions heading not visible');
    // Debug: list all text on page
    const allText = await page.locator('text=/./').allInnerTexts();
    console.log('All text found:', allText.slice(0, 20));
  }

  await browser.close();
}

inspectRecentSessions().catch(console.error);
