import { test, expect } from '@playwright/test';

/**
 * Theme Palette Feature Verification
 * 
 * Tests:
 * - Sidebar footer shows ThemeSwitcher and ThemePalettePicker side by side
 * - Mobile sheet footer also shows both controls
 * - Palette menu opens and shows predefined theme options
 * - Selecting a theme changes CSS variables
 * - Light/dark/system mode switching works with selected palette
 * - Palette selection persists across navigation
 * - /settings/appearance exposes the picker cleanly
 */

// Helper to setup page
async function setupPage(page: any) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

test('sidebar footer shows ThemeSwitcher and ThemePalettePicker side by side', async ({ page }) => {
  await setupPage(page);
  
  // Verify ThemeSwitcher button (Sun icon) exists and is visible
  const themeSwitcher = page.locator('button[aria-label="Toggle theme"]').first();
  await expect(themeSwitcher).toBeVisible();
  
  // Verify ThemePalettePicker button (Palette icon) exists and is visible
  const palettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await expect(palettePicker).toBeVisible();
  
  // Verify they are in the same parent container (side by side)
  const controlsContainer = themeSwitcher.locator('..');
  const siblingPicker = controlsContainer.locator('button[aria-label="Choose color theme"]');
  await expect(siblingPicker).toBeVisible();
  
  // Verify computed styles show flex layout for side-by-side
  const containerStyles = await controlsContainer.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el);
    return {
      display: styles.display,
      flexDirection: styles.flexDirection,
      gap: styles.gap,
    };
  });
  
  expect(containerStyles.display).toBe('flex');
  expect(['row', 'row-reverse']).toContain(containerStyles.flexDirection);
});

test('mobile sheet footer shows both theme controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Open mobile menu
  const menuButton = page.locator('button[aria-label="Open navigation menu"]').first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await page.waitForTimeout(500);
  
  // Check for sheet content with open state
  const sheetContent = page.locator('[data-state="open"]').first();
  await expect(sheetContent).toBeVisible();
  
  // Verify both controls exist within the mobile sheet (check count, not visibility within hidden elements)
  const mobileThemeSwitchers = page.locator('button[aria-label="Toggle theme"]');
  const mobilePalettePickers = page.locator('button[aria-label="Choose color theme"]');
  
  // Should have at least 2 of each (desktop + mobile sheet)
  expect(await mobileThemeSwitchers.count()).toBeGreaterThanOrEqual(2);
  expect(await mobilePalettePickers.count()).toBeGreaterThanOrEqual(2);
  
  // Verify the sheet-specific ones are present by checking they're in the border-t section
  const sheetFooter = page.locator('.border-t:has(button[aria-label="Toggle theme"])').first();
  const hasThemeSwitcher = await sheetFooter.locator('button[aria-label="Toggle theme"]').count() > 0;
  const hasPalettePicker = await sheetFooter.locator('button[aria-label="Choose color theme"]').count() > 0;
  
  expect(hasThemeSwitcher).toBe(true);
  expect(hasPalettePicker).toBe(true);
  
  // Close the sheet
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

test('palette menu shows predefined theme options', async ({ page }) => {
  await setupPage(page);
  
  // Open the palette picker
  const palettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await palettePicker.click();
  await page.waitForTimeout(300);
  
  // Verify dropdown menu is open with theme options
  const menuContent = page.locator('[role="menu"], .dropdown-menu-content').first();
  await expect(menuContent).toBeVisible();
  
  // Check for menu label
  const menuLabel = page.locator('text=Color Theme').first();
  await expect(menuLabel).toBeVisible();
  
  // Verify predefined theme options are shown
  // Based on theme-presets.ts: Classic, Slate, Midnight, Forest, Ocean, Sunset, Berry, Monochrome
  const expectedThemes = ['Classic', 'Slate', 'Midnight', 'Forest', 'Ocean', 'Sunset', 'Berry', 'Monochrome'];
  
  for (const themeName of expectedThemes) {
    const themeOption = page.locator(`text=${themeName}`).first();
    const isVisible = await themeOption.isVisible().catch(() => false);
    expect(isVisible, `Theme option "${themeName}" should be visible`).toBe(true);
  }
  
  // Close the menu
  await page.keyboard.press('Escape');
});

test('selecting a theme changes CSS variable values', async ({ page }) => {
  await setupPage(page);
  
  // Get initial primary color value
  const initialPrimary = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  // Open palette picker
  const palettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await palettePicker.click();
  await page.waitForTimeout(300);
  
  // Select a different theme (Forest - green hue)
  const forestOption = page.locator('text=Forest').first();
  await forestOption.click();
  await page.waitForTimeout(500);
  
  // Get new primary color value
  const newPrimary = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  // Verify primary color changed
  expect(newPrimary).not.toBe(initialPrimary);
  expect(newPrimary.length).toBeGreaterThan(0);
  
  // Verify --primary is an OKLCH color (format: oklch(...))
  expect(newPrimary.startsWith('oklch')).toBe(true);
  
  // Check that accent color also updated
  const newAccent = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  });
  expect(newAccent.startsWith('oklch')).toBe(true);
  
  // Verify button primary color computed style
  const buttonColor = await page.evaluate(() => {
    const btn = document.querySelector('button[class*="primary"]') || document.querySelector('button');
    if (!btn) return null;
    return getComputedStyle(btn).backgroundColor;
  });
  expect(buttonColor).not.toBeNull();
});

test('light/dark/system mode switching works with selected palette', async ({ page }) => {
  await setupPage(page);
  
  // Select a specific theme first
  const palettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await palettePicker.click();
  await page.waitForTimeout(300);
  
  const berryOption = page.locator('text=Berry').first();
  await berryOption.click();
  await page.waitForTimeout(500);
  
  // Open theme switcher
  const themeSwitcher = page.locator('button[aria-label="Toggle theme"]').first();
  await themeSwitcher.click();
  await page.waitForTimeout(300);
  
  // Switch to light mode
  const lightOption = page.locator('text=Light').first();
  await lightOption.click();
  await page.waitForTimeout(500);
  
  // Get primary in light mode
  const lightPrimary = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  // Switch to dark mode
  await themeSwitcher.click();
  await page.waitForTimeout(300);
  const darkOption = page.locator('text=Dark').first();
  await darkOption.click();
  await page.waitForTimeout(500);
  
  // Get primary in dark mode
  const darkPrimary = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  // Light and dark should have different values for the same palette
  expect(lightPrimary).not.toBe(darkPrimary);
  
  // Both should be valid OKLCH colors
  expect(lightPrimary.startsWith('oklch')).toBe(true);
  expect(darkPrimary.startsWith('oklch')).toBe(true);
});

test('selected palette persists across navigation', async ({ page }) => {
  await setupPage(page);
  
  // Select a specific theme
  const palettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await palettePicker.click();
  await page.waitForTimeout(300);
  
  const oceanOption = page.locator('text=Ocean').first();
  await oceanOption.click();
  await page.waitForTimeout(500);
  
  // Get primary color after selection
  const oceanPrimaryBeforeNav = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  // Navigate to a different page
  await page.goto('/agents');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Verify primary color persists
  const oceanPrimaryAfterNav = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  expect(oceanPrimaryAfterNav).toBe(oceanPrimaryBeforeNav);
  
  // Reload the page
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Verify primary color persists after reload
  const oceanPrimaryAfterReload = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  });
  
  expect(oceanPrimaryAfterReload).toBe(oceanPrimaryBeforeNav);
});

test('/settings/appearance exposes the picker cleanly', async ({ page }) => {
  await page.goto('/settings/appearance');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Verify page has Theme section
  const themeHeading = page.locator('text=Theme').first();
  await expect(themeHeading).toBeVisible();
  
  // Verify light/dark/system buttons exist
  const lightButton = page.locator('button:has-text("Light")').first();
  const darkButton = page.locator('button:has-text("Dark")').first();
  const systemButton = page.locator('button:has-text("System")').first();
  
  await expect(lightButton).toBeVisible();
  await expect(darkButton).toBeVisible();
  await expect(systemButton).toBeVisible();
  
  // Verify Color Palette section exists
  const colorPaletteHeading = page.locator('text=Color Palette').first();
  await expect(colorPaletteHeading).toBeVisible();
  
  // Verify description text
  const paletteDescription = page.locator('text=Choose a color theme for the UI accents and highlights').first();
  await expect(paletteDescription).toBeVisible();
  
  // Verify ThemePalettePicker component is present
  const appearancePalettePicker = page.locator('button[aria-label="Choose color theme"]').first();
  await expect(appearancePalettePicker).toBeVisible();
  
  // Verify helper text
  const helperText = page.locator('text=Click to open the color theme picker').first();
  await expect(helperText).toBeVisible();
  
  // Open picker and verify themes are shown
  await appearancePalettePicker.click();
  await page.waitForTimeout(300);
  
  // Verify at least one curated theme is visible
  const classicTheme = page.locator('text=Classic').first();
  await expect(classicTheme).toBeVisible();
  
  // Close the menu
  await page.keyboard.press('Escape');
});
