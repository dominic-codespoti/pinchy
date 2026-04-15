import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(3000);

const m = await page.evaluate(() => {
  // Sidebar measurement
  const sidebar = document.querySelector('aside') || 
                  document.querySelector('[class*="w-72"]');
  
  // ScrollArea from Radix
  const scrollViewport = document.querySelector('[data-radix-scroll-area-viewport]');
  
  // The inner wrapper (first child of viewport)
  const wrapper = scrollViewport?.firstElementChild;
  
  // Session items / rows
  const rows = document.querySelectorAll('button[class*="rounded-md"]');
  const firstRow = rows[0];
  
  // Get computed styles for more detail
  const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
  const viewportStyle = scrollViewport ? getComputedStyle(scrollViewport) : null;
  const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
  
  return {
    sidebar: sidebar ? {
      offsetWidth: sidebar.offsetWidth,
      clientWidth: sidebar.clientWidth,
      computedWidth: sidebarStyle?.width,
      computedMinWidth: sidebarStyle?.minWidth,
      computedMaxWidth: sidebarStyle?.maxWidth
    } : null,
    scrollArea: scrollViewport ? {
      clientWidth: scrollViewport.clientWidth,
      scrollWidth: scrollViewport.scrollWidth,
      offsetWidth: scrollViewport.offsetWidth,
      computedWidth: viewportStyle?.width,
      computedOverflow: viewportStyle?.overflow
    } : null,
    wrapper: wrapper ? {
      offsetWidth: wrapper.offsetWidth,
      clientWidth: wrapper.clientWidth,
      scrollWidth: wrapper.scrollWidth,
      computedWidth: wrapperStyle?.width,
      computedMinWidth: wrapperStyle?.minWidth,
      computedMaxWidth: wrapperStyle?.maxWidth,
      tagName: wrapper.tagName
    } : null,
    sessions: {
      count: rows.length,
      firstRow: firstRow ? {
        offsetWidth: firstRow.offsetWidth,
        scrollWidth: firstRow.scrollWidth
      } : null
    },
    overflowGap: (wrapper?.scrollWidth || 0) - (scrollViewport?.clientWidth || 0),
    hasOverflow: wrapper && scrollViewport ? wrapper.scrollWidth > scrollViewport.clientWidth : null
  };
});

console.log(JSON.stringify(m, null, 2));

await browser.close();
