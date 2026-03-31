import { test } from '@playwright/test';

test('detailed DOM inspection', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto('/agents/default');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const domInfo = await page.evaluate(() => {
    const main = document.querySelector('main');

    // Get ALL children of main (not just firstElementChild)
    const mainChildren = main ? Array.from(main.children).map((child, i) => ({
      index: i,
      tag: child.tagName,
      id: child.id,
      className: child.className,
      width: child.getBoundingClientRect().width,
      // First 100 chars of innerHTML
      htmlPreview: child.innerHTML.substring(0, 100).replace(/\n/g, ' ')
    })) : [];

    // Also find any element with max-w-7xl class
    const maxW7xlElements = Array.from(document.querySelectorAll('[class*="max-w-7xl"]')).map(el => ({
      tag: el.tagName,
      id: el.id,
      className: el.className,
      width: el.getBoundingClientRect().width,
      parentTag: el.parentElement?.tagName,
      parentClass: el.parentElement?.className?.substring(0, 50)
    }));

    // Full HTML of main for inspection
    const mainHtml = main?.outerHTML.substring(0, 500).replace(/\n/g, ' ');

    return { mainChildren, maxW7xlElements, mainHtml };
  });

  console.log('\n=== Main children ===');
  domInfo.mainChildren.forEach(child => {
    console.log(`[${child.index}] <${child.tag}> width=${child.width} classes="${child.className}"`);
    console.log(`     preview: ${child.htmlPreview}...`);
  });

  console.log('\n=== Elements with max-w-7xl ===');
  if (domInfo.maxW7xlElements.length === 0) {
    console.log('NO elements with max-w-7xl class found!');
  } else {
    domInfo.maxW7xlElements.forEach((el, i) => {
      console.log(`[${i}] <${el.tag}> width=${el.width}`);
      console.log(`     classes: ${el.className}`);
      console.log(`     parent: <${el.parentTag}> ${el.parentClass}`);
    });
  }

  console.log('\n=== Main HTML (first 500 chars) ===');
  console.log(domInfo.mainHtml);
});
