import { test, expect } from '@playwright/test';

test.describe('Agent Page Bug Verification', () => {

  test('agent detail page loads correctly via direct navigation', async ({ page }) => {
    // Intercept API calls
    const apiCalls: { url: string; status: number; body?: string }[] = [];
    page.on('response', async response => {
      if (response.url().includes('/api/')) {
        let body = '';
        try { body = await response.text(); } catch {}
        apiCalls.push({ url: response.url(), status: response.status(), body: body.substring(0, 500) });
      }
    });

    await page.goto('/agents/default');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'e2e/screenshots/fix-verify-detail.png' });
    
    const content = await page.textContent('body');
    console.log('Page content (first 3000 chars):', content?.substring(0, 3000));
    console.log('Current URL:', page.url());
    
    console.log('API calls:');
    apiCalls.forEach(c => console.log(`  ${c.status} ${c.url} → ${c.body?.substring(0, 200)}`));
    
    // Verify NOT showing "Agent not found"
    const notFound = page.locator('text=Agent not found');
    const notFoundVisible = await notFound.isVisible().catch(() => false);
    console.log('Agent not found visible:', notFoundVisible);
    expect(notFoundVisible).toBe(false);
    
    // Verify agent ID is shown somewhere on the page
    const hasDefault = content?.includes('default');
    console.log('Page contains "default":', hasDefault);
    expect(hasDefault).toBe(true);
  });

  test('clicking agent from list navigates correctly', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'e2e/screenshots/fix-verify-list.png' });
    
    // Find and click on "default" agent
    // Try clicking on a table row or link containing "default"
    const defaultEl = page.locator('text=default').first();
    if (await defaultEl.isVisible()) {
      await defaultEl.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: 'e2e/screenshots/fix-verify-clicked.png' });
      
      console.log('URL after click:', page.url());
      const content = await page.textContent('body');
      console.log('Content after click (first 2000):', content?.substring(0, 2000));
      
      const notFound = page.locator('text=Agent not found');
      expect(await notFound.isVisible().catch(() => false)).toBe(false);
    }
  });

  test('agent memory tab shows memories or proper empty state', async ({ page }) => {
    // First check what the backend returns
    const memResponse = await page.request.get('http://localhost:3131/api/agents/default/memory');
    const memData = await memResponse.json();
    console.log('Backend memory response:', JSON.stringify(memData));
    
    // Navigate to agent detail
    await page.goto('/agents/default');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Check if page loaded (no "Agent not found")
    const notFound = page.locator('text=Agent not found');
    if (await notFound.isVisible().catch(() => false)) {
      console.log('ERROR: Agent detail page still shows not found');
      await page.screenshot({ path: 'e2e/screenshots/fix-verify-memory-failed.png' });
      expect(false).toBe(true); // Force fail
      return;
    }
    
    // Look for Memory tab and click it
    const memoryTab = page.locator('[role="tab"]').filter({ hasText: /memory/i });
    const memoryTabExists = await memoryTab.isVisible().catch(() => false);
    console.log('Memory tab found:', memoryTabExists);
    
    if (!memoryTabExists) {
      // Try other selectors
      const allTabs = await page.locator('[role="tab"]').all();
      console.log('All tabs found:');
      for (const tab of allTabs) {
        console.log('  Tab:', await tab.textContent());
      }
      
      // Also try button/link with "Memory" text
      const memBtn = page.locator('button:has-text("Memory"), a:has-text("Memory")').first();
      if (await memBtn.isVisible()) {
        console.log('Found memory button/link, clicking...');
        await memBtn.click();
      }
    } else {
      await memoryTab.click();
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/fix-verify-memory.png' });
    
    const content = await page.textContent('body');
    console.log('Memory tab content (first 2000):', content?.substring(0, 2000));
    
    // If backend has no memories, "No memories found" is expected
    if (memData.entries && memData.entries.length === 0) {
      console.log('Backend has 0 memories - "No memories found" is EXPECTED');
    } else {
      console.log(`Backend has ${memData.entries?.length} memories - they should be displayed`);
      // Check that memories are displayed, not "no memories found"
      const noMemories = page.locator('text=No memories found');
      const noMemVisible = await noMemories.isVisible().catch(() => false);
      console.log('No memories message visible:', noMemVisible);
      if (memData.entries?.length > 0) {
        expect(noMemVisible).toBe(false);
      }
    }
  });

  test('memories for agent with actual memories', async ({ page }) => {
    // Check all 3 agents for memories
    for (const agentId of ['default', 'test-agent-ui', 'ux_agent_test']) {
      const resp = await page.request.get(`http://localhost:3131/api/agents/${agentId}/memory`);
      const data = await resp.json();
      console.log(`Agent ${agentId} memories: ${data.entries?.length ?? 0} entries`);
      if (data.entries?.length > 0) {
        console.log('Sample entry:', JSON.stringify(data.entries[0]));
      }
    }
  });
});
