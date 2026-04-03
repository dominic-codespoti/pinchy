const { chromium } = require('playwright');

async function inspect() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:3131/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== PRECISE RECENT SESSIONS INSPECTION ===\n');

  // Use the exact structure: button inside .space-y-1
  const buttons = await page.locator('.space-y-1 > button').all();
  console.log(`Found ${buttons.length} session buttons`);

  if (buttons.length === 0) {
    // Debug - check what's in .space-y-1
    const spaceY1 = await page.locator('.space-y-1').first();
    const html = await spaceY1.innerHTML().catch(() => 'not found');
    console.log('.space-y-1 contents:', html.substring(0, 500));
    await browser.close();
    return;
  }

  for (let i = 0; i < Math.min(buttons.length, 2); i++) {
    const btn = buttons[i];
    const text = await btn.innerText().catch(() => 'no text');

    console.log(`\n--- Button ${i}: "${text.substring(0, 25)}..." ---`);

    // Bounding box before hover
    const before = await btn.boundingBox();
    console.log(`BEFORE HOVER:`);
    console.log(`  bounding: ${before?.width}x${before?.height} at (${before?.x}, ${before?.y})`);

    // Computed styles before hover
    const beforeStyles = await btn.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        width: cs.width,
        height: cs.height,
        padding: cs.padding,
        borderRadius: cs.borderRadius,
        margin: cs.margin,
        boxSizing: cs.boxSizing,
        // Position
        position: cs.position,
        // Check if parent clips
        parentOverflow: el.parentElement ? window.getComputedStyle(el.parentElement).overflow : 'none',
        parentOverflowX: el.parentElement ? window.getComputedStyle(el.parentElement).overflowX : 'none',
        // scrollWidth for comparison
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    console.log(`  computed: ${beforeStyles.width}x${beforeStyles.height}, padding: ${beforeStyles.padding}`);
    console.log(`  parent overflow: ${beforeStyles.parentOverflow}, ${beforeStyles.parentOverflowX}`);

    // HOVER STATE
    await btn.hover();
    await page.waitForTimeout(400);

    const after = await btn.boundingBox();
    const afterStyles = await btn.evaluate(el => {
      const cs = window.getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        // Ring/shadow properties from Tailwind
        ringWidth: cs.getPropertyValue('--tw-ring-width') || '0',
        ringOffsetWidth: cs.getPropertyValue('--tw-ring-offset-width') || '0',
        ringColor: cs.getPropertyValue('--tw-ring-color') || 'none',
      };
    });

    console.log(`AFTER HOVER:`);
    console.log(`  bounding: ${after?.width}x${after?.height} at (${after?.x}, ${after?.y})`);
    console.log(`  computed: ${afterStyles.width}x${afterStyles.height}`);
    console.log(`  bg: ${afterStyles.backgroundColor}`);
    console.log(`  boxShadow: ${afterStyles.boxShadow}`);
    console.log(`  ringWidth: ${afterStyles.ringWidth}, ringOffset: ${afterStyles.ringOffsetWidth}`);

    // Check for size change
    if (before && after) {
      const widthDiff = after.width - before.width;
      const heightDiff = after.height - before.height;
      console.log(`  SIZE CHANGE: ${widthDiff > 0 ? '+' : ''}${widthDiff.toFixed(2)}px width, ${heightDiff > 0 ? '+' : ''}${heightDiff.toFixed(2)}px height`);
    }

    // Check the ScrollArea viewport (ancestor)
    const scrollViewport = await btn.evaluate(el => {
      let current = el;
      for (let j = 0; j < 10 && current; j++) {
        const cs = window.getComputedStyle(current);
        if (cs.overflow === 'hidden' || cs.overflowY === 'scroll' || cs.overflowX === 'hidden') {
          return {
            found: true,
            tag: current.tagName,
            class: current.className?.substring(0, 60),
            width: cs.width,
            overflow: cs.overflow,
            overflowX: cs.overflowX,
            overflowY: cs.overflowY,
            padding: cs.padding,
            paddingRight: cs.paddingRight,
          };
        }
        current = current.parentElement;
      }
      return { found: false };
    });

    console.log(`SCROLL VIEWPORT:`);
    console.log(`  found: ${scrollViewport.found}`);
    if (scrollViewport.found) {
      console.log(`  ${scrollViewport.tag}.${scrollViewport.class}`);
      console.log(`  width: ${scrollViewport.width}, padding: ${scrollViewport.padding}`);
      console.log(`  overflow: ${scrollViewport.overflow}, overflowX: ${scrollViewport.overflowX}`);
    }

    // Check the sidebar width
    const sidebar = await page.locator('aside, [class*="sidebar"]').first();
    const sidebarBox = await sidebar.boundingBox();
    if (sidebarBox && after) {
      const btnRight = after.x + after.width;
      const sidebarRight = sidebarBox.x + sidebarBox.width;
      console.log(`SIDEBAR CHECK:`);
      console.log(`  sidebar width: ${sidebarBox.width}px, right edge: ${sidebarRight}px`);
      console.log(`  button right edge: ${btnRight}px`);
      console.log(`  gap: ${sidebarRight - btnRight}px`);
    }
  }

  console.log('\n=== KEY FINDINGS ===');
  console.log('If boxShadow shows a value on hover, that could be the culprit.');
  console.log('If parent has overflow:hidden, hover effects may clip.');

  await browser.close();
}

inspect().catch(console.error);
