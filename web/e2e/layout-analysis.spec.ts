import { test, expect } from '@playwright/test';

/**
 * Detailed layout analysis: Check scrollbar, actual widths
 */

test('Layout analysis - scrollbar and widths', async ({ page }) => {
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const analysis = await page.evaluate(() => {
    const sidebar = document.querySelector('.flex.h-full.flex-col');
    if (!sidebar) return { error: 'Sidebar not found' };

    // Get ScrollArea elements
    const scrollAreaRoot = sidebar.querySelector('[data-radix-scroll-area-viewport]')?.parentElement;
    const scrollAreaViewport = sidebar.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    const scrollAreaContent = scrollAreaViewport?.firstElementChild as HTMLElement;

    // Get the sessions container
    const sessionsContainer = sidebar.querySelector('.flex.min-w-0.flex-col.gap-1') as HTMLElement;

    // Get a session button
    const sessionButton = sidebar.querySelector('button[class*="rounded-md px-2 py-2"]') as HTMLElement;

    // Get computed dimensions
    const sidebarRect = sidebar.getBoundingClientRect();
    const viewportRect = scrollAreaViewport?.getBoundingClientRect();
    const contentRect = scrollAreaContent?.getBoundingClientRect();
    const sessionsRect = sessionsContainer?.getBoundingClientRect();
    const buttonRect = sessionButton?.getBoundingClientRect();

    // Check for horizontal scrollbar
    const hasHorizontalScrollbar = scrollAreaViewport ?
      scrollAreaViewport.scrollWidth > scrollAreaViewport.clientWidth : false;

    // Check ScrollArea content wrapper
    const contentWrapper = scrollAreaViewport?.querySelector(':scope > div') as HTMLElement;
    const contentWrapperWidth = contentWrapper?.getBoundingClientRect().width;

    return {
      sidebar: {
        width: Math.round(sidebarRect.width),
        class: sidebar.className.substring(0, 100),
      },
      scrollArea: {
        rootExists: !!scrollAreaRoot,
        viewportExists: !!scrollAreaViewport,
        viewportWidth: viewportRect ? Math.round(viewportRect.width) : null,
        viewportScrollWidth: scrollAreaViewport?.scrollWidth,
        viewportClientWidth: scrollAreaViewport?.clientWidth,
        hasHorizontalScrollbar,
      },
      scrollContent: {
        contentExists: !!scrollAreaContent,
        contentWidth: contentRect ? Math.round(contentRect.width) : null,
        contentScrollWidth: scrollAreaContent?.scrollWidth,
        contentClientWidth: scrollAreaContent?.clientWidth,
      },
      contentWrapper: {
        wrapperWidth: contentWrapperWidth ? Math.round(contentWrapperWidth) : null,
      },
      sessionsContainer: {
        exists: !!sessionsContainer,
        width: sessionsRect ? Math.round(sessionsRect.width) : null,
        class: sessionsContainer?.className,
      },
      sessionButton: {
        exists: !!sessionButton,
        width: buttonRect ? Math.round(buttonRect.width) : null,
        class: sessionButton?.className.substring(0, 100),
      },
    };
  });

  console.log('=== LAYOUT ANALYSIS ===');
  console.log(JSON.stringify(analysis, null, 2));

  if ('error' in analysis) {
    throw new Error(analysis.error);
  }

  // Check for horizontal scrollbar issue
  if (analysis.scrollArea.hasHorizontalScrollbar) {
    console.log('\n⚠️  Horizontal scrollbar detected - content is wider than viewport!');
  } else {
    console.log('\n✓ No horizontal scrollbar - content fits within viewport');
  }

  expect(analysis.scrollArea.hasHorizontalScrollbar).toBe(false);
});
