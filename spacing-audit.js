#!/usr/bin/env node
const { chromium } = require('playwright');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3131';

async function auditSpacing() {
  console.log('Spacing and Layout Audit\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  const routes = [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/settings/appearance', name: 'Appearance Settings' },
    { path: '/models', name: 'Models' },
    { path: '/commands', name: 'Commands' },
  ];
  
  for (const { path: route, name } of routes) {
    console.log(`\n--- ${name} ---`);
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      
      const issues = await page.evaluate(() => {
        const results = [];
        
        // Check for CardContent without preceding CardHeader
        const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
        for (const card of cards) {
          const children = Array.from(card.children);
          const contentIndex = children.findIndex(c => 
            c.className?.includes('p-6') && c.className?.includes('pt-0')
          );
          
          if (contentIndex >= 0) {
            // Check if there's a header before this content
            const hasHeaderBefore = children.slice(0, contentIndex).some(c => 
              c.tagName.toLowerCase().includes('header') ||
              c.className?.toLowerCase().includes('header')
            );
            
            if (!hasHeaderBefore && contentIndex === 0) {
              results.push({
                type: 'CardContent without header',
                class: card.className?.substring(0, 50),
                issue: 'First child has pt-0 (no top padding) but no header precedes it'
              });
            }
          }
        }
        
        // Check for asymmetric gaps in flex containers
        const flexContainers = document.querySelectorAll('*');
        for (const el of flexContainers) {
          const style = window.getComputedStyle(el);
          if (style.display === 'flex' || style.display === 'inline-flex') {
            const gap = parseFloat(style.gap);
            if (gap > 0 && gap < 4) {
              results.push({
                type: 'Small gap in flex',
                tag: el.tagName.toLowerCase(),
                gap: `${gap}px`,
                issue: 'Very small gap may cause cramped appearance'
              });
            }
          }
        }
        
        // Check for cards without proper internal spacing
        const allCards = document.querySelectorAll('[class*="rounded-xl"][class*="border"]');
        for (const card of allCards) {
          const firstChild = card.firstElementChild;
          if (firstChild) {
            const style = window.getComputedStyle(firstChild);
            const paddingTop = parseFloat(style.paddingTop);
            if (paddingTop === 0) {
              results.push({
                type: 'Card with zero top padding',
                class: card.className?.substring(0, 40),
                firstChild: firstChild.tagName.toLowerCase(),
                issue: 'First child element has no top padding'
              });
            }
          }
        }
        
        return results;
      });
      
      if (issues.length === 0) {
        console.log('  ✓ No spacing issues detected');
      } else {
        // Deduplicate
        const seen = new Set();
        for (const issue of issues) {
          const key = JSON.stringify(issue);
          if (!seen.has(key)) {
            seen.add(key);
            console.log(`  ⚠ ${issue.type}: ${issue.issue}`);
            console.log(`    (${issue.class || issue.tag || issue.firstChild})`);
          }
        }
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
    }
  }
  
  await browser.close();
}

auditSpacing().catch(console.error);
