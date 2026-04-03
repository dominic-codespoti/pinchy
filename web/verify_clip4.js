const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;

    // Find sidebar by class patterns
    const sidebar = document.querySelector('[class*="w-64"], [class*="lg:flex"], aside');

    // Find the card container
    const card = document.querySelector('.border.bg-card');

    // Find the Recent Sessions container
    const recentHeading = Array.from(document.querySelectorAll('h3'))
      .find(h => h.textContent?.trim() === 'Recent Sessions');

    const measurements = {
      viewport,
      sidebar: sidebar ? {
        className: sidebar.className?.slice(0, 100),
        clientWidth: sidebar.clientWidth,
        offsetWidth: sidebar.offsetWidth,
        boundingWidth: sidebar.getBoundingClientRect().width
      } : null,
      card: card ? {
        className: card.className?.slice(0, 100),
        clientWidth: card.clientWidth,
        offsetWidth: card.offsetWidth,
        boundingWidth: card.getBoundingClientRect().width
      } : null
    };

    if (recentHeading) {
      // Walk up the tree and measure each level
      const tree = [];
      let el = recentHeading;
      let level = 0;
      while (el && el !== document.body && level < 10) {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        tree.push({
          level,
          tag: el.tagName,
          className: el.className?.slice(0, 80),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          offsetWidth: el.offsetWidth,
          boundingWidth: rect.width,
          boundingRight: rect.right,
          computedWidth: computed.width,
          maxWidth: computed.maxWidth,
          paddingLeft: computed.paddingLeft,
          paddingRight: computed.paddingRight,
          boxSizing: computed.boxSizing
        });
        el = el.parentElement;
        level++;
      }
      measurements.tree = tree;

      // Check the w-full min-w-0 p-2 element specifically
      const contentWrapper = recentHeading.closest('.w-full.min-w-0');
      if (contentWrapper) {
        measurements.contentWrapper = {
          className: contentWrapper.className,
          clientWidth: contentWrapper.clientWidth,
          scrollWidth: contentWrapper.scrollWidth,
          offsetWidth: contentWrapper.offsetWidth,
          parentClientWidth: contentWrapper.parentElement?.clientWidth
        };
      }
    }

    // Determine PASS/FAIL
    // PASS if: no element extends beyond viewport AND content doesn't overflow in broken way
    const anyExceedsViewport = measurements.tree?.some(t => t.boundingRight > viewport + 0.5);
    const scrollContainerOverflow = measurements.tree?.find(t => t.className?.includes('rounded-[inherit]'));
    const hasOverflowIssue = scrollContainerOverflow && scrollContainerOverflow.scrollWidth > scrollContainerOverflow.clientWidth;

    measurements.verdict = {
      anyExceedsViewport,
      hasOverflowIssue,
      overflowPixels: hasOverflowIssue ? scrollContainerOverflow.scrollWidth - scrollContainerOverflow.clientWidth : 0,
      pass: !anyExceedsViewport && !hasOverflowIssue
    };

    return measurements;
  });

  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
