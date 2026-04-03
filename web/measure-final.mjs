import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(3000);

const m = await page.evaluate(() => {
  const scrollViewport = document.querySelector('[data-radix-scroll-area-viewport]');
  const wrapper = scrollViewport?.firstElementChild;
  
  // Get all buttons in the scroll area (session items)
  const allButtons = wrapper?.querySelectorAll('button');
  const firstButton = allButtons?.[0];
  
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
    sessionRow: firstButton ? {
      offsetWidth: firstButton.offsetWidth,
      scrollWidth: firstButton.scrollWidth,
      parentWidth: firstButton.parentElement?.offsetWidth
    } : null,
    sessionCount: allButtons?.length || 0,
    overflowGap: (wrapper?.scrollWidth || 0) - (scrollViewport?.clientWidth || 0),
    isClipping: wrapper && scrollViewport ? wrapper.scrollWidth > scrollViewport.clientWidth : null
  };
});

console.log(JSON.stringify(m, null, 2));

await browser.close();
