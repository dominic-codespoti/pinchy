import { test, expect } from '@playwright/test';

/**
 * Chat History Overflow/Clipping Diagnostic
 * 
 * Measures widths and scrollWidths for:
 * - sidebar
 * - ScrollArea viewport
 * - inner content wrapper(s)
 * - sessions list container
 * - session row
 * 
 * Identifies which element exceeds visible width.
 */

test('Chat history overflow diagnostic', async ({ page }) => {
  // Set explicit viewport size for consistent measurements
  await page.setViewportSize({ width: 1440, height: 900 });
  
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const diagnostics = await page.evaluate(() => {
    const results: Record<string, unknown> = {};
    
    // 1. SIDEBAR - Get the aside element (desktop sidebar)
    const sidebar = document.querySelector('aside.hidden.lg\\:flex.w-72') as HTMLElement;
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      results['sidebar (aside)'] = {
        width: Math.round(rect.width),
        scrollWidth: Math.round(sidebar.scrollWidth),
        clientWidth: Math.round(sidebar.clientWidth),
        offsetWidth: Math.round(sidebar.offsetWidth),
        className: sidebar.className,
        computedOverflow: window.getComputedStyle(sidebar).overflow,
        computedOverflowX: window.getComputedStyle(sidebar).overflowX,
      };
    } else {
      results['sidebar (aside)'] = { error: 'Not found' };
    }

    // 2. SIDEBAR INNER - The flex column container
    const sidebarInner = document.querySelector('aside .flex.h-full.flex-col') as HTMLElement;
    if (sidebarInner) {
      const rect = sidebarInner.getBoundingClientRect();
      results['sidebar-inner (flex-col)'] = {
        width: Math.round(rect.width),
        scrollWidth: Math.round(sidebarInner.scrollWidth),
        clientWidth: Math.round(sidebarInner.clientWidth),
        offsetWidth: Math.round(sidebarInner.offsetWidth),
        className: sidebarInner.className,
      };
    }

    // 3. SCROLLAREA ROOT
    const scrollAreaRoot = document.querySelector('[data-radix-scroll-area-root]') as HTMLElement;
    if (scrollAreaRoot) {
      const rect = scrollAreaRoot.getBoundingClientRect();
      results['scrollarea-root'] = {
        width: Math.round(rect.width),
        scrollWidth: Math.round(scrollAreaRoot.scrollWidth),
        clientWidth: Math.round(scrollAreaRoot.clientWidth),
        offsetWidth: Math.round(scrollAreaRoot.offsetWidth),
        className: scrollAreaRoot.className,
      };
    }

    // 4. SCROLLAREA VIEWPORT
    const scrollAreaViewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (scrollAreaViewport) {
      const rect = scrollAreaViewport.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(scrollAreaViewport);
      results['scrollarea-viewport'] = {
        width: Math.round(rect.width),
        scrollWidth: Math.round(scrollAreaViewport.scrollWidth),
        clientWidth: Math.round(scrollAreaViewport.clientWidth),
        offsetWidth: Math.round(scrollAreaViewport.offsetWidth),
        className: scrollAreaViewport.className,
        hasHorizontalScrollbar: scrollAreaViewport.scrollWidth > scrollAreaViewport.clientWidth,
        paddingLeft: computedStyle.paddingLeft,
        paddingRight: computedStyle.paddingRight,
        boxSizing: computedStyle.boxSizing,
      };
    }

    // 5. SCROLLAREA CONTENT WRAPPER (first child of viewport)
    if (scrollAreaViewport) {
      const contentWrapper = scrollAreaViewport.firstElementChild as HTMLElement;
      if (contentWrapper) {
        const rect = contentWrapper.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(contentWrapper);
        results['scrollarea-content-wrapper'] = {
          width: Math.round(rect.width),
          scrollWidth: Math.round(contentWrapper.scrollWidth),
          clientWidth: Math.round(contentWrapper.clientWidth),
          offsetWidth: Math.round(contentWrapper.offsetWidth),
          tagName: contentWrapper.tagName,
          className: contentWrapper.className,
          hasHorizontalScrollbar: contentWrapper.scrollWidth > contentWrapper.clientWidth,
          marginLeft: computedStyle.marginLeft,
          marginRight: computedStyle.marginRight,
          paddingLeft: computedStyle.paddingLeft,
          paddingRight: computedStyle.paddingRight,
        };

        // 6. SESSIONS LIST CONTAINER
        const sessionsContainer = contentWrapper.querySelector('.flex.min-w-0.flex-col.gap-1') as HTMLElement;
        if (sessionsContainer) {
          const sessionsRect = sessionsContainer.getBoundingClientRect();
          const sessionsStyle = window.getComputedStyle(sessionsContainer);
          results['sessions-list-container'] = {
            width: Math.round(sessionsRect.width),
            scrollWidth: Math.round(sessionsContainer.scrollWidth),
            clientWidth: Math.round(sessionsContainer.clientWidth),
            offsetWidth: Math.round(sessionsContainer.offsetWidth),
            className: sessionsContainer.className,
            hasHorizontalScrollbar: sessionsContainer.scrollWidth > sessionsContainer.clientWidth,
            minWidth: sessionsStyle.minWidth,
            maxWidth: sessionsStyle.maxWidth,
          };

          // 7. SESSION ROWS - Get first few session items
          const sessionButtons = sessionsContainer.querySelectorAll('button');
          const sessionRows: Array<Record<string, unknown>> = [];
          sessionButtons.forEach((btn, idx) => {
            if (idx < 3) { // First 3 sessions only
              const btnRect = btn.getBoundingClientRect();
              const btnStyle = window.getComputedStyle(btn);
              const titleEl = btn.querySelector('p.truncate') as HTMLElement;
              sessionRows.push({
                index: idx,
                width: Math.round(btnRect.width),
                scrollWidth: Math.round(btn.scrollWidth),
                clientWidth: Math.round(btn.clientWidth),
                offsetWidth: Math.round(btn.offsetWidth),
                className: btn.className.substring(0, 100),
                hasHorizontalScrollbar: btn.scrollWidth > btn.clientWidth,
                textContent: btn.textContent?.substring(0, 50) || '',
                titleWidth: titleEl ? Math.round(titleEl.getBoundingClientRect().width) : null,
                titleScrollWidth: titleEl?.scrollWidth,
                titleClientWidth: titleEl?.clientWidth,
                titleIsTruncated: titleEl ? titleEl.scrollWidth > titleEl.clientWidth : null,
              });
            }
          });
          results['session-rows (first 3)'] = sessionRows;
        }

        // 8. BOX-SIZING INHERITANCE CHECK
        // Check if padding/margin is causing overflow
        const boxElement = contentWrapper.querySelector('.box-border') as HTMLElement;
        if (boxElement) {
          const boxRect = boxElement.getBoundingClientRect();
          const boxStyle = window.getComputedStyle(boxElement);
          results['box-border-element'] = {
            width: Math.round(boxRect.width),
            scrollWidth: Math.round(boxElement.scrollWidth),
            clientWidth: Math.round(boxElement.clientWidth),
            offsetWidth: Math.round(boxElement.offsetWidth),
            className: boxElement.className,
            paddingLeft: boxStyle.paddingLeft,
            paddingRight: boxStyle.paddingRight,
            marginLeft: boxStyle.marginLeft,
            marginRight: boxStyle.marginRight,
            boxSizing: boxStyle.boxSizing,
          };
        }
      }
    }

    // 9. Check all direct children of scrollarea viewport for overflow
    if (scrollAreaViewport) {
      const children = Array.from(scrollAreaViewport.children);
      const childInfo = children.map(child => {
        const el = child as HTMLElement;
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          className: el.className.substring(0, 100),
          width: Math.round(rect.width),
          scrollWidth: Math.round(el.scrollWidth),
          offsetWidth: Math.round(el.offsetWidth),
          exceedsViewport: el.scrollWidth > (scrollAreaViewport?.clientWidth || 0),
        };
      });
      results['scrollarea-viewport-children'] = childInfo;
    }

    return results;
  });

  // Output structured report
  console.log('\n=== CHAT OVERFLOW DIAGNOSTIC REPORT ===\n');
  console.log(JSON.stringify(diagnostics, null, 2));

  // Analysis summary
  console.log('\n=== ANALYSIS SUMMARY ===\n');
  
  const viewport = diagnostics['scrollarea-viewport'] as Record<string, unknown> | undefined;
  const contentWrapper = diagnostics['scrollarea-content-wrapper'] as Record<string, unknown> | undefined;
  const sessionsContainer = diagnostics['sessions-list-container'] as Record<string, unknown> | undefined;
  
  if (viewport?.hasHorizontalScrollbar) {
    console.log('❌ ISSUE DETECTED: ScrollArea viewport has horizontal scrollbar');
    console.log(`   Viewport width: ${viewport.clientWidth}px`);
    console.log(`   Viewport scrollWidth: ${viewport.scrollWidth}px`);
    
    // Find the culprit
    if (contentWrapper) {
      const exceeds = (contentWrapper.scrollWidth as number) > (viewport.clientWidth as number);
      console.log(`\n   Content wrapper: ${exceeds ? 'EXCEEDS viewport' : 'fits within viewport'}`);
      console.log(`   Content wrapper width: ${contentWrapper.scrollWidth}px`);
    }
    
    if (sessionsContainer) {
      const exceeds = (sessionsContainer.scrollWidth as number) > (viewport.clientWidth as number);
      console.log(`\n   Sessions container: ${exceeds ? 'EXCEEDS viewport' : 'fits within viewport'}`);
      console.log(`   Sessions container width: ${sessionsContainer.scrollWidth}px`);
    }
    
    // Check viewport children
    const children = diagnostics['scrollarea-viewport-children'] as Array<Record<string, unknown>> | undefined;
    if (children) {
      console.log('\n   Viewport children analysis:');
      children.forEach(child => {
        if (child.exceedsViewport) {
          console.log(`   ❌ ${child.tagName}.${child.className} exceeds viewport by ${(child.scrollWidth as number) - (viewport.clientWidth as number)}px`);
        }
      });
    }
  } else {
    console.log('✅ No horizontal scrollbar detected in ScrollArea viewport');
  }

  // Verify key assertions
  if (viewport) {
    expect(viewport.hasHorizontalScrollbar).toBe(false);
  }
});
