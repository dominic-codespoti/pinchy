import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UI Inspection Script
 * 
 * Captures structured text snapshots of every page for LLM analysis.
 * Run: NEXT_PUBLIC_ENABLE_MOCKS=true npx playwright test e2e/inspect-ui.spec.ts
 * Output: e2e/snapshots/ui-report.md
 * 
 * The report is designed to be fed to an LLM to identify UI issues like:
 * - Empty or broken pages
 * - Missing headings / bad hierarchy
 * - Unlabeled interactive elements (accessibility issues)
 * - Error states showing in the UI
 * - Navigation problems
 * - Missing content that should be populated by mock data
 */

const REPORT_DIR = path.join(__dirname, 'snapshots');
const REPORT_FILE = path.join(REPORT_DIR, 'ui-report.md');

interface PageCapture {
  name: string;
  path: string;
  finalUrl: string;
  pageTitle: string;
  ariaSnapshot: string;
  consoleErrors: string[];
  consoleWarnings: string[];
  networkFailures: { url: string; status: number; method: string }[];
  interactiveCounts: {
    buttons: number;
    links: number;
    inputs: number;
    selects: number;
  };
  headings: { level: number; text: string }[];
  errorElements: string[];  // Elements with aria-invalid or error classes
  emptyStateIndicators: string[];  // Text like "No data", "Empty", etc.
  loadTimeMs: number;
}

// Pages to inspect
const pages = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/agents', name: 'Agents List' },
  { path: '/agents/detail/?id=default', name: 'Agent Detail (default)' },
  { path: '/agents/detail/?id=researcher', name: 'Agent Detail (researcher)' },
  { path: '/chat', name: 'Chat' },
  { path: '/sessions', name: 'Sessions' },
  { path: '/memories', name: 'Memories' },
  { path: '/models', name: 'Models' },
  { path: '/skills', name: 'Skills' },
  { path: '/cron', name: 'Cron Jobs' },
  { path: '/logs', name: 'System Logs' },
  { path: '/login', name: 'Login' },
  { path: '/admin', name: 'Admin' },
  { path: '/analytics', name: 'Analytics' },
  { path: '/settings/appearance', name: 'Settings - Appearance' },
  { path: '/settings/notifications', name: 'Settings - Notifications' },
  { path: '/settings/mcp', name: 'Settings - MCP' },
  { path: '/settings/advanced', name: 'Settings - Advanced' },
  { path: '/settings/security', name: 'Settings - Security' },
  { path: '/settings/maintenance', name: 'Settings - Maintenance (Stub)' },
  { path: '/settings/webhooks', name: 'Settings - Webhooks (Stub)' },
];

// Patterns that indicate MSW/WebSocket noise (not real UI issues)
const NOISE_PATTERNS = [
  '[MSW]', 'mockServiceWorker', 'WebSocket', 'ws://', 'wss://',
  'favicon', 'next-router', 'Fast Refresh',
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some(p => text.toLowerCase().includes(p.toLowerCase()));
}

async function capturePage(
  browserPage: import('@playwright/test').Page,
  pageConfig: { path: string; name: string }
): Promise<PageCapture> {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const networkFailures: PageCapture['networkFailures'] = [];

  // Collect console messages
  const consoleHandler = (msg: import('@playwright/test').ConsoleMessage) => {
    const text = msg.text();
    if (isNoise(text)) return;
    if (msg.type() === 'error') consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  };
  browserPage.on('console', consoleHandler);

  // Collect failed network requests
  const responseHandler = (response: import('@playwright/test').Response) => {
    const url = response.url();
    if (url.includes('/api/') && response.status() >= 400) {
      networkFailures.push({
        url: url.replace(/https?:\/\/[^/]+/, ''),
        status: response.status(),
        method: response.request().method(),
      });
    }
  };
  browserPage.on('response', responseHandler);

  const startTime = Date.now();

  // Navigate
  await browserPage.goto(pageConfig.path, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });

  // Small extra wait for React to settle (lazy components, effects)
  await browserPage.waitForTimeout(1500);

  const loadTimeMs = Date.now() - startTime;
  const finalUrl = browserPage.url();
  const pageTitle = await browserPage.title();

  // Capture ARIA snapshot of the main content area
  let ariaSnapshot = '';
  try {
    // Try main first (the primary content area), fall back to body
    const mainLocator = browserPage.locator('main');
    if (await mainLocator.count() > 0) {
      ariaSnapshot = await mainLocator.first().ariaSnapshot({ timeout: 5000 });
    } else {
      ariaSnapshot = await browserPage.locator('body').ariaSnapshot({ timeout: 5000 });
    }
  } catch (e) {
    ariaSnapshot = `[ERROR capturing ARIA snapshot: ${e instanceof Error ? e.message : String(e)}]`;
  }

  // Count interactive elements
  const buttons = await browserPage.locator('button, [role="button"]').count();
  const links = await browserPage.locator('a[href]').count();
  const inputs = await browserPage.locator('input, textarea').count();
  const selects = await browserPage.locator('select, [role="combobox"], [role="listbox"]').count();

  // Extract headings
  const headings: PageCapture['headings'] = [];
  for (let level = 1; level <= 6; level++) {
    const els = browserPage.locator(`h${level}`);
    const count = await els.count();
    for (let i = 0; i < count; i++) {
      const text = await els.nth(i).textContent().catch(() => '');
      if (text?.trim()) {
        headings.push({ level, text: text.trim() });
      }
    }
  }

  // Find error state elements
  const errorElements: string[] = [];
  const errorEls = browserPage.locator('[aria-invalid="true"], [data-state="error"], .text-destructive, .text-red-500, .border-destructive');
  const errorCount = await errorEls.count();
  for (let i = 0; i < Math.min(errorCount, 10); i++) {
    const text = await errorEls.nth(i).textContent().catch(() => '');
    if (text?.trim()) errorElements.push(text.trim().slice(0, 200));
  }

  // Find empty state indicators
  const emptyStateIndicators: string[] = [];
  const emptyEls = browserPage.locator(':text-matches("no (data|results|items|agents|sessions|skills|jobs|memories|logs)", "i"), :text-matches("nothing (to show|found|here)", "i"), :text-matches("empty|not found|not available|coming soon", "i")');
  const emptyCount = await emptyEls.count();
  for (let i = 0; i < Math.min(emptyCount, 10); i++) {
    const text = await emptyEls.nth(i).textContent().catch(() => '');
    if (text?.trim()) emptyStateIndicators.push(text.trim().slice(0, 200));
  }

  // Cleanup listeners
  browserPage.removeListener('console', consoleHandler);
  browserPage.removeListener('response', responseHandler);

  return {
    name: pageConfig.name,
    path: pageConfig.path,
    finalUrl: finalUrl.replace(/https?:\/\/[^/]+/, ''),
    pageTitle,
    ariaSnapshot,
    consoleErrors,
    consoleWarnings,
    networkFailures,
    interactiveCounts: { buttons, links, inputs, selects },
    headings,
    errorElements,
    emptyStateIndicators,
    loadTimeMs,
  };
}

function generateReport(captures: PageCapture[]): string {
  const lines: string[] = [];
  
  lines.push('# Pinchy Web UI Inspection Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Pages inspected: ${captures.length}`);
  lines.push(`Viewport: 1280×720 (desktop)`);
  lines.push(`Mock data: MSW enabled`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Page | Load (ms) | Headings | Buttons | Links | Inputs | Errors | Network Failures |');
  lines.push('|------|-----------|----------|---------|-------|--------|--------|-----------------|');
  for (const c of captures) {
    const err = c.consoleErrors.length + c.errorElements.length;
    lines.push(
      `| ${c.name} | ${c.loadTimeMs} | ${c.headings.length} | ${c.interactiveCounts.buttons} | ${c.interactiveCounts.links} | ${c.interactiveCounts.inputs} | ${err} | ${c.networkFailures.length} |`
    );
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Detailed per-page sections
  for (const c of captures) {
    lines.push(`## ${c.name}`);
    lines.push('');
    lines.push(`- **Route:** \`${c.path}\``);
    lines.push(`- **Final URL:** \`${c.finalUrl}\``);
    lines.push(`- **Page title:** ${c.pageTitle || '(none)'}`);
    lines.push(`- **Load time:** ${c.loadTimeMs}ms`);
    lines.push('');

    // Headings
    if (c.headings.length > 0) {
      lines.push('### Headings');
      for (const h of c.headings) {
        lines.push(`- h${h.level}: "${h.text}"`);
      }
      lines.push('');
    } else {
      lines.push('### Headings');
      lines.push('⚠️ **No headings found on this page**');
      lines.push('');
    }

    // Interactive elements
    lines.push('### Interactive Elements');
    lines.push(`- Buttons: ${c.interactiveCounts.buttons}`);
    lines.push(`- Links: ${c.interactiveCounts.links}`);
    lines.push(`- Inputs: ${c.interactiveCounts.inputs}`);
    lines.push(`- Selects: ${c.interactiveCounts.selects}`);
    lines.push('');

    // ARIA Snapshot
    lines.push('### Accessibility Tree (ARIA Snapshot)');
    lines.push('');
    lines.push('```yaml');
    lines.push(c.ariaSnapshot);
    lines.push('```');
    lines.push('');

    // Issues
    if (c.consoleErrors.length > 0) {
      lines.push('### ⚠️ Console Errors');
      for (const err of c.consoleErrors) {
        lines.push(`- \`${err.slice(0, 300)}\``);
      }
      lines.push('');
    }

    if (c.networkFailures.length > 0) {
      lines.push('### ⚠️ Network Failures');
      for (const nf of c.networkFailures) {
        lines.push(`- ${nf.method} ${nf.url} → ${nf.status}`);
      }
      lines.push('');
    }

    if (c.errorElements.length > 0) {
      lines.push('### ⚠️ Error Elements in DOM');
      for (const el of c.errorElements) {
        lines.push(`- "${el}"`);
      }
      lines.push('');
    }

    if (c.emptyStateIndicators.length > 0) {
      lines.push('### Empty State Indicators');
      for (const es of c.emptyStateIndicators) {
        lines.push(`- "${es}"`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Single test that captures all pages and writes the report
test('capture UI snapshots for all pages', async ({ page: browserPage }) => {
  // Set timeout to 5 minutes for this long-running sequential capture
  test.setTimeout(300000);

  // Set viewport to standard desktop
  await browserPage.setViewportSize({ width: 1280, height: 720 });

  // Ensure output directory exists
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const captures: PageCapture[] = [];

  for (const pageConfig of pages) {
    console.log(`Inspecting: ${pageConfig.name} (${pageConfig.path})`);
    try {
      const capture = await capturePage(browserPage, pageConfig);
      captures.push(capture);
    } catch (error) {
      console.error(`Failed to capture ${pageConfig.path}:`, error);
      captures.push({
        name: pageConfig.name,
        path: pageConfig.path,
        finalUrl: pageConfig.path,
        pageTitle: '',
        ariaSnapshot: `[CAPTURE FAILED: ${error instanceof Error ? error.message : String(error)}]`,
        consoleErrors: [`Page capture failed: ${error instanceof Error ? error.message : String(error)}`],
        consoleWarnings: [],
        networkFailures: [],
        interactiveCounts: { buttons: 0, links: 0, inputs: 0, selects: 0 },
        headings: [],
        errorElements: [],
        emptyStateIndicators: [],
        loadTimeMs: 0,
      });
    }
  }

  // Generate and write report
  const report = generateReport(captures);
  fs.writeFileSync(REPORT_FILE, report, 'utf-8');
  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(`Inspected ${captures.length} pages`);
});
