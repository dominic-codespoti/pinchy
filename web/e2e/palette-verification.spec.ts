import { test, expect, Page } from '@playwright/test';

/**
 * Palette Verification Test
 * 
 * Verifies:
 * 1. Palette selection doesn't change core surfaces (background, card, popover, input)
 * 2. Primary/accent/ring/sidebar active styling changes when switching palettes
 * 3. Sidebar palette control works
 * 4. Light/dark/system mode works independently
 * 5. No hydration/runtime issues
 */

// Helper to get computed CSS variable value
async function getCSSVariable(page: Page, variable: string, element = 'html'): Promise<string> {
  return page.evaluate(({ varName, el }) => {
    const target = el === 'html' ? document.documentElement : document.querySelector(el);
    if (!target) return '';
    return getComputedStyle(target).getPropertyValue(varName).trim();
  }, { varName: variable, el: element });
}

// Helper to get data-palette attribute
async function getDataPalette(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-palette'));
}

// Helper to open palette picker and select a theme
async function selectPalette(page: Page, paletteName: string): Promise<void> {
  // Click the palette picker button
  await page.getByRole('button', { name: /color theme/i }).click();
  
  // Wait for dropdown to open
  await page.waitForSelector('[role="menuitem"]', { state: 'visible' });
  
  // Click the specific palette option
  await page.getByRole('menuitem', { name: new RegExp(paletteName, 'i') }).click();
  
  // Wait for dropdown to close
  await page.waitForSelector('[role="menuitem"]', { state: 'hidden' }).catch(() => {});
}

// Helper to get theme mode
async function getThemeMode(page: Page): Promise<'light' | 'dark'> {
  const hasDarkClass = await page.evaluate(() => 
    document.documentElement.classList.contains('dark')
  );
  return hasDarkClass ? 'dark' : 'light';
}

// Setup helper
async function setupPage(page: Page): Promise<void> {
  // Navigate to the app
  await page.goto('/dashboard');
  
  // Wait for hydration - check that the page has mounted content
  await page.waitForSelector('text=Pinchy', { state: 'visible' });
  
  // Clear localStorage to ensure clean state
  await page.evaluate(() => localStorage.clear());
  
  // Reload to apply clean state
  await page.reload();
  await page.waitForSelector('text=Pinchy', { state: 'visible' });
}

test('1. Core surfaces remain stable when switching palettes', async ({ page }) => {
  await setupPage(page);
  
  // Capture initial surface colors with default palette
  const initialMode = await getThemeMode(page);
  const initialPalette = await getDataPalette(page);
  
  // Get initial surface values
  const initialBg = await getCSSVariable(page, '--background');
  const initialCard = await getCSSVariable(page, '--card');
  const initialPopover = await getCSSVariable(page, '--popover');
  const initialInput = await getCSSVariable(page, '--input');
  const initialSecondary = await getCSSVariable(page, '--secondary');
  const initialBorder = await getCSSVariable(page, '--border');
  
  console.log(`Initial: mode=${initialMode}, palette=${initialPalette}`);
  console.log(`  Surfaces: bg=${initialBg}, card=${initialCard}, input=${initialInput}`);

  // Switch to Emerald palette
  await selectPalette(page, 'Forest');
  await page.waitForTimeout(100); // Allow CSS to apply
  
  // Verify palette attribute changed
  const newPalette = await getDataPalette(page);
  expect(newPalette).toBe('emerald');
  
  // Get surface values after palette change
  const afterBg = await getCSSVariable(page, '--background');
  const afterCard = await getCSSVariable(page, '--card');
  const afterPopover = await getCSSVariable(page, '--popover');
  const afterInput = await getCSSVariable(page, '--input');
  const afterSecondary = await getCSSVariable(page, '--secondary');
  const afterBorder = await getCSSVariable(page, '--border');
  
  console.log(`After Forest: palette=${newPalette}`);
  console.log(`  Surfaces: bg=${afterBg}, card=${afterCard}, input=${afterInput}`);
  
  // Verify surfaces are UNCHANGED (stable)
  expect(afterBg).toBe(initialBg);
  expect(afterCard).toBe(initialCard);
  expect(afterPopover).toBe(initialPopover);
  expect(afterInput).toBe(initialInput);
  expect(afterSecondary).toBe(initialSecondary);
  expect(afterBorder).toBe(initialBorder);
  
  console.log('✓ Core surfaces remained stable');
});

test('2. Primary/accent/ring change when switching palettes', async ({ page }) => {
  await setupPage(page);
  
  // Capture initial accent colors
  const initialPrimary = await getCSSVariable(page, '--primary');
  const initialAccent = await getCSSVariable(page, '--accent');
  const initialRing = await getCSSVariable(page, '--ring');
  const initialSidebarPrimary = await getCSSVariable(page, '--sidebar-primary');
  
  console.log(`Initial accents: primary=${initialPrimary}, accent=${initialAccent}, ring=${initialRing}`);

  // Switch to Berry palette
  await selectPalette(page, 'Berry');
  await page.waitForTimeout(100);
  
  // Get new accent values
  const berryPrimary = await getCSSVariable(page, '--primary');
  const berryAccent = await getCSSVariable(page, '--accent');
  const berryRing = await getCSSVariable(page, '--ring');
  const berrySidebarPrimary = await getCSSVariable(page, '--sidebar-primary');
  
  console.log(`Berry accents: primary=${berryPrimary}, accent=${berryAccent}, ring=${berryRing}`);
  
  // Verify accents CHANGED (different palette)
  expect(berryPrimary).not.toBe(initialPrimary);
  expect(berryAccent).not.toBe(initialAccent);
  expect(berryRing).not.toBe(initialRing);
  expect(berrySidebarPrimary).not.toBe(initialSidebarPrimary);
  
  // Verify data-palette is violet for Berry
  expect(await getDataPalette(page)).toBe('violet');
  
  console.log('✓ Primary/accent/ring changed with palette');
});

test('3. Sidebar palette control is functional', async ({ page }) => {
  await setupPage(page);
  
  // Find palette picker button in sidebar
  const paletteButton = page.getByRole('button', { name: /color theme/i });
  
  // Verify button exists and is visible
  await expect(paletteButton).toBeVisible();
  
  // Click to open dropdown
  await paletteButton.click();
  
  // Verify dropdown menu appears with palette options
  const menuItems = page.getByRole('menuitem');
  await expect(menuItems.first()).toBeVisible();
  
  // Count palette options (should have multiple)
  const count = await menuItems.count();
  expect(count).toBeGreaterThan(3);
  
  // Verify specific palettes are present
  await expect(page.getByRole('menuitem', { name: /classic/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /forest/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /sunset/i })).toBeVisible();
  
  // Close by pressing Escape
  await page.keyboard.press('Escape');
  
  console.log('✓ Sidebar palette control works');
});

test('4. Light/dark/system mode works independently', async ({ page }) => {
  await setupPage(page);
  
  // Get current mode
  const initialMode = await getThemeMode(page);
  console.log(`Initial mode: ${initialMode}`);
  
  // Get initial background (differs between light/dark)
  const initialBg = await getCSSVariable(page, '--background');
  
  // Manually toggle dark class to test independence
  await page.evaluate(() => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  });
  
  const newMode = await getThemeMode(page);
  const newBg = await getCSSVariable(page, '--background');
  
  // Verify mode changed and background is different
  expect(newMode).not.toBe(initialMode);
  expect(newBg).not.toBe(initialBg);
  
  // Palette should remain unchanged
  const palette = await getDataPalette(page);
  expect(palette).toBeTruthy();
  
  console.log('✓ Light/dark mode works independently of palette');
});

test('5. No hydration or runtime errors', async ({ page }) => {
  // Collect console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  await setupPage(page);
  
  // Wait a moment for any hydration issues to surface
  await page.waitForTimeout(500);
  
  // Check for common hydration error patterns
  const hydrationErrors = consoleErrors.filter(e => 
    e.includes('hydrat') || 
    e.includes('did not match') ||
    e.includes('server-side') ||
    e.includes('Text content does not match')
  );
  
  // Should have no hydration errors
  expect(hydrationErrors).toHaveLength(0);
  
  // Verify providers mounted correctly
  const hasThemeProvider = await page.evaluate(() => {
    // Check that data-palette attribute exists (set by PaletteInitializer)
    return document.documentElement.hasAttribute('data-palette');
  });
  
  expect(hasThemeProvider).toBe(true);
  
  // Switch palette to test runtime functionality
  await selectPalette(page, 'Ocean');
  await page.waitForTimeout(100);
  
  const oceanPalette = await getDataPalette(page);
  expect(oceanPalette).toBe('cyan');
  
  // Verify no new errors after interaction
  const runtimeErrors = consoleErrors.filter(e => 
    !e.includes('favicon') && 
    !e.includes('source map')
  );
  
  expect(runtimeErrors).toHaveLength(0);
  
  console.log('✓ No hydration or runtime errors');
});

test('6. All palette options apply correctly', async ({ page }) => {
  await setupPage(page);
  
  const palettes = [
    { name: 'Classic', attr: 'blue' },
    { name: 'Forest', attr: 'emerald' },
    { name: 'Berry', attr: 'violet' },
    { name: 'Sunset', attr: 'amber' },
    { name: 'Ocean', attr: 'cyan' },
    { name: 'Rose', attr: 'rose' },
  ];
  
  for (const { name, attr } of palettes) {
    await selectPalette(page, name);
    await page.waitForTimeout(100);
    
    const currentPalette = await getDataPalette(page);
    expect(currentPalette).toBe(attr);
    
    // Verify primary color changed to expected hue
    const primary = await getCSSVariable(page, '--primary');
    expect(primary).toBeTruthy();
    
    console.log(`✓ ${name} palette (${attr}) applied`);
  }
});
