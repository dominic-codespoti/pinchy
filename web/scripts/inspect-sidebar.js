const { chromium } = require('playwright-core');

async function inspectSidebar() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Let React render

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
        };
      };

      // Find sidebar - look for the container with sessions
      const findSidebar = () => {
        // Look for "Recent Sessions" heading
        const headings = Array.from(document.querySelectorAll('h3'));
        const recentSessions = headings.find(h => h.textContent?.includes('Recent Sessions'));
        if (recentSessions) {
          // Walk up to find the sidebar container
          let el = recentSessions.parentElement;
          while (el && el !== document.body) {
            const style = window.getComputedStyle(el);
            if (style.display === 'flex' && style.flexDirection === 'column') {
              return el;
            }
            el = el.parentElement;
          }
        }

        // Fallback: look for common sidebar patterns
        const sidebars = Array.from(document.querySelectorAll('[class*="sidebar"], aside, nav'));
        return sidebars[0] || null;
      };

      const sidebar = findSidebar();
      if (!sidebar) return { error: 'Sidebar not found' };

      const sidebarData = getStyles(sidebar);

      // Find ScrollArea root (data-orientation attribute or scrollarea class)
      const scrollAreaRoot = sidebar.querySelector('[data-orientation], [class*="scrollarea"]') ||
                            sidebar.querySelector('[class*="ScrollArea"]') ||
                            Array.from(sidebar.children).find(el => {
                              const style = window.getComputedStyle(el);
                              return style.overflow === 'auto' || style.overflowY === 'auto' || style.position === 'relative';
                            });

      // Find viewport (overflow: auto/scroll or specific class)
      const viewport = scrollAreaRoot?.querySelector('[data-radix-scroll-area-viewport], [style*="overflow"]') ||
                       scrollAreaRoot?.children[0];

      // Find inner wrapper (p-2 class)
      const innerWrapper = viewport?.querySelector('[class*="p-2"]') ||
                           Array.from(viewport?.children || [])[0];

      // Find space-y-1 container
      const spaceYContainer = innerWrapper?.querySelector('[class*="space-y-1"]') ||
                              Array.from(innerWrapper?.children || []).find(el =>
                                el.className.includes('space-y') || el.tagName === 'DIV'
                              );

      // Find session rows (buttons)
      const sessionRows = Array.from(sidebar.querySelectorAll('button')).filter(btn =>
        btn.querySelector('[class*="truncate"]') || btn.textContent?.includes('messages')
      );

      // Get first session row details
      const firstRow = sessionRows[0];

      // Find text container within row
      const textContainer = firstRow?.querySelector('p[class*="truncate"]') ||
                            firstRow?.querySelector('p');

      return {
        sidebar: sidebarData,
        scrollAreaRoot: scrollAreaRoot ? getStyles(scrollAreaRoot) : null,
        viewport: viewport ? getStyles(viewport) : null,
        innerWrapper: innerWrapper ? getStyles(innerWrapper) : null,
        spaceYContainer: spaceYContainer ? getStyles(spaceYContainer) : null,
        firstSessionRow: firstRow ? getStyles(firstRow) : null,
        textContainer: textContainer ? getStyles(textContainer) : null,
        sessionRowCount: sessionRows.length,
        htmlSample: sidebar.outerHTML.slice(0, 500),
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
