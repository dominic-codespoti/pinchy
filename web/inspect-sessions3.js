const { chromium } = require('playwright');

async function inspectRecentSessions() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3131/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== HOVER CLIPPING INVESTIGATION ===\n');

  // Find all sidebar navigation items
  const navLinks = await page.locator('aside nav a').all();
  console.log(`Found ${navLinks.length} nav links`);

  for (let i = 0; i < Math.min(navLinks.length, 3); i++) {
    const link = navLinks[i];
    const text = await link.innerText().catch(() => 'no text');
    const box = await link.boundingBox();

    console.log(`\nLink ${i} (${text.substring(0, 20)}):`);
    console.log(`  width: ${box?.width}px, height: ${box?.height}px`);
    console.log(`  position: x=${box?.x}, y=${box?.y}`);

    // Check class names for ring/hover indicators
    const classes = await link.getAttribute('class');
    const hasRing = classes?.includes('ring') || classes?.includes('focus-visible:ring');
    console.log(`  has ring classes: ${hasRing}`);

    // Measure hover effect
    await link.hover();
    await page.waitForTimeout(300);

    const hoverBox = await link.boundingBox();
    const styles = await link.evaluate(el => {
      const cs = window.getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        outline: cs.outline,
        outlineWidth: cs.outlineWidth,
        outlineOffset: cs.outlineOffset,
      };
    });

    console.log(`  hover width: ${hoverBox?.width}px`);
    console.log(`  boxShadow: ${styles.boxShadow}`);
    console.log(`  outline: ${styles.outline} ${styles.outlineWidth}`);
  }

  // Now specifically look at Recent Sessions rows
  console.log('\n\n=== RECENT SESSIONS ROWS ===');

  // Get the section containing "Recent Sessions"
  const recentHeading = await page.getByText('Recent Sessions').first();
  const parentSection = await recentHeading.locator('xpath=../..');

  // Find all clickable items in that section
  const sessionLinks = await parentSection.locator('a').all();
  console.log(`Found ${sessionLinks.length} session rows`);

  for (let i = 0; i < Math.min(sessionLinks.length, 3); i++) {
    const row = sessionLinks[i];
    const text = await row.innerText().catch(() => 'no text');
    const box = await row.boundingBox();

    console.log(`\nSession ${i} (${text.substring(0, 30)}):`);
    console.log(`  width: ${box?.width}px, x: ${box?.x}`);

    // Full styles before hover
    const beforeStyles = await row.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        width: cs.width,
        padding: cs.padding,
        borderRadius: cs.borderRadius,
        overflow: cs.overflow,
      };
    });
    console.log(`  before padding: ${beforeStyles.padding}`);

    // Hover and check
    await row.hover();
    await page.waitForTimeout(300);

    const hoverBox = await row.boundingBox();
    const hoverStyles = await row.evaluate(el => {
      const cs = window.getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        outline: cs.outline,
        outlineWidth: cs.outlineWidth,
        outlineOffset: cs.outlineOffset,
        ringWidth: cs.getPropertyValue('--tw-ring-width'),
      };
    });

    console.log(`  hover width: ${hoverBox?.width}px`);
    console.log(`  hover bg: ${hoverStyles.backgroundColor}`);
    console.log(`  hover boxShadow: ${hoverStyles.boxShadow}`);
    console.log(`  hover outline: ${hoverStyles.outlineWidth} ${hoverStyles.outlineOffset}`);

    // Check ancestors for overflow:hidden
    const ancestors = await row.evaluate(el => {
      const list = [];
      let current = el.parentElement;
      for (let j = 0; j < 6 && current; j++) {
        const cs = window.getComputedStyle(current);
        list.push({
          tag: current.tagName,
          class: current.className?.substring(0, 50),
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          width: cs.width,
        });
        current = current.parentElement;
      }
      return list;
    });

    console.log(`  ancestors overflow chain:`);
    ancestors.forEach((a, idx) => {
      console.log(`    ${idx}: ${a.tag} ${a.class?.substring(0, 40)} | overflow: ${a.overflow}, ${a.overflowX} | width: ${a.width}`);
    });
  }

  await browser.close();
}

inspectRecentSessions().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
