import { test, expect } from '@playwright/test';

/**
 * Debug: Inspect actual session item DOM structure
 */

test('Debug session item structure', async ({ page }) => {
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  type StructureResult = 
    | { error: string }
    | Array<{
        index: number;
        buttonClasses: string;
        buttonWidth: number;
        innerHTML: string;
        textStructure: {
          titleClasses?: string;
          parentTag?: string;
          parentClasses?: string;
          grandparentTag?: string;
          grandparentClasses?: string;
        };
      }>;

  const structure: StructureResult = await page.evaluate(() => {
    const sidebar = document.querySelector('.flex.h-full.flex-col');
    if (!sidebar) return { error: 'Sidebar not found' };

    // Find all session buttons
    const buttons = Array.from(sidebar.querySelectorAll('button')).filter(btn => {
      return btn.querySelector('.truncate') || 
             btn.querySelector('p[class*="truncate"]') ||
             btn.querySelector('p');
    });

    return buttons.slice(0, 4).map((btn, idx) => {
      const titleEl = btn.querySelector('.truncate') || btn.querySelector('p');
      const parent = titleEl?.parentElement;
      const grandparent = parent?.parentElement;

      return {
        index: idx,
        buttonClasses: btn.className,
        buttonWidth: btn.getBoundingClientRect().width,
        innerHTML: btn.innerHTML.substring(0, 500),
        textStructure: {
          titleClasses: titleEl?.className,
          parentTag: parent?.tagName,
          parentClasses: parent?.className,
          grandparentTag: grandparent?.tagName,
          grandparentClasses: grandparent?.className,
        }
      };
    });
  });

  if ('error' in structure) {
    throw new Error(structure.error);
  }

  console.log('=== SESSION ITEM DOM STRUCTURE ===\n');
  for (const item of structure) {
    console.log(`Session ${item.index}:`);
    console.log(`  Button classes: ${item.buttonClasses}`);
    console.log(`  Button width: ${Math.round(item.buttonWidth)}px`);
    console.log(`  Text structure:`, JSON.stringify(item.textStructure, null, 2));
    console.log(`  Inner HTML preview: ${item.innerHTML.substring(0, 200)}...\n`);
  }

  expect(structure.length).toBeGreaterThan(0);
});
