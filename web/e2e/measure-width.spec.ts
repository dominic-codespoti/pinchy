import { test } from '@playwright/test';

test('measure content widths', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Agent detail page
  await page.goto('/agents/default');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Measure the main content area width
  const mainWidth = await page.evaluate(() => {
    const main = document.querySelector('main');
    const mainInner = main?.firstElementChild;
    return {
      mainWidth: main?.getBoundingClientRect().width,
      mainClasses: main?.className,
      innerWidth: mainInner?.getBoundingClientRect().width,
      innerClasses: mainInner?.className,
      innerTag: mainInner?.tagName,
      // Check all ancestors of the first card
      ancestorChain: (() => {
        const card = document.querySelector('[class*="Card"], [class*="card"]') || document.querySelector('main')?.querySelector('div');
        const chain: { tag: string; width: number; classes: string }[] = [];
        let el = card;
        while (el && el.tagName !== 'HTML') {
          chain.push({
            tag: el.tagName,
            width: el.getBoundingClientRect().width,
            classes: el.className?.toString().substring(0, 200) || ''
          });
          el = el.parentElement;
        }
        return chain;
      })()
    };
  });

  console.log('Main element width:', mainWidth.mainWidth);
  console.log('Main classes:', mainWidth.mainClasses);
  console.log('Inner wrapper width:', mainWidth.innerWidth);
  console.log('Inner classes:', mainWidth.innerClasses);
  console.log('Inner tag:', mainWidth.innerTag);
  console.log('Ancestor chain:');
  mainWidth.ancestorChain?.forEach((a, i) => {
    console.log(`  ${i}: <${a.tag}> width=${a.width} classes="${a.classes}"`);
  });

  // Compare with agents list
  await page.goto('/agents');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const listWidth = await page.evaluate(() => {
    const main = document.querySelector('main');
    const mainInner = main?.firstElementChild;
    return {
      mainWidth: main?.getBoundingClientRect().width,
      innerWidth: mainInner?.getBoundingClientRect().width,
      innerClasses: mainInner?.className,
    };
  });

  console.log('\nAgents LIST:');
  console.log('Main width:', listWidth.mainWidth);
  console.log('Inner width:', listWidth.innerWidth);
  console.log('Inner classes:', listWidth.innerClasses);
});
