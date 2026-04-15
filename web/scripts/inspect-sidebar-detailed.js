const { chromium } = require('playwright-core');

async function inspectSidebar() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => {
      const getStyles = (el) => {
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          width: rect.width,
          height: rect.height,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          overflow: computed.overflow,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          minWidth: computed.minWidth,
          maxWidth: computed.maxWidth,
          paddingLeft: computed.paddingLeft,
          paddingRight: computed.paddingRight,
          marginLeft: computed.marginLeft,
          marginRight: computed.marginRight,
          boxSizing: computed.boxSizing,
          flexShrink: computed.flexShrink,
          flexGrow: computed.flexGrow,
          flexDirection: computed.flexDirection,
          display: computed.display,
        };
      };

      // Find sidebar by looking for "Recent Sessions" heading
      const headings = Array.from(document.querySelectorAll('h3'));
      const recentSessions = headings.find(h => h.textContent?.includes('Recent Sessions'));
      let sidebar = null;
      if (recentSessions) {
        let el = recentSessions.parentElement;
        while (el && el !== document.body) {
          const style = window.getComputedStyle(el);
          if (style.display === 'flex' && style.flexDirection === 'column') {
            sidebar = el;
            break;
          }
          el = el.parentElement;
        }
      }

      if (!sidebar) return { error: 'Sidebar not found' };

      // Find viewport
      const viewport = sidebar.querySelector('[data-radix-scroll-area-viewport]') ||
                       sidebar.querySelector('[style*="overflow"]');

      // Find p-2 wrapper
      const innerWrapper = viewport?.querySelector('[class*="p-2"]') ||
                           Array.from(viewport?.children || [])[0];

      // Find space-y-1 container
      const spaceYContainer = innerWrapper?.querySelector('[class*="space-y-1"]');

      // Find all session buttons
      const sessionButtons = Array.from(spaceYContainer?.querySelectorAll('button') || []);

      // Get detailed button breakdown
      const buttonDetails = sessionButtons.slice(0, 2).map(btn => {
        const icon = btn.querySelector('svg');
        const contentDiv = btn.querySelector('div.flex-1, div.min-w-0');
        const titleP = contentDiv?.querySelector('p');
        const timeDiv = contentDiv?.querySelector('div.flex');

        return {
          button: getStyles(btn),
          icon: icon ? getStyles(icon) : null,
          contentDiv: contentDiv ? getStyles(contentDiv) : null,
          titleP: titleP ? getStyles(titleP) : null,
          timeDiv: timeDiv ? getStyles(timeDiv) : null,
          textContent: titleP?.textContent?.slice(0, 50),
        };
      });

      // Check parent chain overflow
      const chain = [];
      let el = spaceYContainer;
      while (el && el !== document.body) {
        chain.push({
          className: el.className,
          tagName: el.tagName,
          ...getStyles(el),
        });
        el = el.parentElement;
      }

      return {
        sidebarWidth: getStyles(sidebar).width,
        viewportWidth: getStyles(viewport).width,
        viewportScrollWidth: getStyles(viewport).scrollWidth,
        innerWrapperWidth: getStyles(innerWrapper).width,
        innerWrapperScrollWidth: getStyles(innerWrapper).scrollWidth,
        spaceYContainerWidth: getStyles(spaceYContainer).width,
        spaceYContainerScrollWidth: getStyles(spaceYContainer).scrollWidth,
        buttonCount: sessionButtons.length,
        buttonDetails,
        parentChain: chain.slice(0, 5),
        overflowDifference: getStyles(viewport).scrollWidth - getStyles(viewport).width,
      };
    });

    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

inspectSidebar();
