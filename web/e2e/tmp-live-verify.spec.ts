import { test, expect, Page, Response } from '@playwright/test';

// NO MOCKS - This test runs against the LIVE backend
// Backend: http://localhost:3131
// Frontend: http://localhost:3000

interface RouteConfig {
  path: string;
  name: string;
  expectedHeading?: string;
  expectedText?: string[];
  forbiddenText?: string[];
  requiredSelector?: string;
  waitForApi?: string;
}

interface RouteResult {
  name: string;
  path: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  httpStatus?: number;
  finalUrl?: string;
  errors: string[];
  warnings: string[];
  failedRequests: { url: string; status: number }[];
  keyContentFound: boolean;
  errorUiDetected: boolean;
  notes: string[];
}

const ROUTES: RouteConfig[] = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    expectedHeading: 'Dashboard',
    requiredSelector: 'main',
  },
  {
    path: '/agents',
    name: 'Agents List',
    expectedHeading: 'Agents',
    requiredSelector: 'main',
    waitForApi: '/api/agents',
  },
  {
    path: '/agents/detail/?id=default',
    name: 'Agent Detail (default)',
    expectedHeading: 'default',
    requiredSelector: 'main',
    waitForApi: '/api/agents/default',
  },
  {
    path: '/chat',
    name: 'Chat',
    expectedHeading: 'Chat',
    requiredSelector: 'main',
  },
  {
    path: '/cron',
    name: 'Cron Jobs',
    expectedHeading: 'Cron',
    requiredSelector: 'main',
    waitForApi: '/api/cron',
  },
  {
    path: '/skills',
    name: 'Skills',
    expectedHeading: 'Skills',
    requiredSelector: 'main',
  },
  {
    path: '/memories',
    name: 'Memories',
    expectedHeading: 'Memories',
    requiredSelector: 'main',
    waitForApi: '/api/memories',
  },
  {
    path: '/models',
    name: 'Models',
    expectedHeading: 'Models',
    requiredSelector: 'main',
    waitForApi: '/api/providers/status',
  },
  {
    path: '/analytics',
    name: 'Analytics',
    expectedHeading: 'Analytics',
    requiredSelector: 'main',
  },
  {
    path: '/commands',
    name: 'Commands',
    expectedHeading: 'Commands',
    requiredSelector: 'main',
  },
  {
    path: '/logs',
    name: 'System Logs',
    expectedHeading: 'Logs',
    requiredSelector: 'main',
    waitForApi: '/api/logs',
  },
  {
    path: '/admin',
    name: 'Admin',
    expectedHeading: 'Admin',
    requiredSelector: 'main',
  },
  {
    path: '/debug/model-requests',
    name: 'Debug Model Requests',
    expectedHeading: 'Model',
    requiredSelector: 'main',
  },
  {
    path: '/settings/appearance',
    name: 'Settings - Appearance',
    expectedHeading: 'Appearance',
    requiredSelector: 'main',
  },
  {
    path: '/settings/advanced',
    name: 'Settings - Advanced',
    expectedHeading: 'Advanced',
    requiredSelector: 'main',
  },
  {
    path: '/settings/maintenance',
    name: 'Settings - Maintenance',
    expectedHeading: 'Maintenance',
    requiredSelector: 'main',
  },
  {
    path: '/settings/webhooks',
    name: 'Settings - Webhooks',
    expectedHeading: 'Webhooks',
    requiredSelector: 'main',
  },
  {
    path: '/settings/mcp',
    name: 'Settings - MCP',
    expectedHeading: 'MCP',
    requiredSelector: 'main',
  },
];

// Error patterns that indicate a crash/unhandled exception
const CRASH_PATTERNS = [
  'error:',
  'exception:',
  'uncaught',
  'unhandled',
  'crash',
  'application error',
  'something went wrong',
  'failed to load',
  'internal server error',
];

// API error patterns
const API_ERROR_PATTERNS = [
  'api error',
  'request failed',
  'failed to fetch',
  'network error',
  'connection refused',
];

/**
 * Collect console messages and network errors for a page
 */
function setupPageMonitoring(page: Page, result: RouteResult) {
  // Track console errors and warnings
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    
    // Ignore WebSocket and common noise
    if (text.includes('WebSocket') || text.includes('ws://') || text.includes('[HMR]')) {
      return;
    }
    
    if (type === 'error') {
      result.errors.push(text);
    } else if (type === 'warning') {
      result.warnings.push(text);
    }
  });

  // Track page errors (unhandled exceptions)
  page.on('pageerror', (error) => {
    const msg = error.message;
    if (!msg.includes('WebSocket') && !msg.includes('ws://')) {
      result.errors.push(`PageError: ${msg}`);
    }
  });

  // Track failed network requests
  page.on('response', async (response: Response) => {
    const status = response.status();
    const url = response.url();
    
    // Only track API requests with errors
    if (url.includes('/api/') && status >= 400) {
      result.failedRequests.push({ url, status });
    }
    
    // Track any request failures
    if (status >= 500) {
      result.failedRequests.push({ url, status });
    }
  });
}

/**
 * Check if error UI is present on the page
 */
async function detectErrorUi(page: Page): Promise<boolean> {
  const bodyText = await page.textContent('body') || '';
  const lowerText = bodyText.toLowerCase();
  
  // Check for crash patterns
  for (const pattern of CRASH_PATTERNS) {
    if (lowerText.includes(pattern)) {
      return true;
    }
  }
  
  // Check for Next.js error page indicators
  const hasNextError = await page.locator('text=Application error').isVisible().catch(() => false);
  const hasErrorBoundary = await page.locator('[data-nextjs-error]').count() > 0;
  
  return hasNextError || hasErrorBoundary;
}

/**
 * Verify key content is present on the page
 */
async function verifyKeyContent(page: Page, config: RouteConfig): Promise<boolean> {
  const bodyText = await page.textContent('body') || '';
  
  // Check expected heading
  if (config.expectedHeading) {
    if (bodyText.toLowerCase().includes(config.expectedHeading.toLowerCase())) {
      return true;
    }
  }
  
  // Check expected text patterns
  if (config.expectedText) {
    const allFound = config.expectedText.every(text => 
      bodyText.toLowerCase().includes(text.toLowerCase())
    );
    if (allFound) return true;
  }
  
  // Check required selector exists
  if (config.requiredSelector) {
    const hasSelector = await page.locator(config.requiredSelector).count() > 0;
    if (hasSelector) return true;
  }
  
  // Default: check page has reasonable content
  return bodyText.length > 50;
}

/**
 * Get visible text content (excluding sr-only and hidden elements)
 */
async function getVisibleText(page: Page): Promise<string> {
  // Get text from visible elements only
  const texts = await page.locator(':visible').allTextContents();
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

test.describe.serial('Live Backend Verification', () => {
  const results: RouteResult[] = [];

  for (const route of ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page }) => {
      const result: RouteResult = {
        name: route.name,
        path: route.path,
        status: 'FAIL',
        errors: [],
        warnings: [],
        failedRequests: [],
        keyContentFound: false,
        errorUiDetected: false,
        notes: [],
      };

      // Setup monitoring before navigation
      setupPageMonitoring(page, result);

      try {
        // Navigate to the page
        const response = await page.goto(route.path, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        result.httpStatus = response?.status() || 0;
        result.finalUrl = page.url();

        // Check for redirects
        if (result.finalUrl !== `http://localhost:3000${route.path}`) {
          if (result.finalUrl.includes('/login') || result.finalUrl.includes('/auth')) {
            result.status = 'SKIP';
            result.notes.push(`Redirected to auth: ${result.finalUrl}`);
            results.push(result);
            return;
          }
          result.notes.push(`Redirected to: ${result.finalUrl}`);
        }

        // Wait for any specific API
        if (route.waitForApi) {
          try {
            await page.waitForResponse(
              (resp) => resp.url().includes(route.waitForApi!) && resp.status() < 500,
              { timeout: 5000 }
            );
          } catch {
            result.notes.push(`API ${route.waitForApi} did not respond in time`);
          }
        }

        // Wait for main content
        if (route.requiredSelector) {
          await page.waitForSelector(route.requiredSelector, { timeout: 10000 });
        }

        // Small delay for async content
        await page.waitForTimeout(500);

        // Check for error UI
        result.errorUiDetected = await detectErrorUi(page);
        if (result.errorUiDetected) {
          result.errors.push('Error UI detected on page');
        }

        // Verify key content
        result.keyContentFound = await verifyKeyContent(page, route);

        // Determine pass/fail
        if (result.errorUiDetected) {
          result.status = 'FAIL';
        } else if (result.httpStatus >= 500) {
          result.status = 'FAIL';
          result.errors.push(`HTTP ${result.httpStatus}`);
        } else if (!result.keyContentFound) {
          result.status = 'FAIL';
          result.errors.push('Key content not found');
        } else {
          result.status = 'PASS';
        }

        // Note about API failures (but don't fail if page still works)
        if (result.failedRequests.length > 0) {
          result.notes.push(`${result.failedRequests.length} API request(s) failed`);
        }

      } catch (error) {
        result.status = 'FAIL';
        result.errors.push(`Navigation error: ${(error as Error).message}`);
      }

      results.push(result);
      
      // Attach result to test report
      test.info().attach(`${route.name} result`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      // Assert the test passed
      expect(result.status).toBe('PASS');
    });
  }

  test.afterAll(async () => {
    // Print comprehensive summary
    console.log('\n' + '='.repeat(80));
    console.log('LIVE BACKEND VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.status === 'PASS');
    const failed = results.filter(r => r.status === 'FAIL');
    const skipped = results.filter(r => r.status === 'SKIP');
    
    console.log(`\nTotal Routes: ${results.length}`);
    console.log(`  PASS: ${passed.length}`);
    console.log(`  FAIL: ${failed.length}`);
    console.log(`  SKIP: ${skipped.length}`);
    
    console.log('\n--- DETAILED RESULTS ---\n');
    
    for (const result of results) {
      const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '○';
      console.log(`${icon} ${result.name} (${result.path})`);
      console.log(`   Status: ${result.status}`);
      
      if (result.finalUrl && result.finalUrl !== `http://localhost:3000${result.path}`) {
        console.log(`   Final URL: ${result.finalUrl}`);
      }
      
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.length}`);
        for (const err of result.errors.slice(0, 3)) {
          console.log(`     - ${err.substring(0, 100)}${err.length > 100 ? '...' : ''}`);
        }
      }
      
      if (result.failedRequests.length > 0) {
        console.log(`   Failed Requests: ${result.failedRequests.length}`);
        for (const req of result.failedRequests.slice(0, 3)) {
          console.log(`     - ${req.url.split('/').pop()}: HTTP ${req.status}`);
        }
      }
      
      if (result.notes.length > 0) {
        for (const note of result.notes) {
          console.log(`   Note: ${note}`);
        }
      }
      
      console.log('');
    }
    
    // Overall health assessment
    console.log('--- HEALTH ASSESSMENT ---\n');
    if (failed.length === 0) {
      console.log('✓ APP BROADLY HEALTHY: All routes loaded successfully');
    } else if (failed.length <= 3) {
      console.log('⚠ PARTIAL DEGRADATION: Some routes have issues but core functionality may work');
    } else {
      console.log('✗ SIGNIFICANT ISSUES: Multiple routes failing - investigation needed');
    }
    
    // List critical failures
    if (failed.length > 0) {
      console.log('\nCritical Failures:');
      for (const f of failed) {
        console.log(`  - ${f.name}: ${f.errors[0] || 'Unknown error'}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  });
});

// Additional interactive verification
test.describe('Interactive Elements Verification', () => {
  test('Dashboard interactive controls exist', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    // Look for common interactive elements
    const buttons = await page.locator('button').count();
    const links = await page.locator('a').count();
    
    // Dashboard should have navigation and possibly action buttons
    expect(links).toBeGreaterThan(0);
    
    console.log(`Dashboard has ${buttons} buttons, ${links} links`);
  });

  test('Agents page has agent list or empty state', async ({ page }) => {
    await page.goto('/agents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    const bodyText = await page.textContent('body') || '';
    const hasAgentList = bodyText.toLowerCase().includes('agent');
    const hasEmptyState = bodyText.toLowerCase().includes('no agents') || 
                         bodyText.toLowerCase().includes('create');
    
    expect(hasAgentList || hasEmptyState).toBe(true);
  });

  test('Settings pages have navigation', async ({ page }) => {
    await page.goto('/settings/appearance', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    // Settings should have navigation tabs or sidebar
    const hasNav = await page.locator('nav, [role="tablist"], a[href*="/settings/"]').count() > 0;
    expect(hasNav).toBe(true);
  });

  test('Chat page has input field', async ({ page }) => {
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    // Chat should have an input or textarea
    const hasInput = await page.locator('input, textarea').count() > 0;
    expect(hasInput).toBe(true);
  });
});
