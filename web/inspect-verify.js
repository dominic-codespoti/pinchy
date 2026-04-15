const { chromium } = require('playwright');

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:3131/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== EXACT ELEMENT VERIFICATION ===\n');

  const data = await page.evaluate(() => {
    const btn = document.querySelector('.space-y-1 > button');
    if (!btn) return { error: 'Button not found' };

    const chain = [];
    let el = btn;
    for (let i = 0; i < 8 && el; i++) {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      chain.push({
        index: i,
        tag: el.tagName,
        class: el.className,
        id: el.id,
        rect: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y,
          right: rect.right,
        },
        computed: {
          width: cs.width,
          maxWidth: cs.maxWidth,
          minWidth: cs.minWidth,
          padding: cs.padding,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          margin: cs.margin,
          boxSizing: cs.boxSizing,
          flex: cs.flex,
          flexShrink: cs.flexShrink,
          flexGrow: cs.flexGrow,
          overflow: cs.overflow,
          overflowX: cs.overflowX,
        },
      });
      el = el.parentElement;
    }
    return { chain };
  });

  if (data.error) {
    console.log('Error:', data.error);
    await browser.close();
    return;
  }

  console.log('DOM CHAIN (button to root):');
  console.log('─'.repeat(70));

  for (const item of data.chain) {
    console.log(`\n[${item.index}] ${item.tag}${item.class ? '.' + item.class.split(' ').slice(0, 4).join('.') : ''}`);
    console.log(`    Bounding: ${item.rect.width.toFixed(1)}x${item.rect.height.toFixed(1)} at (${item.rect.x.toFixed(1)}, ${item.rect.y.toFixed(1)})`);
    console.log(`    Computed: ${item.computed.width} (max: ${item.computed.maxWidth})`);
    console.log(`    Padding: ${item.computed.padding}`);
    console.log(`    BoxSizing: ${item.computed.boxSizing}`);
    if (item.computed.flex && item.computed.flex !== '0 1 auto') {
      console.log(`    Flex: ${item.computed.flex}`);
    }
    if (item.computed.overflowX !== 'visible') {
      console.log(`    OverflowX: ${item.computed.overflowX}`);
    }
  }

  // Calculate where the mismatch happens
  console.log('\n' + '═'.repeat(70));
  console.log('WIDTH MISMATCH ANALYSIS:');

  const button = data.chain[0];
  const spaceY1 = data.chain[1]; // parent
  const p2Container = data.chain[2]; // grandparent .p-2
  const scrollViewport = data.chain.find(c => c.computed.overflowX === 'hidden');
  const sidebar = data.chain.find(c => c.tag === 'ASIDE');

  console.log(`\nButton actual width: ${button.rect.width.toFixed(2)}px`);
  console.log(`Button should be: w-full inside ${spaceY1?.rect.width.toFixed(2)}px parent`);
  console.log(`.p-2 container width: ${p2Container?.rect.width.toFixed(2)}px (includes 8px padding each side)`);
  console.log(`Scroll viewport width: ${scrollViewport?.rect.width.toFixed(2)}px`);
  console.log(`Sidebar width: ${sidebar?.rect.width.toFixed(2)}px`);

  const expectedMaxWidth = (scrollViewport?.rect.width || 287) - 16; // account for .p-2 padding
  console.log(`\nExpected max button width (scroll viewport - padding): ${expectedMaxWidth.toFixed(2)}px`);
  console.log(`Actual button width: ${button.rect.width.toFixed(2)}px`);
  console.log(`Overflow: ${(button.rect.width - expectedMaxWidth).toFixed(2)}px`);

  console.log('\n' + '═'.repeat(70));
  console.log('FINDING:');
  console.log('The button with w-full expands to fill its parent (.space-y-1),');
  console.log('which is inside .p-2. The .p-2 container is wider than the scroll');
  console.log('viewport (due to being a flex child), but the scroll viewport has');
  console.log('overflow:hidden, clipping anything that extends beyond 287px.');

  await browser.close();
}

verify().catch(console.error);
