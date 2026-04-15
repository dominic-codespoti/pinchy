const { chromium } = require('playwright');

async function rootCause() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:3131/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== ROOT CAUSE ANALYSIS ===\n');

  const btn = await page.locator('.space-y-1 > button').first();

  // Detailed width analysis
  const widths = await btn.evaluate(el => {
    const cs = window.getComputedStyle(el);
    const parent = el.parentElement;
    const parentCs = parent ? window.getComputedStyle(parent) : null;
    const grandparent = parent?.parentElement;
    const grandparentCs = grandparent ? window.getComputedStyle(grandparent) : null;
    const greatgp = grandparent?.parentElement;
    const greatgpCs = greatgp ? window.getComputedStyle(greatgp) : null;
    const scrollViewport = greatgp?.parentElement;
    const scrollCs = scrollViewport ? window.getComputedStyle(scrollViewport) : null;

    return {
      button: {
        width: cs.width,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        padding: cs.padding,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        boxSizing: cs.boxSizing,
        margin: cs.margin,
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
      },
      parentSpaceY1: parentCs ? {
        width: parentCs.width,
        padding: parentCs.padding,
      } : null,
      grandparentP2: grandparentCs ? {
        width: grandparentCs.width,
        padding: grandparentCs.padding,
        paddingLeft: grandparentCs.paddingLeft,
        paddingRight: grandparentCs.paddingRight,
      } : null,
      greatgp: greatgpCs ? {
        width: greatgpCs.width,
      } : null,
      scrollViewport: scrollCs ? {
        width: scrollCs.width,
        maxWidth: scrollCs.maxWidth,
        padding: scrollCs.padding,
        paddingRight: scrollCs.paddingRight,
        overflow: scrollCs.overflow,
        overflowX: scrollCs.overflowX,
      } : null,
    };
  });

  console.log('WIDTH CHAIN (from inner to outer):');
  console.log(`  button: ${widths.button.width} (padding: ${widths.button.padding})`);
  console.log(`  ├─ scrollWidth: ${widths.button.scrollWidth}, clientWidth: ${widths.button.clientWidth}`);
  console.log(`  ├─ boxSizing: ${widths.button.boxSizing}`);
  console.log(`  parent (.space-y-1): ${widths.parentSpaceY1?.width}`);
  console.log(`  grandparent (.p-2): ${widths.grandparentP2?.width} (padding: ${widths.grandparentP2?.padding})`);
  console.log(`  scroll viewport: ${widths.scrollViewport?.width} (overflow: ${widths.scrollViewport?.overflowX})`);

  // Check the actual sidebar/aside element
  const sidebarCheck = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return { found: false };
    const cs = window.getComputedStyle(aside);
    return {
      found: true,
      width: cs.width,
      maxWidth: cs.maxWidth,
      minWidth: cs.minWidth,
      padding: cs.padding,
    };
  });

  console.log(`\nSIDEBAR (aside):`);
  console.log(`  width: ${sidebarCheck.width}, maxWidth: ${sidebarCheck.maxWidth}, minWidth: ${sidebarCheck.minWidth}`);

  // Box model calculation
  const btnBox = await btn.boundingBox();
  const sidebar = await page.locator('aside').first();
  const sidebarBox = await sidebar.boundingBox();

  console.log(`\nBOUNDING BOX COMPARISON:`);
  console.log(`  button: x=${btnBox?.x}, width=${btnBox?.width}, right=${btnBox?.x + btnBox?.width}`);
  console.log(`  sidebar: x=${sidebarBox?.x}, width=${sidebarBox?.width}, right=${sidebarBox?.x + sidebarBox?.width}`);

  // Calculate what's causing the overflow
  const contentWidth = parseFloat(widths.button.width);
  const scrollWidth = parseFloat(widths.scrollViewport?.width || '0');
  const overflow = contentWidth - scrollWidth;

  console.log(`\nOVERFLOW CALCULATION:`);
  console.log(`  button width: ${contentWidth}px`);
  console.log(`  scroll viewport width: ${scrollWidth}px`);
  console.log(`  overflow: ${overflow.toFixed(2)}px`);

  console.log(`\n=== ROOT CAUSE ===`);
  if (overflow > 0) {
    console.log(`The button (${contentWidth}px) is WIDER than the scroll viewport (${scrollWidth}px)`);
    console.log(`The button's parent .p-2 container has padding, making the available`);
    console.log(`width for content less than the scroll viewport.`);
    console.log(`\nFIX: The button needs to fit within the scroll viewport boundaries.`);
    console.log(`Either:`);
    console.log(`  1. Reduce button width (w-full should respect container)`);
    console.log(`  2. Remove/adjust .p-2 padding on the parent`);
    console.log(`  3. Add box-sizing: border-box if missing`);
    console.log(`  4. Use w-[calc(100%-16px)] or similar to account for padding`);
  }

  await browser.close();
}

rootCause().catch(console.error);
