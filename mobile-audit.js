#!/usr/bin/env node
const { chromium } = require('playwright');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3131';

async function auditMobile() {
  console.log('Mobile Layout Audit\n');
  
  const browser = await chromium.launch({ headless: true });
  
  // iPhone SE viewport
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
  });
  
  const page = await context.newPage();
  
  const routes = ['/dashboard', '/sessions', '/agents', '/logs', '/commands'];
  
  for (const route of routes) {
    console.log(`\n--- ${route} (Mobile) ---`);
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      
      const issues = await page.evaluate(() => {
        const results = [];
        const bodyWidth = document.body.scrollWidth;
        const viewportWidth = window.innerWidth;
        
        // Check horizontal overflow
        if (bodyWidth > viewportWidth + 10) {
          results.push(`Body overflow: ${bodyWidth}px > ${viewportWidth}px viewport`);
        }
        
        // Check specific elements
        const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (rect.width > viewportWidth + 5) {
            results.push(`Card overflow: ${rect.width.toFixed(0)}px wide`);
            break;
          }
        }
        
        // Check tables
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rect = table.getBoundingClientRect();
          if (rect.width > viewportWidth - 20) {
            results.push(`Table overflow: ${rect.width.toFixed(0)}px (needs horizontal scroll)`);
          }
        }
        
        // Check for cramped buttons
        const buttons = document.querySelectorAll('button');
        let crampedCount = 0;
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          const rect = btn.getBoundingClientRect();
          // Check if button text is very cramped
          if (text.length > 15 && rect.width < 120) {
            crampedCount++;
          }
        }
        if (crampedCount > 0) {
          results.push(`${crampedCount} buttons with cramped text`);
        }
        
        return results;
      });
      
      if (issues.length === 0) {
        console.log('  ✓ No major mobile layout issues');
      } else {
        for (const issue of issues) {
          console.log(`  ⚠ ${issue}`);
        }
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
    }
  }
  
  await browser.close();
}

auditMobile().catch(console.error);
