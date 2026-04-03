const { chromium } = require('playwright');

async function inspectRecentSessions() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Navigate to /chat
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Let UI settle

  // Find Recent Sessions section - look for "Recent Sessions" heading
  const recentSessionsHeading = await page.locator('text=Recent Sessions').first();
  const headingVisible = await recentSessionsHeading.isVisible().catch(() => false);

  if (!headingVisible) {
    console.log('ERROR: Recent Sessions heading not found');
    await browser.close();
    return;
  }

  console.log('=== RECENT SESSIONS INSPECTION ===\n');

  // Get the sidebar container
  const sidebar = await page.locator('aside, [class*="sidebar"], [class*="Sidebar"]').first();
  const sidebarBox = await sidebar.boundingBox();
  console.log('SIDEBAR:');
  console.log(`  width: ${sidebarBox?.width}px`);
  console.log(`  height: ${sidebarBox?.height}px`);
  console.log(`  x: ${sidebarBox?.x}, y: ${sidebarBox?.y}`);

  // Find session rows - look for buttons or links containing session names
  const sessionRows = await page.locator('button, a').filter({ hasText: /Session|session/ }).all();
  console.log(`\nFound ${sessionRows.length} potential session rows`);

  // Get computed styles for the first session row
  if (sessionRows.length > 0) {
    const firstRow = sessionRows[0];

    // Measure before hover
    const rowBox = await firstRow.boundingBox();
    console.log('\nSESSION ROW (before hover):');
    console.log(`  width: ${rowBox?.width}px`);
    console.log(`  height: ${rowBox?.height}px`);
    console.log(`  x: ${rowBox?.x}, y: ${rowBox?.y}`);

    // Get computed styles
    const styles = await firstRow.evaluate(el => {
      const computed = window.getComputedStyle(el);
      const parent = el.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;
      const grandparent = parent?.parentElement;
      const grandparentComputed = grandparent ? window.getComputedStyle(grandparent) : null;

      return {
        row: {
          width: computed.width,
          height: computed.height,
          maxWidth: computed.maxWidth,
          padding: computed.padding,
          margin: computed.margin,
          overflow: computed.overflow,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          boxSizing: computed.boxSizing,
          position: computed.position,
          transform: computed.transform,
          outline: computed.outline,
          outlineOffset: computed.outlineOffset,
          borderRadius: computed.borderRadius,
        },
        parent: parentComputed ? {
          width: parentComputed.width,
          height: parentComputed.height,
          overflow: parentComputed.overflow,
          overflowX: parentComputed.overflowX,
          overflowY: parentComputed.overflowY,
          padding: parentComputed.padding,
        } : null,
        grandparent: grandparentComputed ? {
          width: grandparentComputed.width,
          overflow: grandparentComputed.overflow,
        } : null,
      };
    });

    console.log('\nCOMPUTED STYLES (before hover):');
    console.log(JSON.stringify(styles, null, 2));

    // Trigger hover
    await firstRow.hover();
    await page.waitForTimeout(500); // Let hover state apply

    // Measure after hover
    const rowBoxHover = await firstRow.boundingBox();
    console.log('\nSESSION ROW (after hover):');
    console.log(`  width: ${rowBoxHover?.width}px`);
    console.log(`  height: ${rowBoxHover?.height}px`);
    console.log(`  x: ${rowBoxHover?.x}, y: ${rowBoxHover?.y}`);

    // Get computed styles after hover
    const hoverStyles = await firstRow.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        width: computed.width,
        height: computed.height,
        transform: computed.transform,
        outline: computed.outline,
        outlineOffset: computed.outlineOffset,
        outlineWidth: computed.outlineWidth,
        outlineStyle: computed.outlineStyle,
        boxShadow: computed.boxShadow,
        backgroundColor: computed.backgroundColor,
      };
    });

    console.log('\nCOMPUTED STYLES (after hover):');
    console.log(JSON.stringify(hoverStyles, null, 2));

    // Check if there's a pseudo-element or ring effect
    const hasPseudo = await firstRow.evaluate(el => {
      const before = window.getComputedStyle(el, '::before');
      const after = window.getComputedStyle(el, '::after');
      return {
        beforeContent: before.content,
        beforePosition: before.position,
        afterContent: after.content,
        afterPosition: after.position,
      };
    });

    console.log('\nPSEUDO-ELEMENTS:');
    console.log(JSON.stringify(hasPseudo, null, 2));

    // Check parent containers for overflow hidden
    const overflowChain = await firstRow.evaluate(el => {
      const chain = [];
      let current = el;
      for (let i = 0; i < 5 && current; i++) {
        const computed = window.getComputedStyle(current);
        chain.push({
          tag: current.tagName,
          class: current.className,
          width: computed.width,
          overflow: computed.overflow,
          overflowX: computed.overflowX,
          padding: computed.padding,
        });
        current = current.parentElement;
      }
      return chain;
    });

    console.log('\nOVERFLOW CHAIN (parent containers):');
    console.log(JSON.stringify(overflowChain, null, 2));

    // Check for ScrollArea viewport
    const scrollArea = await page.locator('[data-radix-scroll-area-viewport], [class*="ScrollAreaViewport"], [class*="scroll-area"]').first();
    if (await scrollArea.isVisible().catch(() => false)) {
      const scrollBox = await scrollArea.boundingBox();
      const scrollStyles = await scrollArea.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          height: computed.height,
          overflow: computed.overflow,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
        };
      });
      console.log('\nSCROLLAREA VIEWPORT:');
      console.log(`  bounding width: ${scrollBox?.width}px`);
      console.log(`  computed width: ${scrollStyles.width}`);
      console.log(`  overflow: ${scrollStyles.overflow}`);
    }

    // Check text container and icon within the row
    const textContainer = await firstRow.locator('span, div').first();
    const icon = await firstRow.locator('svg, [class*="icon"]').first();

    const textBox = await textContainer.boundingBox().catch(() => null);
    const iconBox = await icon.boundingBox().catch(() => null);

    console.log('\nTEXT CONTAINER:');
    console.log(`  width: ${textBox?.width}px`);
    console.log(`  x: ${textBox?.x}`);

    console.log('\nICON:');
    console.log(`  width: ${iconBox?.width}px`);
    console.log(`  x: ${iconBox?.x}`);

    // Calculate if anything is clipped
    if (rowBox && sidebarBox) {
      const rowRightEdge = rowBox.x + rowBox.width;
      const sidebarRightEdge = sidebarBox.x + sidebarBox.width;
      console.log('\nCLIPPING ANALYSIS:');
      console.log(`  row right edge: ${rowRightEdge}px`);
      console.log(`  sidebar right edge: ${sidebarRightEdge}px`);
      console.log(`  overflow amount: ${rowRightEdge > sidebarRightEdge ? rowRightEdge - sidebarRightEdge : 0}px`);
    }
  }

  await browser.close();
}

inspectRecentSessions().catch(console.error);
