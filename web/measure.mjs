import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(2500);

const m = await page.evaluate(() => {
  const sidebar = document.querySelector('aside, [class*="sidebar"]') || 
                  document.querySelector('[class*="w-72"]');
  const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
  const rows = document.querySelectorAll('[class*="group"], [class*="session-row"]');
  const firstRow = rows[0];
  const wrapper = scrollArea?.firstElementChild;
  
  return {
    sidebarWidth: sidebar?.offsetWidth,
    viewportWidth: scrollArea?.clientWidth,
    viewportScrollWidth: scrollArea?.scrollWidth,
    wrapperWidth: wrapper?.offsetWidth,
    wrapperScrollWidth: wrapper?.scrollWidth,
    rowWidth: firstRow?.offsetWidth,
    rowScrollWidth: firstRow?.scrollWidth,
    overflowGap: (wrapper?.scrollWidth || 0) - (scrollArea?.clientWidth || 0)
  };
});

console.log(JSON.stringify(m, null, 2));

await browser.close();
