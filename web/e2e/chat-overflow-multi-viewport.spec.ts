import { test, expect, Page } from '@playwright/test';

/**
 * Chat History Overflow Analysis - Multi-viewport
 * 
 * Tests for overflow at multiple viewport sizes.
 */

test.describe('Chat overflow analysis', () => {
  test('desktop-large (1920x1080)', async ({ page }) => {
    await checkOverflow(page, 1920, 1080, 'desktop-large');
  });
  
  test('desktop (1440x900)', async ({ page }) => {
    await checkOverflow(page, 1440, 900, 'desktop');
  });
  
  test('desktop-small (1280x800)', async ({ page }) => {
    await checkOverflow(page, 1280, 800, 'desktop-small');
  });
  
  test('tablet (1024x768)', async ({ page }) => {
    await checkOverflow(page, 1024, 768, 'tablet');
  });
});

async function checkOverflow(page: Page, width: number, height: number, name: string) {
  await page.setViewportSize({ width, height });
  
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const measurements = await page.evaluate(() => {
    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
    
    // Find sidebar
    const sidebar = document.querySelector('aside.hidden.lg\\:flex.w-72, aside[class*="w-72"]') as HTMLElement;
    if (!sidebar) {
      return { error: 'Sidebar not found' };
    }
    
    const sidebarRect = sidebar.getBoundingClientRect();
    results['sidebar'] = {
      width: Math.round(sidebarRect.width),
      scrollWidth: Math.round(sidebar.scrollWidth),
      clientWidth: Math.round(sidebar.clientWidth),
      offsetWidth: Math.round(sidebar.offsetWidth),
    };
    
    // Find ScrollArea viewport
    const scrollViewport = sidebar.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (scrollViewport) {
      const vpRect = scrollViewport.getBoundingClientRect();
      results['scrollarea-viewport'] = {
        width: Math.round(vpRect.width),
        scrollWidth: Math.round(scrollViewport.scrollWidth),
        clientWidth: Math.round(scrollViewport.clientWidth),
        offsetWidth: Math.round(scrollViewport.offsetWidth),
        hasHorizontalScrollbar: scrollViewport.scrollWidth > scrollViewport.clientWidth,
      };
      
      // Check content wrapper
      const contentWrapper = scrollViewport.firstElementChild as HTMLElement;
      if (contentWrapper) {
        const cwRect = contentWrapper.getBoundingClientRect();
        results['content-wrapper'] = {
          width: Math.round(cwRect.width),
          scrollWidth: Math.round(contentWrapper.scrollWidth),
          clientWidth: Math.round(contentWrapper.clientWidth),
          offsetWidth: Math.round(contentWrapper.offsetWidth),
          hasHorizontalScrollbar: contentWrapper.scrollWidth > contentWrapper.clientWidth,
        };
        
        // Find the box-border element
        const boxBorder = contentWrapper.querySelector('.box-border') as HTMLElement;
        if (boxBorder) {
          const bbRect = boxBorder.getBoundingClientRect();
          const bbStyle = window.getComputedStyle(boxBorder);
          results['box-border-container'] = {
            width: Math.round(bbRect.width),
            scrollWidth: Math.round(boxBorder.scrollWidth),
            clientWidth: Math.round(boxBorder.clientWidth),
            offsetWidth: Math.round(boxBorder.offsetWidth),
            className: boxBorder.className,
            paddingLeft: bbStyle.paddingLeft,
            paddingRight: bbStyle.paddingRight,
            hasHorizontalScrollbar: boxBorder.scrollWidth > boxBorder.clientWidth,
          };
          
          // Find sessions list
          const sessionsContainer = boxBorder.querySelector('.flex.min-w-0.flex-col.gap-1, .flex.flex-col.gap-1') as HTMLElement;
          if (sessionsContainer) {
            const scRect = sessionsContainer.getBoundingClientRect();
            results['sessions-container'] = {
              width: Math.round(scRect.width),
              scrollWidth: Math.round(sessionsContainer.scrollWidth),
              clientWidth: Math.round(sessionsContainer.clientWidth),
              offsetWidth: Math.round(sessionsContainer.offsetWidth),
              hasHorizontalScrollbar: sessionsContainer.scrollWidth > sessionsContainer.clientWidth,
            };
            
            // Check individual session rows
            const sessionButtons = sessionsContainer.querySelectorAll('button');
            results['session-count'] = sessionButtons.length;
            
            if (sessionButtons.length > 0) {
              const sessions: Array<Record<string, unknown>> = [];
              let widestSessionIdx = -1;
              let maxSessionWidth = 0;
              
              sessionButtons.forEach((btn, idx) => {
                const btnRect = btn.getBoundingClientRect();
                const btnWidth = Math.round(btnRect.width);
                const btnScrollWidth = Math.round(btn.scrollWidth);
                
                if (btnScrollWidth > maxSessionWidth) {
                  maxSessionWidth = btnScrollWidth;
                  widestSessionIdx = idx;
                }
                
                if (idx < 5) {
                  const titleEl = btn.querySelector('p') as HTMLElement;
                  sessions.push({
                    index: idx,
                    width: btnWidth,
                    scrollWidth: btnScrollWidth,
                    clientWidth: Math.round(btn.clientWidth),
                    offsetWidth: Math.round(btn.offsetWidth),
                    exceedsViewport: btnScrollWidth > (scrollViewport?.clientWidth || 0),
                    title: titleEl?.textContent?.substring(0, 40),
                  });
                }
              });
              
              results['session-items'] = sessions;
              results['widest-session'] = {
                index: widestSessionIdx,
                width: maxSessionWidth,
              };
            }
          } else {
            results['sessions-container'] = { status: 'empty-state' };
          }
        }
      }
    }
    
    // Scan for any overflowing elements in sidebar
    const allElements = sidebar.querySelectorAll('*');
    const overflowing: Array<Record<string, unknown>> = [];
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none') return;
      
      const hasOverflow = htmlEl.scrollWidth > htmlEl.clientWidth + 2;
      if (hasOverflow) {
        overflowing.push({
          tag: el.tagName,
          class: (el.className || '').toString().substring(0, 80),
          scrollWidth: htmlEl.scrollWidth,
          clientWidth: htmlEl.clientWidth,
          overflow: style.overflow,
          overflowX: style.overflowX,
        });
      }
    });
    results['overflowing-elements-count'] = overflowing.length;
    if (overflowing.length > 0 && overflowing.length <= 10) {
      results['overflowing-elements'] = overflowing;
    }
    
    return results;
  });

  console.log(`\n=== ${name.toUpperCase()} (${width}x${height}) ===`);
  console.log(JSON.stringify(measurements, null, 2));

  const viewportData = measurements['scrollarea-viewport'] as Record<string, unknown> | undefined;
  const overflowingCount = measurements['overflowing-elements-count'] as number || 0;
  
  if (viewportData?.hasHorizontalScrollbar) {
    console.log(`\n❌ ${name}: Horizontal scrollbar detected!`);
    console.log(`   Viewport: ${viewportData.clientWidth}px → ${viewportData.scrollWidth}px`);
  } else if (overflowingCount > 0) {
    console.log(`\n⚠️ ${name}: ${overflowingCount} elements with overflow`);
  } else {
    console.log(`\n✅ ${name}: No overflow detected`);
  }

  expect(viewportData?.hasHorizontalScrollbar || false).toBe(false);
  expect(overflowingCount).toBe(0);
}
