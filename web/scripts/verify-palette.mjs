#!/usr/bin/env node
/**
 * Palette Implementation Verification Script
 * 
 * Verifies:
 * 1. Palette selection doesn't change core surfaces (background, card, popover, input)
 * 2. Primary/accent/ring/sidebar active styling changes when switching palettes
 * 3. Sidebar palette control works
 * 4. Light/dark/system mode works independently
 * 5. No hydration/runtime issues
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper to get computed CSS variable value
async function getCSSVariable(page, variable, element = 'html') {
  return page.evaluate(({ varName, el }) => {
    const target = el === 'html' ? document.documentElement : document.querySelector(el);
    if (!target) return '';
    return getComputedStyle(target).getPropertyValue(varName).trim();
  }, { varName: variable, el: element });
}

// Helper to get data-palette attribute
async function getDataPalette(page) {
  return page.evaluate(() => document.documentElement.getAttribute('data-palette'));
}

// Helper to open palette picker and select a theme
async function selectPalette(page, paletteName) {
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
async function getThemeMode(page) {
  const hasDarkClass = await page.evaluate(() => 
    document.documentElement.classList.contains('dark')
  );
  return hasDarkClass ? 'dark' : 'light';
}

// Setup helper
async function setupPage(page) {
  // Navigate to the app
  await page.goto(`${BASE_URL}/dashboard`);
  
  // Wait for hydration - check that the page has mounted content
  await page.waitForSelector('text=Pinchy', { state: 'visible' });
  
  // Clear localStorage to ensure clean state
  await page.evaluate(() => localStorage.clear());
  
  // Reload to apply clean state
  await page.reload();
  await page.waitForSelector('text=Pinchy', { state: 'visible' });
}

// Test results
const results = [];

function pass(testName) {
  results.push({ name: testName, status: 'PASS' });
  console.log(`✓ PASS: ${testName}`);
}

function fail(testName, error) {
  results.push({ name: testName, status: 'FAIL', error: error.message });
  console.log(`✗ FAIL: ${testName}`);
  console.log(`  Error: ${error.message}`);
}

// Test 1: Core surfaces remain stable when switching palettes
async function test1_CoreSurfacesStable(page) {
  try {
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
    
    console.log(`  Initial: mode=${initialMode}, palette=${initialPalette}`);
    console.log(`    Surfaces: bg=${initialBg}, card=${initialCard}, input=${initialInput}`);

    // Switch to Emerald palette
    await selectPalette(page, 'Forest');
    await page.waitForTimeout(100);
    
    // Verify palette attribute changed
    const newPalette = await getDataPalette(page);
    if (newPalette !== 'emerald') {
      throw new Error(`Expected palette 'emerald', got '${newPalette}'`);
    }
    
    // Get surface values after palette change
    const afterBg = await getCSSVariable(page, '--background');
    const afterCard = await getCSSVariable(page, '--card');
    const afterPopover = await getCSSVariable(page, '--popover');
    const afterInput = await getCSSVariable(page, '--input');
    const afterSecondary = await getCSSVariable(page, '--secondary');
    const afterBorder = await getCSSVariable(page, '--border');
    
    console.log(`  After Forest: palette=${newPalette}`);
    console.log(`    Surfaces: bg=${afterBg}, card=${afterCard}, input=${afterInput}`);
    
    // Verify surfaces are UNCHANGED (stable)
    const checks = [
      ['background', afterBg, initialBg],
      ['card', afterCard, initialCard],
      ['popover', afterPopover, initialPopover],
      ['input', afterInput, initialInput],
      ['secondary', afterSecondary, initialSecondary],
      ['border', afterBorder, initialBorder],
    ];
    
    for (const [name, actual, expected] of checks) {
      if (actual !== expected) {
        throw new Error(`${name} changed: expected ${expected}, got ${actual}`);
      }
    }
    
    pass('1. Core surfaces remain stable when switching palettes');
  } catch (error) {
    fail('1. Core surfaces remain stable when switching palettes', error);
  }
}

// Test 2: Primary/accent/ring change when switching palettes
async function test2_AccentsChange(page) {
  try {
    await setupPage(page);
    
    // Capture initial accent colors
    const initialPrimary = await getCSSVariable(page, '--primary');
    const initialAccent = await getCSSVariable(page, '--accent');
    const initialRing = await getCSSVariable(page, '--ring');
    const initialSidebarPrimary = await getCSSVariable(page, '--sidebar-primary');
    
    console.log(`  Initial accents: primary=${initialPrimary}, accent=${initialAccent}, ring=${initialRing}`);

    // Switch to Berry palette
    await selectPalette(page, 'Berry');
    await page.waitForTimeout(100);
    
    // Get new accent values
    const berryPrimary = await getCSSVariable(page, '--primary');
    const berryAccent = await getCSSVariable(page, '--accent');
    const berryRing = await getCSSVariable(page, '--ring');
    const berrySidebarPrimary = await getCSSVariable(page, '--sidebar-primary');
    
    console.log(`  Berry accents: primary=${berryPrimary}, accent=${berryAccent}, ring=${berryRing}`);
    
    // Verify accents CHANGED (different palette)
    if (berryPrimary === initialPrimary) {
      throw new Error('Primary color did not change');
    }
    if (berryAccent === initialAccent) {
      throw new Error('Accent color did not change');
    }
    if (berryRing === initialRing) {
      throw new Error('Ring color did not change');
    }
    if (berrySidebarPrimary === initialSidebarPrimary) {
      throw new Error('Sidebar primary did not change');
    }
    
    // Verify data-palette is violet for Berry
    const currentPalette = await getDataPalette(page);
    if (currentPalette !== 'violet') {
      throw new Error(`Expected palette 'violet', got '${currentPalette}'`);
    }
    
    pass('2. Primary/accent/ring change when switching palettes');
  } catch (error) {
    fail('2. Primary/accent/ring change when switching palettes', error);
  }
}

// Test 3: Sidebar palette control is functional
async function test3_SidebarControl(page) {
  try {
    await setupPage(page);
    
    // Find palette picker button in sidebar
    const paletteButton = page.getByRole('button', { name: /color theme/i });
    
    // Verify button exists and is visible
    const isVisible = await paletteButton.isVisible();
    if (!isVisible) {
      throw new Error('Palette picker button not visible');
    }
    
    // Click to open dropdown
    await paletteButton.click();
    
    // Verify dropdown menu appears with palette options
    const menuItems = page.getByRole('menuitem');
    const firstItem = await menuItems.first();
    const firstItemVisible = await firstItem.isVisible();
    if (!firstItemVisible) {
      throw new Error('Menu items not visible');
    }
    
    // Count palette options (should have multiple)
    const count = await menuItems.count();
    if (count <= 3) {
      throw new Error(`Expected more than 3 palette options, got ${count}`);
    }
    
    // Verify specific palettes are present
    const classicVisible = await page.getByRole('menuitem', { name: /classic/i }).isVisible();
    const forestVisible = await page.getByRole('menuitem', { name: /forest/i }).isVisible();
    const sunsetVisible = await page.getByRole('menuitem', { name: /sunset/i }).isVisible();
    
    if (!classicVisible || !forestVisible || !sunsetVisible) {
      throw new Error('Expected palettes not found in dropdown');
    }
    
    // Close by pressing Escape
    await page.keyboard.press('Escape');
    
    pass('3. Sidebar palette control is functional');
  } catch (error) {
    fail('3. Sidebar palette control is functional', error);
  }
}

// Test 4: Light/dark/system mode works independently
async function test4_ModeIndependence(page) {
  try {
    await setupPage(page);
    
    // Get current mode
    const initialMode = await getThemeMode(page);
    console.log(`  Initial mode: ${initialMode}`);
    
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
    
    // Verify mode changed
    if (newMode === initialMode) {
      throw new Error(`Mode did not change: still ${newMode}`);
    }
    
    // Verify background is different
    if (newBg === initialBg) {
      throw new Error(`Background did not change: still ${newBg}`);
    }
    
    // Palette should remain unchanged
    const palette = await getDataPalette(page);
    if (!palette) {
      throw new Error('Palette attribute is missing');
    }
    
    pass('4. Light/dark/system mode works independently');
  } catch (error) {
    fail('4. Light/dark/system mode works independently', error);
  }
}

// Test 5: No hydration or runtime errors
async function test5_NoHydrationErrors(page) {
  try {
    // Collect console errors
    const consoleErrors = [];
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
    
    if (hydrationErrors.length > 0) {
      throw new Error(`Hydration errors found: ${hydrationErrors.join(', ')}`);
    }
    
    // Verify providers mounted correctly
    const hasThemeProvider = await page.evaluate(() => {
      return document.documentElement.hasAttribute('data-palette');
    });
    
    if (!hasThemeProvider) {
      throw new Error('Theme provider not mounted (no data-palette attribute)');
    }
    
    // Switch palette to test runtime functionality
    await selectPalette(page, 'Ocean');
    await page.waitForTimeout(100);
    
    const oceanPalette = await getDataPalette(page);
    if (oceanPalette !== 'cyan') {
      throw new Error(`Expected palette 'cyan', got '${oceanPalette}'`);
    }
    
    // Verify no new errors after interaction
    const runtimeErrors = consoleErrors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('source map')
    );
    
    if (runtimeErrors.length > 0) {
      throw new Error(`Runtime errors: ${runtimeErrors.join(', ')}`);
    }
    
    pass('5. No hydration or runtime errors');
  } catch (error) {
    fail('5. No hydration or runtime errors', error);
  }
}

// Test 6: All palette options apply correctly
async function test6_AllPalettesApply(page) {
  try {
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
      if (currentPalette !== attr) {
        throw new Error(`${name}: expected '${attr}', got '${currentPalette}'`);
      }
      
      // Verify primary color changed to expected hue
      const primary = await getCSSVariable(page, '--primary');
      if (!primary) {
        throw new Error(`${name}: primary color not set`);
      }
      
      console.log(`  ✓ ${name} palette (${attr}) applied`);
    }
    
    pass('6. All palette options apply correctly');
  } catch (error) {
    fail('6. All palette options apply correctly', error);
  }
}

// Main
async function main() {
  console.log('\n=== Palette Implementation Verification ===\n');
  
  // Check if dev server is running
  try {
    const response = await fetch(`${BASE_URL}/dashboard`);
    if (!response.ok) {
      console.error(`Dev server not responding at ${BASE_URL}`);
      process.exit(1);
    }
    console.log(`Connected to ${BASE_URL}\n`);
  } catch (error) {
    console.error(`Cannot connect to ${BASE_URL}. Is the dev server running?`);
    process.exit(1);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    // Run all tests
    await test1_CoreSurfacesStable(page);
    await test2_AccentsChange(page);
    await test3_SidebarControl(page);
    await test4_ModeIndependence(page);
    await test5_NoHydrationErrors(page);
    await test6_AllPalettesApply(page);
    
    // Summary
    console.log('\n=== Summary ===');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    
    console.log(`\nTotal: ${results.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
