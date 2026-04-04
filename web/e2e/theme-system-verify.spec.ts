import { test, expect, Page } from '@playwright/test';

/**
 * Theme System Live Verification
 *
 * Verifies the updated theme system behavior using text-only/DOM/computed-style checks:
 * 1. 'No theme' + Light mode -> original monochrome (no data-palette attribute)
 * 2. 'No theme' + Dark mode -> original monochrome dark
 * 3. Palette + Neutral surface -> accents themed, surfaces stable
 * 4. Palette + Tinted/Soft/Contrast -> cards/sidebar/borders palette-aware
 * 5. Background remains stable
 * 6. State persists across reload/navigation
 * 7. /settings/appearance copy and controls reflect the new model
 */

// Helper to get CSS variable value
async function getCssVar(page: Page, varName: string): Promise<string> {
  return await page.evaluate((name: string) => {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }, varName);
}

// Helper to get attribute from html element
async function getHtmlAttr(page: Page, attr: string): Promise<string | null> {
  return await page.evaluate((attribute: string) => {
    return document.documentElement.getAttribute(attribute);
  }, attr);
}

// Reset theme state
async function resetTheme(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('pinchy-palette-v1');
    localStorage.removeItem('pinchy-surface-v1');
    localStorage.removeItem('theme');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

// Select a palette
async function selectPalette(page: Page, paletteName: string) {
  const picker = page.locator('button[aria-label="Choose color theme"]').first();
  await picker.click();
  await page.waitForTimeout(300);
  const option = page.locator(`text=${paletteName}`).first();
  await option.click();
  await page.waitForTimeout(400);
}

// Select "No theme"
async function selectNoTheme(page: Page) {
  const picker = page.locator('button[aria-label="Choose color theme"]').first();
  await picker.click();
  await page.waitForTimeout(400);
  // Look for "No theme" in dropdown menu
  const noThemeOption = page.getByRole('menuitem').filter({ hasText: /No theme/ }).first();
  await expect(noThemeOption, 'No theme option should be visible').toBeVisible({ timeout: 3000 });
  await noThemeOption.click();
  await page.waitForTimeout(400);
}

// Set light/dark/system mode
async function setMode(page: Page, mode: 'light' | 'dark' | 'system') {
  const switcher = page.locator('button[aria-label="Toggle theme"]').first();
  await switcher.click();
  await page.waitForTimeout(300);
  const option = page.locator(`text=${mode.charAt(0).toUpperCase() + mode.slice(1)}`).first();
  await option.click();
  await page.waitForTimeout(400);
}

// Set surface style by navigating directly with URL params
async function setSurface(page: Page, style: string) {
  await page.evaluate((s: string) => {
    localStorage.setItem('pinchy-surface-v1', s);
    document.documentElement.setAttribute('data-surface', s);
  }, style);
  await page.waitForTimeout(200);
}

// ============================================================================
// TEST 1: 'No theme' + Light mode -> original monochrome (no data-palette)
// ============================================================================
test('Scenario 1: No theme + Light mode', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectNoTheme(page);
  await setMode(page, 'light');

  // Verify: no data-palette attribute
  const dataPalette = await getHtmlAttr(page, 'data-palette');
  expect(dataPalette, 'data-palette should be null').toBeNull();

  // Verify: monochrome colors (dark primary in light mode)
  const primary = await getCssVar(page, '--primary');
  const background = await getCssVar(page, '--background');

  expect(primary, 'Primary should be dark neutral').toContain('10%'); // 240 5.9% 10%
  expect(background, 'Background should be white').toContain('100%'); // 0 0% 100%
});

// ============================================================================
// TEST 2: 'No theme' + Dark mode -> original monochrome dark
// ============================================================================
test('Scenario 2: No theme + Dark mode', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectNoTheme(page);
  await setMode(page, 'dark');

  // Verify: no data-palette attribute
  const dataPalette = await getHtmlAttr(page, 'data-palette');
  expect(dataPalette, 'data-palette should be null').toBeNull();

  // Verify: monochrome colors (light primary in dark mode)
  const primary = await getCssVar(page, '--primary');
  const background = await getCssVar(page, '--background');

  expect(primary, 'Primary should be light neutral').toContain('98%'); // 0 0% 98%
  expect(background, 'Background should be dark').toContain('3.9%'); // 240 10% 3.9%
});

// ============================================================================
// TEST 3: Palette + Neutral surface -> accents themed, surfaces stable
// ============================================================================
test('Scenario 3: Palette + Neutral surface', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectPalette(page, 'Forest');
  await setSurface(page, 'neutral');

  // Verify: data-palette is emerald for Forest
  const dataPalette = await getHtmlAttr(page, 'data-palette');
  expect(dataPalette, 'data-palette should be emerald').toBe('emerald');

  // Verify: data-surface is neutral
  const dataSurface = await getHtmlAttr(page, 'data-surface');
  expect(dataSurface, 'data-surface should be neutral').toBe('neutral');

  // Verify: primary is green (emerald ~160 hue)
  const primary = await getCssVar(page, '--primary');
  expect(primary, 'Primary should be emerald green').toContain('160');

  // Verify: background stays stable (white in light mode)
  const background = await getCssVar(page, '--background');
  expect(background, 'Background should be stable white').toContain('100%');
});

// ============================================================================
// TEST 4: Palette + Tinted/Soft/Contrast -> cards/sidebar/borders palette-aware
// ============================================================================
test('Scenario 4a: Palette + Tinted surface', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectPalette(page, 'Berry');
  await setMode(page, 'light');

  // Set tinted surface directly
  await setSurface(page, 'tinted');

  // Verify data-surface is tinted
  const dataSurface = await getHtmlAttr(page, 'data-surface');
  expect(dataSurface, 'data-surface should be tinted').toBe('tinted');

  // Verify palette is violet
  const dataPalette = await getHtmlAttr(page, 'data-palette');
  expect(dataPalette, 'data-palette should be violet').toBe('violet');

  // Verify card uses palette hue variable (tinted mode)
  // When resolved, Berry (violet) palette has hue 262
  const card = await getCssVar(page, '--card');
  const paletteHue = await getCssVar(page, '--palette-hue');
  expect(paletteHue, 'Palette hue should be 262 for violet').toBe('262');
  // Card should be tinted with the palette hue (262) at ~97% lightness
  expect(card, 'Tinted card should have violet hue (262)').toContain('262');
});

test('Scenario 4b: Palette + Soft surface', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectPalette(page, 'Ocean');
  await setMode(page, 'light');
  await setSurface(page, 'soft');

  const dataSurface = await getHtmlAttr(page, 'data-surface');
  expect(dataSurface, 'data-surface should be soft').toBe('soft');

  // Soft surface: cards are white (100%)
  const card = await getCssVar(page, '--card');
  expect(card, 'Soft card should be white').toContain('100%');
});

test('Scenario 4c: Palette + Contrast surface', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await selectPalette(page, 'Sunset');
  await setMode(page, 'light');
  await setSurface(page, 'contrast');

  const dataSurface = await getHtmlAttr(page, 'data-surface');
  expect(dataSurface, 'data-surface should be contrast').toBe('contrast');

  // Contrast uses palette hue - Sunset (amber) has hue 38
  const border = await getCssVar(page, '--border');
  const paletteHue = await getCssVar(page, '--palette-hue');
  expect(paletteHue, 'Palette hue should be 38 for amber').toBe('38');
  expect(border, 'Border should have amber hue (38)').toContain('38');
});

// ============================================================================
// TEST 5: Background remains stable
// ============================================================================
test('Scenario 5: Background remains stable', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);
  await setMode(page, 'light');

  const baselineBg = await getCssVar(page, '--background');

  // Test multiple palettes with neutral surface
  const palettes = ['Classic', 'Berry', 'Forest', 'Ocean'];
  for (const palette of palettes) {
    await selectPalette(page, palette);
    await setSurface(page, 'neutral');
    await page.waitForTimeout(200);

    const bg = await getCssVar(page, '--background');
    expect(bg, `Background stable with ${palette}`).toBe(baselineBg);
  }

  // Test with tinted surface
  await selectPalette(page, 'Berry');
  await setSurface(page, 'tinted');
  const tintedBg = await getCssVar(page, '--background');
  // Background should still be ~100% in light mode
  expect(tintedBg, 'Background stable with tinted').toContain('100%');
});

// ============================================================================
// TEST 6: State persists across reload/navigation
// ============================================================================
test('Scenario 6: State persists across reload and navigation', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);

  // Set theme state
  await selectPalette(page, 'Berry');
  await setSurface(page, 'tinted');
  await setMode(page, 'dark');

  // Capture state
  const paletteBefore = await getHtmlAttr(page, 'data-palette');
  const surfaceBefore = await getHtmlAttr(page, 'data-surface');
  const primaryBefore = await getCssVar(page, '--primary');

  // Navigate to agents page
  await page.goto('/agents');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Verify persistence after navigation
  expect(await getHtmlAttr(page, 'data-palette')).toBe(paletteBefore);
  expect(await getHtmlAttr(page, 'data-surface')).toBe(surfaceBefore);
  expect(await getCssVar(page, '--primary')).toBe(primaryBefore);

  // Reload
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  // Verify persistence after reload
  expect(await getHtmlAttr(page, 'data-palette')).toBe(paletteBefore);
  expect(await getHtmlAttr(page, 'data-surface')).toBe(surfaceBefore);
  // Primary should still have violet hue (262)
  const primaryAfter = await getCssVar(page, '--primary');
  expect(primaryAfter, 'Primary should be violet after reload').toContain('262');
});

// ============================================================================
// TEST 7: /settings/appearance copy and controls reflect new model
// ============================================================================
test('Scenario 7: /settings/appearance reflects new model', async ({ page }) => {
  await page.goto('/settings/appearance');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await resetTheme(page);

  // Verify sections exist (use broader selectors for CardTitle)
  await expect(page.locator('text=Theme').first()).toBeVisible();
  await expect(page.locator('text=Choose between light, dark, or system preference').first()).toBeVisible();

  // Light/Dark/System buttons (look for buttons containing the text)
  await expect(page.locator('button:has-text("Light")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Dark")').first()).toBeVisible();
  await expect(page.locator('button:has-text("System")').first()).toBeVisible();

  // Color Palette section
  await expect(page.locator('text=Color Palette').first()).toBeVisible();
  await expect(page.locator('text=Active color theme for accents and highlights').first()).toBeVisible();

  // Helper text
  await expect(page.locator('text=Use the color theme picker in the sidebar to change palettes').first()).toBeVisible();
  await expect(page.locator('text=Select "No theme" for a neutral, monochrome appearance').first()).toBeVisible();

  // Surface Style section
  await expect(page.locator('text=Surface Style').first()).toBeVisible();
  await expect(page.locator('text=Choose how surfaces and backgrounds are styled').first()).toBeVisible();

  // Surface buttons (look for buttons containing the text)
  await expect(page.locator('button:has-text("Neutral")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Tinted")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Soft")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Contrast")').first()).toBeVisible();

  // Test "No theme" state
  await selectNoTheme(page);
  await page.goto('/settings/appearance');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Should show "No theme"
  const noThemeText = page.locator('text=No theme').first();
  const isVisible = await noThemeText.isVisible().catch(() => false);
  expect(isVisible || await page.locator('text=Default monochrome appearance').first().isVisible().catch(() => false),
    'Should indicate no theme is active').toBe(true);
});

// ============================================================================
// Quick smoke tests
// ============================================================================
test('Smoke: App loads without theme errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Filter out hydration mismatches (not theme-related) and Radix ID differences
  const themeErrors = errors.filter(e => {
    const text = e.toLowerCase();
    // Skip hydration mismatch errors - these are React internals, not theme issues
    if (text.includes('hydrated but some attributes')) return false;
    if (text.includes('aria-controls')) return false;
    if (text.includes('didn\'t match')) return false;
    return text.includes('theme') ||
           text.includes('palette') ||
           text.includes('color') ||
           text.includes('css');
  });

  expect(themeErrors, `Theme errors: ${themeErrors.join(', ')}`).toHaveLength(0);
});

test('Smoke: Theme controls accessible in sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Both controls visible
  await expect(page.locator('button[aria-label="Toggle theme"]').first()).toBeVisible();
  await expect(page.locator('button[aria-label="Choose color theme"]').first()).toBeVisible();
});
