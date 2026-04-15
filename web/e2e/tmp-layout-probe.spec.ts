import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Temporary Layout Probe Spec
 * 
 * Detects UI regressions through DOM inspection and computed layout metrics.
 * NO SCREENSHOTS - text-only analysis.
 * 
 * Run: NEXT_PUBLIC_ENABLE_MOCKS=true npx playwright test e2e/tmp-layout-probe.spec.ts
 */

const REPORT_DIR = path.join(__dirname, 'snapshots', 'tmp-layout-probe');

// Viewports to test
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

// Pages to probe
const pages = [
  { path: '/settings/appearance', name: 'settings-appearance' },
  { path: '/models', name: 'models' },
  { path: '/dashboard', name: 'dashboard' },
];

// Types for layout analysis
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ComputedMetrics {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  fontSize: number;
  lineHeight: number;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

interface ButtonAnalysis {
  index: number;
  tag: string;
  text: string;
  classNames: string[];
  boundingBox: BoundingBox;
  computed: ComputedMetrics;
  hasOverflow: boolean;
  overflowX: number;
  overflowY: number;
  parentTag?: string;
  parentClass?: string;
}

interface CardAnalysis {
  index: number;
  tag: string;
  classNames: string[];
  boundingBox: BoundingBox;
  computed: ComputedMetrics;
  hasCardTitle: boolean;
  titleText?: string;
  titleTag?: string;
  childCount: number;
}

interface FlexGridChild {
  index: number;
  tag: string;
  classNames: string[];
  boundingBox: BoundingBox;
  widthRatio: number; // relative to siblings
  heightRatio: number;
  isOutlier: boolean;
}

interface FlexGridContainer {
  selector: string;
  tag: string;
  classNames: string[];
  display: string;
  childCount: number;
  children: FlexGridChild[];
  hasOutliers: boolean;
  maxWidthDeviation: number;
  maxHeightDeviation: number;
}

interface InvalidNesting {
  parent: string;
  parentText: string;
  child: string;
  childText: string;
  issue: string;
}

interface TextCollision {
  element: string;
  text: string;
  availableWidth: number;
  textWidth: number;
  collisionRatio: number; // >1 means overflow
  severity: 'minor' | 'moderate' | 'severe';
}

interface PageAnalysis {
  page: string;
  viewport: string;
  timestamp: string;
  url: string;
  title: string;

  // Headings
  headings: {
    level: number;
    text: string;
    boundingBox: BoundingBox;
    tag: string;
    classNames: string[];
  }[];

  // Buttons/Interactive
  buttons: ButtonAnalysis[];
  buttonSummary: {
    total: number;
    withOverflow: number;
    tooSmall: number; // buttons smaller than 44x44 (touch target)
    tinyPadding: number; // padding < 4px
  };

  // Cards
  cards: CardAnalysis[];
  cardSummary: {
    total: number;
    withoutTitle: number;
    inconsistentPadding: number;
  };

  // Layout containers
  containers: FlexGridContainer[];

  // Invalid nesting
  invalidNesting: InvalidNesting[];

  // Text collision
  textCollisions: TextCollision[];

  // Issues summary
  criticalIssues: string[];
  warnings: string[];
}

// Ensure directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

// Analyze a single page at a specific viewport
async function analyzePage(
  page: import('@playwright/test').Page,
  pageConfig: { path: string; name: string },
  viewport: { name: string; width: number; height: number }
): Promise<PageAnalysis> {
  // Set viewport
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Navigate
  await page.goto(pageConfig.path, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500); // Let React settle

  const url = page.url();
  const title = await page.title();

  // Run comprehensive DOM analysis via page.evaluate
  const analysis = await page.evaluate(() => {
    const results: Partial<PageAnalysis> = {};

    // 1. Headings extraction - using visible text only
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter(el => !isVisuallyHidden(el) && !hasZeroClientRects(el))
      .map((el, i) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visibleText = getVisibleText(el);
        return {
          level: parseInt(el.tagName[1]),
          text: visibleText.slice(0, 100) || '',
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          },
          tag: el.tagName.toLowerCase(),
          classNames: Array.from(el.classList),
        };
      });
    results.headings = headings;

    // 2. Button/Interactive analysis - using accessible name for tracking
    const buttonSelector = 'button, [role="button"], a[href]';
    const buttonElements = Array.from(document.querySelectorAll(buttonSelector));
    const buttons: ButtonAnalysis[] = buttonElements.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      // Use accessible name for tracking button purpose, but collision uses visible text
      const text = getAccessibleName(el).slice(0, 100);
      
      // Calculate padding
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      
      // Font metrics
      const fontSize = parseFloat(style.fontSize) || 0;
      const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
      
      // Overflow detection
      const scrollWidth = (el as HTMLElement).scrollWidth;
      const clientWidth = (el as HTMLElement).clientWidth;
      const scrollHeight = (el as HTMLElement).scrollHeight;
      const clientHeight = (el as HTMLElement).clientHeight;
      
      const overflowX = scrollWidth - clientWidth;
      const overflowY = scrollHeight - clientHeight;
      const hasOverflow = overflowX > 1 || overflowY > 1;

      return {
        index: i,
        tag: el.tagName.toLowerCase(),
        text,
        classNames: Array.from(el.classList),
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        computed: {
          paddingTop,
          paddingRight,
          paddingBottom,
          paddingLeft,
          fontSize,
          lineHeight,
          scrollWidth,
          clientWidth,
          scrollHeight,
          clientHeight,
        },
        hasOverflow,
        overflowX,
        overflowY,
        parentTag: el.parentElement?.tagName.toLowerCase(),
        parentClass: el.parentElement?.className,
      };
    });
    results.buttons = buttons;

    // Button summary
    const tooSmall = buttons.filter(b => b.boundingBox.width < 44 || b.boundingBox.height < 44).length;
    const tinyPadding = buttons.filter(b => 
      b.computed.paddingTop < 4 || b.computed.paddingRight < 4 ||
      b.computed.paddingBottom < 4 || b.computed.paddingLeft < 4
    ).length;
    results.buttonSummary = {
      total: buttons.length,
      withOverflow: buttons.filter(b => b.hasOverflow).length,
      tooSmall,
      tinyPadding,
    };

    // 3. Card detection (heuristic based on common patterns)
    // Look for elements with card-like classes or structure
    const cardSelectors = [
      '[class*="card"]',
      '[class*="Card"]',
      '.rounded-lg',
      '.rounded-xl',
      '.border',
      '.shadow',
    ];
    const cardElements = Array.from(new Set(
      cardSelectors.flatMap(sel => Array.from(document.querySelectorAll(sel)))
    ));
    
    const cards: CardAnalysis[] = cardElements.slice(0, 50).map((el, i) => { // Limit to prevent overload
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      // Check for CardTitle or heading inside - using visible text
      const titleEl = el.querySelector('[class*="CardTitle"], [class*="card-title"], h1, h2, h3, h4, h5');
      const hasCardTitle = !!titleEl && !isVisuallyHidden(titleEl) && !hasZeroClientRects(titleEl);
      
      return {
        index: i,
        tag: el.tagName.toLowerCase(),
        classNames: Array.from(el.classList),
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        computed: {
          paddingTop: parseFloat(style.paddingTop) || 0,
          paddingRight: parseFloat(style.paddingRight) || 0,
          paddingBottom: parseFloat(style.paddingBottom) || 0,
          paddingLeft: parseFloat(style.paddingLeft) || 0,
          fontSize: 0,
          lineHeight: 0,
          scrollWidth: (el as HTMLElement).scrollWidth,
          clientWidth: (el as HTMLElement).clientWidth,
          scrollHeight: (el as HTMLElement).scrollHeight,
          clientHeight: (el as HTMLElement).clientHeight,
        },
        hasCardTitle,
        titleText: titleEl ? getVisibleText(titleEl).slice(0, 100) : undefined,
        titleTag: titleEl?.tagName.toLowerCase(),
        childCount: el.children.length,
      };
    });
    results.cards = cards;
    
    results.cardSummary = {
      total: cards.length,
      withoutTitle: cards.filter(c => !c.hasCardTitle).length,
      inconsistentPadding: cards.filter(c => 
        Math.abs(c.computed.paddingTop - c.computed.paddingBottom) > 4 ||
        Math.abs(c.computed.paddingLeft - c.computed.paddingRight) > 4
      ).length,
    };

    // 4. Flex/Grid container analysis
    const flexGridElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'flex' || style.display === 'grid' || style.display === 'inline-flex';
    }).slice(0, 30); // Limit for performance
    
    const containers: FlexGridContainer[] = flexGridElements.map((el, i) => {
      const style = window.getComputedStyle(el);
      const children = Array.from(el.children);
      const childRects = children.map(child => child.getBoundingClientRect());
      
      // Calculate sibling size comparison
      const widths = childRects.map(r => r.width).filter(w => w > 0);
      const heights = childRects.map(r => r.height).filter(h => h > 0);
      
      const avgWidth = widths.length > 0 ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
      const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : 0;
      
      const childData: FlexGridChild[] = children.map((child, idx) => {
        const rect = childRects[idx];
        const widthRatio = avgWidth > 0 ? rect.width / avgWidth : 1;
        const heightRatio = avgHeight > 0 ? rect.height / avgHeight : 1;
        return {
          index: idx,
          tag: child.tagName.toLowerCase(),
          classNames: Array.from(child.classList),
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          },
          widthRatio,
          heightRatio,
          isOutlier: Math.abs(widthRatio - 1) > 0.1 || Math.abs(heightRatio - 1) > 0.1,
        };
      });
      
      const outliers = childData.filter(c => c.isOutlier);
      const maxWidthDev = childData.length > 0 
        ? Math.max(...childData.map(c => Math.abs(c.widthRatio - 1)))
        : 0;
      const maxHeightDev = childData.length > 0
        ? Math.max(...childData.map(c => Math.abs(c.heightRatio - 1)))
        : 0;
      
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + 
                  (el.className ? `.${Array.from(el.classList).slice(0, 3).join('.')}` : ''),
        tag: el.tagName.toLowerCase(),
        classNames: Array.from(el.classList).slice(0, 5),
        display: style.display,
        childCount: children.length,
        children: childData,
        hasOutliers: outliers.length > 0,
        maxWidthDeviation: maxWidthDev,
        maxHeightDeviation: maxHeightDev,
      };
    });
    results.containers = containers;

    // 5. Invalid nesting detection - filter out hidden elements
    const invalidNesting: InvalidNesting[] = [];
    
    // Helper to check if element is actually visible for nesting issues
    function isVisibleForNesting(el: Element): boolean {
      return !isVisuallyHidden(el) && !hasZeroClientRects(el);
    }
    
    // button inside button
    document.querySelectorAll('button button, [role="button"] button').forEach(child => {
      if (!isVisibleForNesting(child)) return;
      const parent = child.parentElement;
      if (parent && isVisibleForNesting(parent)) {
        invalidNesting.push({
          parent: parent.tagName.toLowerCase(),
          parentText: getVisibleText(parent).slice(0, 50) || '',
          child: child.tagName.toLowerCase(),
          childText: getVisibleText(child).slice(0, 50) || '',
          issue: 'button inside button',
        });
      }
    });
    
    // a inside a
    document.querySelectorAll('a a').forEach(child => {
      if (!isVisibleForNesting(child)) return;
      const parent = child.parentElement;
      if (parent && parent.closest('a') && isVisibleForNesting(parent)) {
        invalidNesting.push({
          parent: parent.tagName.toLowerCase(),
          parentText: getAccessibleName(parent).slice(0, 50) || '',
          child: child.tagName.toLowerCase(),
          childText: getAccessibleName(child).slice(0, 50) || '',
          issue: 'anchor inside anchor',
        });
      }
    });
    
    // button inside a or a inside button
    document.querySelectorAll('a button, button a').forEach(child => {
      if (!isVisibleForNesting(child)) return;
      const parent = child.parentElement;
      if (parent && isVisibleForNesting(parent)) {
        invalidNesting.push({
          parent: parent.tagName.toLowerCase(),
          parentText: getAccessibleName(parent).slice(0, 50) || '',
          child: child.tagName.toLowerCase(),
          childText: getAccessibleName(child).slice(0, 50) || '',
          issue: 'interactive inside interactive',
        });
      }
    });
    
    // role="button" conflicts
    document.querySelectorAll('[role="button"] [role="button"], [role="button"] button, button [role="button"]').forEach(child => {
      if (!isVisibleForNesting(child)) return;
      const parent = child.parentElement;
      if (parent && isVisibleForNesting(parent)) {
        invalidNesting.push({
          parent: parent.tagName.toLowerCase(),
          parentText: getAccessibleName(parent).slice(0, 50) || '',
          child: child.tagName.toLowerCase(),
          childText: getAccessibleName(child).slice(0, 50) || '',
          issue: 'role=button conflict',
        });
      }
    });
    
    results.invalidNesting = invalidNesting;

    // Helper: Check if element is visually hidden
    function isVisuallyHidden(el: Element): boolean {
      const style = window.getComputedStyle(el);
      return (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.opacity === '0px' ||
        el.classList.contains('sr-only') ||
        el.classList.contains('hidden')
      );
    }

    // Helper: Check if element has zero client rects (not rendered)
    function hasZeroClientRects(el: Element): boolean {
      const rects = el.getClientRects();
      return rects.length === 0 || (rects.length === 1 && rects[0].width === 0 && rects[0].height === 0);
    }

    // Helper: Get visible text from element, excluding hidden descendants
    function getVisibleText(el: Element): string {
      // If element itself is hidden, return empty
      if (isVisuallyHidden(el) || hasZeroClientRects(el)) {
        return '';
      }

      // Walk text nodes and visible child elements
      const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const elem = node as Element;
              // Reject if visually hidden or sr-only
              if (isVisuallyHidden(elem) || hasZeroClientRects(elem)) {
                return NodeFilter.FILTER_REJECT;
              }
              // Skip script/style tags
              if (elem.tagName === 'SCRIPT' || elem.tagName === 'STYLE') {
                return NodeFilter.FILTER_REJECT;
              }
              // For other elements, continue walking to check children
              return NodeFilter.FILTER_SKIP; // Check children
            }
            return NodeFilter.FILTER_REJECT;
          }
        }
      );

      let text = '';
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || '';
        }
      }

      return text.trim();
    }

    // Helper: Get accessible name (for debugging), NOT for collision detection
    function getAccessibleName(el: Element): string {
      return el.getAttribute('aria-label') || getVisibleText(el);
    }

    // 6. Text collision detection - IMPROVED to ignore hidden text
    const textCollisions: TextCollision[] = [];
    
    // Collect all potentially text-bearing interactive elements
    const textElements = document.querySelectorAll('button, a, [role="button"], [role="link"]');
    
    textElements.forEach(el => {
      // Skip if element itself is hidden
      if (isVisuallyHidden(el) || hasZeroClientRects(el)) {
        return;
      }

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      // Skip if element has no visible dimensions
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      // Get visible text only
      const visibleText = getVisibleText(el);
      
      // Skip if no visible text
      if (!visibleText || visibleText.length === 0) {
        return;
      }

      // Skip if text is just whitespace or common icon-only indicators
      if (/^[\s\u200B\u00A0]*$/.test(visibleText)) {
        return;
      }
      
      // Create a temporary element to measure visible text width
      const temp = document.createElement('span');
      temp.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: nowrap;
        font: ${style.font};
        letter-spacing: ${style.letterSpacing};
        font-weight: ${style.fontWeight};
        text-transform: ${style.textTransform};
      `;
      temp.textContent = visibleText;
      document.body.appendChild(temp);
      const textWidth = temp.getBoundingClientRect().width;
      document.body.removeChild(temp);
      
      // Account for padding
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const availableWidth = rect.width - paddingLeft - paddingRight;
      
      // Skip if available width is zero or negative
      if (availableWidth <= 0) {
        return;
      }
      
      const collisionRatio = textWidth / availableWidth;
      
      // Report collisions (only if ratio > 0.95 to catch near-overflow)
      if (collisionRatio > 0.95) {
        let severity: 'minor' | 'moderate' | 'severe' = 'minor';
        if (collisionRatio > 1.1) severity = 'severe';
        else if (collisionRatio > 1.0) severity = 'moderate';
        
        textCollisions.push({
          element: el.tagName.toLowerCase() + (el.className ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : ''),
          text: visibleText.slice(0, 50),
          availableWidth: Math.round(availableWidth * 10) / 10,
          textWidth: Math.round(textWidth * 10) / 10,
          collisionRatio: Math.round(collisionRatio * 100) / 100,
          severity,
        });
      }
    });
    results.textCollisions = textCollisions;

    // 7. Critical issues and warnings
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    
    // Check for buttons too small
    if (tooSmall > 0) {
      warnings.push(`${tooSmall} buttons smaller than 44×44px (touch target size)`);
    }
    
    // Check for buttons with overflow
    if (results.buttonSummary!.withOverflow > 0) {
      warnings.push(`${results.buttonSummary!.withOverflow} buttons with content overflow`);
    }
    
    // Check for tiny padding
    if (tinyPadding > 0) {
      warnings.push(`${tinyPadding} buttons with padding < 4px`);
    }
    
    // Invalid nesting is critical
    if (invalidNesting.length > 0) {
      criticalIssues.push(`${invalidNesting.length} invalid interactive nesting(s) detected`);
    }
    
    // Text collisions
    const severeCollisions = textCollisions.filter(t => t.severity === 'severe').length;
    if (severeCollisions > 0) {
      criticalIssues.push(`${severeCollisions} severe text collision(s) detected`);
    }
    
    // Container outliers
    const outlierContainers = containers.filter(c => c.hasOutliers && c.childCount > 1).length;
    if (outlierContainers > 0) {
      warnings.push(`${outlierContainers} flex/grid containers with size outliers (>10% deviation)`);
    }
    
    results.criticalIssues = criticalIssues;
    results.warnings = warnings;

    return results as PageAnalysis;
  });

  return {
    page: pageConfig.name,
    viewport: viewport.name,
    timestamp: new Date().toISOString(),
    url,
    title,
    headings: analysis.headings,
    buttons: analysis.buttons,
    buttonSummary: analysis.buttonSummary,
    cards: analysis.cards,
    cardSummary: analysis.cardSummary,
    containers: analysis.containers,
    invalidNesting: analysis.invalidNesting,
    textCollisions: analysis.textCollisions,
    criticalIssues: analysis.criticalIssues,
    warnings: analysis.warnings,
  };
}

// Format bounding box for readable output
function formatBBox(b: BoundingBox): string {
  return `${Math.round(b.width)}×${Math.round(b.height)} @ (${Math.round(b.x)}, ${Math.round(b.y)})`;
}

// Generate detailed markdown report for a single analysis
function generatePageReport(analysis: PageAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`# Layout Analysis: ${analysis.page}`);
  lines.push(`**Viewport:** ${analysis.viewport} | **URL:** ${analysis.url}`);
  lines.push(`**Generated:** ${analysis.timestamp}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  if (analysis.criticalIssues.length > 0) {
    lines.push('### Critical Issues');
    analysis.criticalIssues.forEach(i => lines.push(`- CRITICAL: ${i}`));
    lines.push('');
  }
  if (analysis.warnings.length > 0) {
    lines.push('### Warnings');
    analysis.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
    lines.push('');
  }
  if (analysis.criticalIssues.length === 0 && analysis.warnings.length === 0) {
    lines.push('✅ No layout issues detected');
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  
  // Headings
  lines.push('## Headings');
  lines.push('');
  if (analysis.headings.length > 0) {
    lines.push('| Level | Text | Size | Position |');
    lines.push('|-------|------|------|----------|');
    analysis.headings.forEach(h => {
      lines.push(`| h${h.level} | "${h.text.slice(0, 40)}" | ${formatBBox(h.boundingBox)} | (${Math.round(h.boundingBox.x)}, ${Math.round(h.boundingBox.y)}) |`);
    });
  } else {
    lines.push('*No headings found*');
  }
  lines.push('');
  
  // Buttons
  lines.push('## Interactive Elements (Buttons/Links)');
  lines.push('');
  lines.push(`**Summary:** ${analysis.buttonSummary.total} total, ${analysis.buttonSummary.withOverflow} with overflow, ${analysis.buttonSummary.tooSmall} too small (<44px), ${analysis.buttonSummary.tinyPadding} tiny padding (<4px)`);
  lines.push('');
  
  if (analysis.buttons.length > 0) {
    lines.push('### Buttons with Issues');
    lines.push('');
    const problematicButtons = analysis.buttons.filter(b => 
      b.hasOverflow || 
      b.boundingBox.width < 44 || 
      b.boundingBox.height < 44 ||
      b.computed.paddingTop < 4 ||
      b.computed.paddingLeft < 4
    );
    
    if (problematicButtons.length > 0) {
      lines.push('| Index | Tag | Text | Size | Padding | Overflow |');
      lines.push('|-------|-----|------|------|---------|----------|');
      problematicButtons.slice(0, 20).forEach(b => {
        const size = b.boundingBox.width < 44 || b.boundingBox.height < 44 
          ? `${Math.round(b.boundingBox.width)}×${Math.round(b.boundingBox.height)} ❌` 
          : `${Math.round(b.boundingBox.width)}×${Math.round(b.boundingBox.height)}`;
        const padding = b.computed.paddingTop < 4 || b.computed.paddingLeft < 4
          ? `${b.computed.paddingTop}/${b.computed.paddingRight}/${b.computed.paddingBottom}/${b.computed.paddingLeft} ⚠️`
          : `${b.computed.paddingTop}/${b.computed.paddingRight}/${b.computed.paddingBottom}/${b.computed.paddingLeft}`;
        const overflow = b.hasOverflow ? `${b.overflowX}x${b.overflowY} ❌` : 'None';
        lines.push(`| ${b.index} | ${b.tag} | "${b.text.slice(0, 30)}" | ${size} | ${padding} | ${overflow} |`);
      });
      if (problematicButtons.length > 20) {
        lines.push(`| ... | ... | (${problematicButtons.length - 20} more) | ... | ... | ... |`);
      }
    } else {
      lines.push('*All buttons appear to have adequate sizing and padding*');
    }
    lines.push('');
  }
  
  // Cards
  lines.push('## Card-like Containers');
  lines.push('');
  lines.push(`**Summary:** ${analysis.cardSummary.total} detected, ${analysis.cardSummary.withoutTitle} without title, ${analysis.cardSummary.inconsistentPadding} with inconsistent padding`);
  lines.push('');
  
  if (analysis.cards.length > 0) {
    lines.push('| Index | Tag | Classes | Size | Has Title | Padding |');
    lines.push('|-------|-----|---------|------|-----------|----------|');
    analysis.cards.slice(0, 20).forEach(c => {
      const title = c.hasCardTitle ? `✅ "${c.titleText?.slice(0, 20)}"` : '❌ None';
      const padding = `${Math.round(c.computed.paddingTop)}/${Math.round(c.computed.paddingRight)}/${Math.round(c.computed.paddingBottom)}/${Math.round(c.computed.paddingLeft)}`;
      const classes = c.classNames.slice(0, 3).join(' ') || '-';
      lines.push(`| ${c.index} | ${c.tag} | ${classes} | ${formatBBox(c.boundingBox)} | ${title} | ${padding} |`);
    });
    if (analysis.cards.length > 20) {
      lines.push(`| ... | ... | (${analysis.cards.length - 20} more) | ... | ... | ... |`);
    }
    lines.push('');
  }
  
  // Containers with outliers
  lines.push('## Flex/Grid Containers');
  lines.push('');
  const outlierContainers = analysis.containers.filter(c => c.hasOutliers && c.childCount > 1);
  if (outlierContainers.length > 0) {
    lines.push(`**${outlierContainers.length} containers with sibling size outliers (>10% deviation):**`);
    lines.push('');
    outlierContainers.slice(0, 10).forEach(c => {
      lines.push(`### ${c.selector}`);
      lines.push(`- Display: ${c.display}`);
      lines.push(`- Children: ${c.childCount}`);
      lines.push(`- Max width deviation: ${(c.maxWidthDeviation * 100).toFixed(1)}%`);
      lines.push(`- Max height deviation: ${(c.maxHeightDeviation * 100).toFixed(1)}%`);
      lines.push('');
      lines.push('| Index | Tag | Size | Deviation |');
      lines.push('|-------|-----|------|-----------|');
      c.children.filter(child => child.isOutlier).forEach(child => {
        lines.push(`| ${child.index} | ${child.tag} | ${formatBBox(child.boundingBox)} | W:${((child.widthRatio-1)*100).toFixed(0)}% H:${((child.heightRatio-1)*100).toFixed(0)}% |`);
      });
      lines.push('');
    });
  } else {
    lines.push('*No significant sibling size deviations detected*');
    lines.push('');
  }
  
  // Invalid nesting
  lines.push('## Invalid Nesting');
  lines.push('');
  if (analysis.invalidNesting.length > 0) {
    lines.push('| Issue | Parent | Child |');
    lines.push('|-------|--------|-------|');
    analysis.invalidNesting.forEach(n => {
      lines.push(`| ${n.issue} | ${n.parent} "${n.parentText.slice(0, 20)}" | ${n.child} "${n.childText.slice(0, 20)}" |`);
    });
  } else {
    lines.push('*No invalid nesting detected*');
  }
  lines.push('');
  
  // Text collisions
  lines.push('## Text Collisions');
  lines.push('');
  if (analysis.textCollisions.length > 0) {
    lines.push('| Severity | Element | Text | Available | Text Width | Ratio |');
    lines.push('|----------|---------|------|-----------|------------|-------|');
    analysis.textCollisions.forEach(t => {
      lines.push(`| ${t.severity} | ${t.element} | "${t.text.slice(0, 25)}" | ${t.availableWidth}px | ${t.textWidth}px | ${t.collisionRatio} |`);
    });
  } else {
    lines.push('*No text collisions detected*');
  }
  lines.push('');
  
  // Raw data appendix
  lines.push('---');
  lines.push('');
  lines.push('## Raw Data (JSON)');
  lines.push('');
  lines.push('```json');
  // Truncate large arrays for readability
  const truncated = {
    ...analysis,
    buttons: analysis.buttons.slice(0, 10),
    cards: analysis.cards.slice(0, 10),
    containers: analysis.containers.slice(0, 5),
    textCollisions: analysis.textCollisions.slice(0, 10),
  };
  lines.push(JSON.stringify(truncated, null, 2));
  lines.push('```');
  
  return lines.join('\n');
}

// Generate consolidated summary report
function generateSummaryReport(analyses: PageAnalysis[]): string {
  const lines: string[] = [];
  
  lines.push('# Layout Probe Summary Report');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Pages Analyzed:** ${pages.length} | **Viewports:** ${viewports.length}`);
  lines.push('');
  
  // Overall statistics
  lines.push('## Overall Statistics');
  lines.push('');
  lines.push('| Page | Viewport | Buttons | Issues | Warnings | Critical |');
  lines.push('|------|----------|---------|--------|----------|----------|');
  analyses.forEach(a => {
    const issues = a.buttonSummary.withOverflow + a.buttonSummary.tooSmall + a.buttonSummary.tinyPadding;
    lines.push(`| ${a.page} | ${a.viewport} | ${a.buttonSummary.total} | ${issues} | ${a.warnings.length} | ${a.criticalIssues.length} |`);
  });
  lines.push('');
  
  // Critical issues by page
  lines.push('## Critical Issues by Page');
  lines.push('');
  const pagesWithCritical = analyses.filter(a => a.criticalIssues.length > 0);
  if (pagesWithCritical.length > 0) {
    pagesWithCritical.forEach(a => {
      lines.push(`### ${a.page} (${a.viewport})`);
      a.criticalIssues.forEach(i => lines.push(`- ❌ ${i}`));
      lines.push('');
    });
  } else {
    lines.push('*No critical issues detected*');
    lines.push('');
  }
  
  // Warnings by page
  lines.push('## Warnings by Page');
  lines.push('');
  const pagesWithWarnings = analyses.filter(a => a.warnings.length > 0);
  if (pagesWithWarnings.length > 0) {
    pagesWithWarnings.forEach(a => {
      lines.push(`### ${a.page} (${a.viewport})`);
      a.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
      lines.push('');
    });
  } else {
    lines.push('*No warnings detected*');
    lines.push('');
  }
  
  // Detailed findings
  lines.push('## Detailed Findings');
  lines.push('');
  
  // Group by page
  const byPage = new Map<string, PageAnalysis[]>();
  analyses.forEach(a => {
    if (!byPage.has(a.page)) byPage.set(a.page, []);
    byPage.get(a.page)!.push(a);
  });
  
  byPage.forEach((viewportAnalyses, pageName) => {
    lines.push(`### ${pageName}`);
    lines.push('');
    
    // Cross-viewport comparison
    const desktop = viewportAnalyses.find(a => a.viewport === 'desktop');
    const mobile = viewportAnalyses.find(a => a.viewport === 'mobile');
    
    if (desktop && mobile) {
      lines.push('**Cross-Viewport Comparison:**');
      lines.push(`- Desktop buttons: ${desktop.buttonSummary.total} vs Mobile: ${mobile.buttonSummary.total}`);
      lines.push(`- Desktop cards: ${desktop.cards.length} vs Mobile: ${mobile.cards.length}`);
      lines.push(`- Desktop critical: ${desktop.criticalIssues.length} vs Mobile: ${mobile.criticalIssues.length}`);
      lines.push('');
    }
    
    viewportAnalyses.forEach(a => {
      lines.push(`#### ${a.viewport}`);
      lines.push('');
      
      if (a.invalidNesting.length > 0) {
        lines.push('**Invalid Nesting:**');
        a.invalidNesting.forEach(n => {
          lines.push(`- ${n.issue}: \`${n.parent}\` containing \`${n.child}\``);
        });
        lines.push('');
      }
      
      if (a.textCollisions.length > 0) {
        const severe = a.textCollisions.filter(t => t.severity === 'severe');
        if (severe.length > 0) {
          lines.push('**Severe Text Collisions:**');
          severe.forEach(t => {
            lines.push(`- \`${t.element}\`: "${t.text.slice(0, 30)}" (ratio: ${t.collisionRatio})`);
          });
          lines.push('');
        }
      }
      
      const overflowButtons = a.buttons.filter(b => b.hasOverflow);
      if (overflowButtons.length > 0) {
        lines.push('**Buttons with Overflow:**');
        overflowButtons.slice(0, 5).forEach(b => {
          lines.push(`- [${b.index}] \`${b.tag}\`: "${b.text.slice(0, 30)}" (${b.overflowX}x${b.overflowY}px overflow)`);
        });
        lines.push('');
      }
      
      const tinyButtons = a.buttons.filter(b => 
        b.boundingBox.width < 44 || b.boundingBox.height < 44 ||
        b.computed.paddingTop < 4 || b.computed.paddingLeft < 4
      );
      if (tinyButtons.length > 0) {
        lines.push('**Undersized Buttons (<44px or tiny padding):**');
        tinyButtons.slice(0, 5).forEach(b => {
          lines.push(`- [${b.index}] \`${b.tag}\`: "${b.text.slice(0, 30)}" (${Math.round(b.boundingBox.width)}×${Math.round(b.boundingBox.height)}px, pad:${b.computed.paddingTop}/${b.computed.paddingLeft})`);
        });
        lines.push('');
      }
    });
    
    lines.push('---');
    lines.push('');
  });
  
  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  
  const allButtons = analyses.flatMap(a => a.buttons);
  const allCards = analyses.flatMap(a => a.cards);
  const allNesting = analyses.flatMap(a => a.invalidNesting);
  const allCollisions = analyses.flatMap(a => a.textCollisions);
  
  if (allNesting.length > 0) {
    lines.push('1. **Fix Invalid Nesting**: Remove nested interactive elements (buttons inside buttons, etc.)');
  }
  if (allCollisions.filter(c => c.severity === 'severe').length > 0) {
    lines.push('2. **Address Text Overflow**: Increase container width or reduce text/allow wrapping');
  }
  if (allButtons.filter(b => b.boundingBox.width < 44 || b.boundingBox.height < 44).length > 0) {
    lines.push('3. **Increase Touch Targets**: Ensure buttons are at least 44×44px for accessibility');
  }
  if (allCards.filter(c => !c.hasCardTitle).length > 0) {
    lines.push('4. **Add Card Titles**: Cards should have clear headings for structure');
  }
  
  return lines.join('\n');
}

// Main test suite
test.describe('Layout Probe - Temporary UI Analysis', () => {
  for (const pageConfig of pages) {
    for (const viewport of viewports) {
      test(`probe: ${pageConfig.name} @ ${viewport.name}`, async ({ page }) => {
        test.setTimeout(60000);
        
        console.log(`\n[PROBE] Analyzing ${pageConfig.path} at ${viewport.width}x${viewport.height}`);
        
        const analysis = await analyzePage(page, pageConfig, viewport);
        
        // Save detailed report
        const reportFile = path.join(REPORT_DIR, `${pageConfig.name}-${viewport.name}.md`);
        const reportContent = generatePageReport(analysis);
        fs.writeFileSync(reportFile, reportContent, 'utf-8');
        console.log(`[PROBE] Detailed report saved: ${reportFile}`);
        
        // Also save raw JSON for programmatic analysis
        const jsonFile = path.join(REPORT_DIR, `${pageConfig.name}-${viewport.name}.json`);
        fs.writeFileSync(jsonFile, JSON.stringify(analysis, null, 2), 'utf-8');
        console.log(`[PROBE] Raw data saved: ${jsonFile}`);
        
        // Print summary to stdout
        console.log(`[PROBE] Summary for ${pageConfig.name} @ ${viewport.name}:`);
        console.log(`  - Buttons: ${analysis.buttonSummary.total} (${analysis.buttonSummary.withOverflow} overflow, ${analysis.buttonSummary.tooSmall} too small)`);
        console.log(`  - Cards: ${analysis.cards.length} (${analysis.cardSummary.withoutTitle} without title)`);
        console.log(`  - Invalid nesting: ${analysis.invalidNesting.length}`);
        console.log(`  - Text collisions: ${analysis.textCollisions.length}`);
        console.log(`  - Critical issues: ${analysis.criticalIssues.length}`);
        console.log(`  - Warnings: ${analysis.warnings.length}`);
        
        if (analysis.criticalIssues.length > 0) {
          analysis.criticalIssues.forEach(i => console.log(`  ❌ ${i}`));
        }
        analysis.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
        
        // Store for final summary (using test info attachment)
        await test.info().attach(`${pageConfig.name}-${viewport.name}-analysis`, {
          body: JSON.stringify(analysis),
          contentType: 'application/json',
        });
      });
    }
  }

  // Final summary test that runs after all probes
  test('generate consolidated summary', async () => {
    // This test runs after all probes and generates the final summary
    // We collect all the JSON files and create a consolidated report
    
    const analyses: PageAnalysis[] = [];
    
    for (const pageConfig of pages) {
      for (const viewport of viewports) {
        const jsonFile = path.join(REPORT_DIR, `${pageConfig.name}-${viewport.name}.json`);
        if (fs.existsSync(jsonFile)) {
          const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
          analyses.push(data);
        }
      }
    }
    
    if (analyses.length > 0) {
      const summaryReport = generateSummaryReport(analyses);
      const summaryFile = path.join(REPORT_DIR, 'SUMMARY.md');
      fs.writeFileSync(summaryFile, summaryReport, 'utf-8');
      
      console.log('\n' + '='.repeat(60));
      console.log('LAYOUT PROBE COMPLETE');
      console.log('='.repeat(60));
      console.log(`\nReports saved to: ${REPORT_DIR}`);
      console.log(`- Individual reports: ${analyses.length} files`);
      console.log(`- Summary: ${summaryFile}`);
      
      // Print overall findings
      const totalCritical = analyses.reduce((sum, a) => sum + a.criticalIssues.length, 0);
      const totalWarnings = analyses.reduce((sum, a) => sum + a.warnings.length, 0);
      const totalInvalidNesting = analyses.reduce((sum, a) => sum + a.invalidNesting.length, 0);
      const totalCollisions = analyses.reduce((sum, a) => sum + a.textCollisions.length, 0);
      
      console.log('\n--- OVERALL FINDINGS ---');
      console.log(`Critical Issues: ${totalCritical}`);
      console.log(`Warnings: ${totalWarnings}`);
      console.log(`Invalid Nesting: ${totalInvalidNesting}`);
      console.log(`Text Collisions: ${totalCollisions}`);
      
      if (totalCritical > 0) {
        console.log('\n❌ Critical issues found - see SUMMARY.md for details');
      } else if (totalWarnings > 0) {
        console.log('\n⚠️ Warnings found - see SUMMARY.md for details');
      } else {
        console.log('\n✅ No layout issues detected');
      }
      
      // Attach summary to test results
      await test.info().attach('layout-probe-summary', {
        body: summaryReport,
        contentType: 'text/markdown',
      });
      
      // The test passes regardless - we're just collecting data
      expect(true).toBe(true);
    }
  });
});
