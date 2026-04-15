const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Navigate to /chat
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Get viewport width
  const viewportWidth = await page.evaluate(() => window.innerWidth);

  // Measure elements more comprehensively
  const measurements = await page.evaluate(() => {
    const results = {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth },
      elements: []
    };

    // Find "Recent" text and its containers
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes('Recent') && node.parentElement) {
        let el = node.parentElement;
        // Walk up up to 5 levels and measure each
        for (let i = 0; i < 5 && el; i++) {
          const rect = el.getBoundingClientRect();
          const computed = window.getComputedStyle(el);
          results.elements.push({
            level: i,
            tag: el.tagName,
            className: el.className?.slice(0, 80),
            text: el.textContent?.slice(0, 50),
            width: rect.width,
            height: rect.height,
            right: rect.right,
            overflowX: computed.overflowX,
            overflowY: computed.overflowY,
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            exceedsViewport: rect.right > window.innerWidth + 0.5
          });
          el = el.parentElement;
        }
        break; // Only first match
      }
    }

    // Find all scroll areas
    const scrollAreas = document.querySelectorAll('[data-radix-scroll-area-viewport], [class*="ScrollArea"], [class*="scroll-area"]');
    results.scrollAreas = [];
    scrollAreas.forEach(sa => {
      const rect = sa.getBoundingClientRect();
      results.scrollAreas.push({
        className: sa.className?.slice(0, 80),
        width: rect.width,
        right: rect.right,
        clientWidth: sa.clientWidth,
        scrollWidth: sa.scrollWidth,
        exceedsViewport: rect.right > window.innerWidth + 0.5
      });
    });

    // Check for any element extending beyond viewport
    const allDivs = document.querySelectorAll('div');
    const offenders = [];
    allDivs.forEach(div => {
      const rect = div.getBoundingClientRect();
      if (rect.right > window.innerWidth + 0.5 && rect.width > 0) {
        offenders.push({
          className: div.className?.slice(0, 50),
          width: rect.width,
          right: rect.right,
          viewport: window.innerWidth
        });
      }
    });
    results.offenders = offenders.slice(0, 3);

    return results;
  });

  console.log(JSON.stringify(measurements, null, 2));

  await browser.close();
})();
