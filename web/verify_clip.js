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

  // Measure elements in the Recent Sessions area
  const measurements = await page.evaluate(() => {
    const results = {};

    // Find the Recent Sessions section
    const recentHeading = Array.from(document.querySelectorAll('h2, h3, h4, p, div'))
      .find(el => el.textContent?.includes('Recent'));

    if (recentHeading) {
      // Walk up to find container
      let container = recentHeading.closest('div[class*="scroll"], div[class*="Scroll"], [data-slot="scroll-area-viewport"]') ||
                      recentHeading.parentElement;

      // Try to find scroll area viewport
      const scrollViewport = document.querySelector('[data-slot="scroll-area-viewport"]');
      if (scrollViewport) {
        results.scrollAreaViewport = {
          clientWidth: scrollViewport.clientWidth,
          scrollWidth: scrollViewport.scrollWidth,
          offsetWidth: scrollViewport.offsetWidth
        };
      }

      // Find the scrollable content wrapper
      const scrollContent = document.querySelector('[data-slot="scroll-area-content"]');
      if (scrollContent) {
        results.scrollAreaContent = {
          clientWidth: scrollContent.clientWidth,
          scrollWidth: scrollContent.scrollWidth,
          offsetWidth: scrollContent.offsetWidth
        };
      }

      // Find sessions container (usually a flex/grid container holding session rows)
      const sessionsContainer = document.querySelector('[class*="sessions"], [class*="session-list"], [class*="grid"], [class*="flex-col"]');
      if (sessionsContainer) {
        results.sessionsContainer = {
          clientWidth: sessionsContainer.clientWidth,
          scrollWidth: sessionsContainer.scrollWidth,
          offsetWidth: sessionsContainer.offsetWidth,
          className: sessionsContainer.className.slice(0, 100)
        };
      }

      // Find session rows
      const sessionRows = document.querySelectorAll('[class*="session"], [class*="row"], [role="button"]');
      if (sessionRows.length > 0) {
        results.sessionRows = [];
        sessionRows.forEach((row, i) => {
          if (i < 3) { // Only measure first 3
            results.sessionRows.push({
              clientWidth: row.clientWidth,
              scrollWidth: row.scrollWidth,
              offsetWidth: row.offsetWidth,
              className: row.className.slice(0, 100)
            });
          }
        });
      }

      // Check for any overflow
      results.overflowDetected = document.documentElement.scrollWidth > window.innerWidth;
      results.documentScrollWidth = document.documentElement.scrollWidth;
      results.windowWidth = window.innerWidth;
    }

    return results;
  });

  // Also try a more specific selector approach for the sidebar
  const sidebarMeasurements = await page.evaluate(() => {
    const results = {};

    // Find sidebar by common patterns
    const sidebar = document.querySelector('aside, [class*="sidebar"], [class*="Sidebar"]');
    if (sidebar) {
      results.sidebar = {
        clientWidth: sidebar.clientWidth,
        scrollWidth: sidebar.scrollWidth,
        offsetWidth: sidebar.offsetWidth
      };
    }

    // Find any element that might be clipping
    const allElements = document.querySelectorAll('div, section, article');
    const clippingElements = [];

    allElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 1 || rect.width > window.innerWidth) {
        clippingElements.push({
          tag: el.tagName,
          className: el.className?.slice(0, 50),
          width: rect.width,
          right: rect.right,
          windowWidth: window.innerWidth
        });
      }
    });

    results.clippingElements = clippingElements.slice(0, 5);

    return results;
  });

  console.log(JSON.stringify({
    viewportWidth,
    measurements,
    sidebarMeasurements
  }, null, 2));

  await browser.close();
})();
