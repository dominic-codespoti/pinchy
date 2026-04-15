const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;

    // Find the Recent Sessions section specifically
    const headings = Array.from(document.querySelectorAll('h3, h4, p, div'));
    const recentHeading = headings.find(h => h.textContent?.trim() === 'Recent Sessions');

    if (!recentHeading) {
      return { error: 'Recent Sessions heading not found' };
    }

    // Get the closest scroll container
    let container = recentHeading.parentElement;
    while (container && container !== document.body) {
      const style = window.getComputedStyle(container);
      if (style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
        break;
      }
      container = container.parentElement;
    }

    // Measure all relevant widths
    const measurements = {
      viewport,
      recentSessions: {
        heading: {
          clientWidth: recentHeading.clientWidth,
          scrollWidth: recentHeading.scrollWidth,
          offsetWidth: recentHeading.offsetWidth,
          boundingWidth: recentHeading.getBoundingClientRect().width
        }
      }
    };

    if (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      measurements.recentSessions.container = {
        tagName: container.tagName,
        className: container.className?.slice(0, 100),
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        offsetWidth: container.offsetWidth,
        boundingWidth: rect.width,
        boundingRight: rect.right,
        overflowX: window.getComputedStyle(container).overflowX,
        overflowY: window.getComputedStyle(container).overflowY,
        contentExceedsViewport: container.scrollWidth > container.clientWidth,
        pixelsOver: container.scrollWidth - container.clientWidth
      };
    }

    // Check parent containers
    let parent = recentHeading.parentElement;
    const parents = [];
    for (let i = 0; i < 4 && parent; i++) {
      const rect = parent.getBoundingClientRect();
      parents.push({
        level: i,
        tagName: parent.tagName,
        className: parent.className?.slice(0, 60),
        clientWidth: parent.clientWidth,
        scrollWidth: parent.scrollWidth,
        boundingWidth: rect.width,
        boundingRight: rect.right,
        exceedsViewport: rect.right > viewport + 0.5
      });
      parent = parent.parentElement;
    }
    measurements.recentSessions.parents = parents;

    // PASS/FAIL criteria
    measurements.pass = !parents.some(p => p.exceedsViewport) &&
                        container && container.scrollWidth <= viewport;

    return measurements;
  });

  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
