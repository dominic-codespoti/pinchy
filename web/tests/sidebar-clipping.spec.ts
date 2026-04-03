import { test, expect } from '@playwright/test';

test('verify sidebar clipping issue is fixed', async ({ page }) => {
  // Navigate to chat page
  await page.goto('http://localhost:3000/chat');
  
  // Wait for the sidebar to be visible
  await page.waitForSelector('[class*="flex h-full flex-col"]', { timeout: 10000 });
  
  // Give time for sessions to load
  await page.waitForTimeout(2000);
  
  // Get measurements
  const measurements = await page.evaluate(() => {
    // Find the sidebar container (leftmost column)
    const sidebar = document.querySelector('.flex.h-full.flex-col');
    if (!sidebar) return { error: 'Sidebar not found' };
    
    const sidebarRect = sidebar.getBoundingClientRect();
    
    // Find the ScrollArea viewport
    const scrollArea = sidebar.querySelector('[data-radix-scroll-area-viewport]');
    const scrollAreaRect = scrollArea?.getBoundingClientRect();
    
    // Find all session rows/buttons
    const sessionItems = sidebar.querySelectorAll('button');
    const sessionMeasurements = [];
    
    for (const item of sessionItems) {
      const rect = item.getBoundingClientRect();
      const titleEl = item.querySelector('p.truncate, p[class*="truncate"]');
      const titleRect = titleEl?.getBoundingClientRect();
      
      sessionMeasurements.push({
        width: rect.width,
        scrollWidth: (item as HTMLElement).scrollWidth,
        exceedsParent: rect.width > (scrollAreaRect?.width || sidebarRect.width),
        title: {
          text: titleEl?.textContent?.substring(0, 50) || 'no title',
          width: titleRect?.width || 0,
          clientWidth: (titleEl as HTMLElement)?.clientWidth || 0,
          scrollWidth: (titleEl as HTMLElement)?.scrollWidth || 0,
          isTruncated: ((titleEl as HTMLElement)?.scrollWidth || 0) > ((titleEl as HTMLElement)?.clientWidth || 0),
        }
      });
    }
    
    return {
      sidebar: {
        width: sidebarRect.width,
      },
      scrollArea: {
        width: scrollAreaRect?.width || null,
        scrollWidth: (scrollArea as HTMLElement)?.scrollWidth || null,
      },
      sessions: sessionMeasurements,
      anyExceedsViewport: sessionMeasurements.some(s => s.exceedsParent),
    };
  });
  
  console.log('Measurements:', JSON.stringify(measurements, null, 2));
  
  // Log the results
  if ('error' in measurements) {
    console.log('ERROR:', measurements.error);
    return;
  }
  
  console.log('=== SIDEBAR CLIPPING VERIFICATION ===');
  console.log(`Sidebar width: ${measurements.sidebar.width}px`);
  console.log(`ScrollArea viewport width: ${measurements.scrollArea.width}px`);
  console.log(`Sessions found: ${measurements.sessions.length}`);
  console.log(`Any session exceeds viewport: ${measurements.anyExceedsViewport}`);
  
  for (const session of measurements.sessions) {
    console.log(`\nSession: "${session.title.text}"`);
    console.log(`  Row width: ${session.width}px (viewport: ${measurements.scrollArea.width}px)`);
    console.log(`  Title truncated: ${session.title.isTruncated}`);
    console.log(`  Title scrollWidth: ${session.title.scrollWidth}, clientWidth: ${session.title.clientWidth}`);
    
    // Check if row width matches or is within viewport
    const withinTolerance = session.width <= (measurements.scrollArea.width || measurements.sidebar.width) + 1;
    console.log(`  Within viewport: ${withinTolerance}`);
  }
  
  // Determine pass/fail
  const pass = !measurements.anyExceedsViewport;
  console.log(`\n=== RESULT: ${pass ? 'PASS' : 'FAIL'} ===`);
  
  // Write result to file for the test runner
  const fs = require('fs');
  fs.writeFileSync('/tmp/sidebar-test-result.json', JSON.stringify({
    result: pass ? 'PASS' : 'FAIL',
    measurements: measurements
  }, null, 2));
  
  // Assert for the test
  expect(measurements.anyExceedsViewport).toBe(false);
});
