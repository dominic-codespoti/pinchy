import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/chat');

// Wait for network idle and then some extra time for data to load
await page.waitForLoadState('networkidle');
await page.waitForTimeout(4000);

const m = await page.evaluate(() => {
  const scrollViewport = document.querySelector('[data-radix-scroll-area-viewport]');
  const wrapper = scrollViewport?.firstElementChild;
  
  // Find all clickable elements that might be session items
  // Session items are buttons with specific styling
  const allButtons = document.querySelectorAll('button');
  const sessionButtons = Array.from(allButtons).filter(btn => 
    btn.className.includes('rounded-md') || 
    btn.querySelector('p[class*="truncate"]')
  );
  
  return {
    sidebarWidth: document.querySelector('aside')?.offsetWidth || 
                  document.querySelector('[class*="w-72"]')?.offsetWidth,
    viewport: {
      clientWidth: scrollViewport?.clientWidth,
      scrollWidth: scrollViewport?.scrollWidth
    },
    wrapper: {
      offsetWidth: wrapper?.offsetWidth,
      scrollWidth: wrapper?.scrollWidth,
      minWidth: wrapper ? getComputedStyle(wrapper).minWidth : null
    },
    sessionCount: sessionButtons.length,
    firstSession: sessionButtons[0] ? {
      width: sessionButtons[0].offsetWidth,
      parentWidth: sessionButtons[0].parentElement?.offsetWidth,
      text: sessionButtons[0].textContent?.substring(0, 30)
    } : null,
    allButtonCount: allButtons.length,
    overflowGap: (wrapper?.scrollWidth || 0) - (scrollViewport?.clientWidth || 0),
    isClipping: wrapper && scrollViewport ? wrapper.scrollWidth > scrollViewport.clientWidth : null
  };
});

console.log(JSON.stringify(m, null, 2));

await browser.close();
