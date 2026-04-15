import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Design Audit Script
 *
 * Captures design-quality information including visual styling, spacing, overflow,
 * and responsive layout issues for LLM analysis.
 * Run: NEXT_PUBLIC_ENABLE_MOCKS=true npx playwright test e2e/design-audit.spec.ts
 * Output: e2e/snapshots/design-audit.md
 *
 * The report is designed to be fed to an LLM to identify design issues like:
 * - Inconsistent spacing and sizing
 * - Overflow/clipping issues
 * - Color contrast problems
 * - Empty or invisible elements
 * - Responsive layout breaks
 */

const REPORT_DIR = path.join(__dirname, 'snapshots');
const REPORT_FILE = path.join(REPORT_DIR, 'design-audit.md');

interface ViewportSize {
  name: string;
  width: number;
  height: number;
}

interface DOMNode {
  tag: string;
  classes: string;
  children: DOMNode[];
}

interface ComputedStyleInfo {
  selector: string;
  styles: Record<string, string>;
}

interface SpacingInfo {
  element: string;
  display: string;
  gap: string;
  largePadding?: string;
  largeMargin?: string;
}

interface OverflowInfo {
  element: string;
  tag: string;
  classes: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflowX: number;
  overflowY: number;
}

interface EmptyElementInfo {
  tag: string;
  classes: string;
  width: number;
  height: number;
  display: string;
  visibility: string;
}

interface ColorContrastInfo {
  text: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
}

interface ViewportOverflow {
  element: string;
  tag: string;
  classes: string;
  rect: {
    right: number;
    bottom: number;
  };
  viewportWidth: number;
}

interface EnhancedCardInfo {
  selector: string;
  styles: Record<string, string>;
  hasHeading: boolean;
  childCount: number;
}

interface SiblingConsistencyInfo {
  container: string;
  childCount: number;
  widths: number[];
  heights: number[];
  paddings: number[];
  deviations: string[];
}

interface TextOverflowInfo {
  element: string;
  text: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  fontSize: number;
  containerHeight: number;
}

interface InvalidNestingInfo {
  parent: string;
  child: string;
  parentClasses: string;
  childClasses: string;
  violation: string;
}

interface CardTitleConsistencyInfo {
  section: string;
  cardCount: number;
  titlesInside: number;
  titlesOutside: number;
  consistent: boolean;
}

interface PageDesignCapture {
  name: string;
  path: string;
  viewport: ViewportSize;
  domStructure: DOMNode | null;
  headingStyles: ComputedStyleInfo[];
  cardStyles: ComputedStyleInfo[];
  buttonStyles: ComputedStyleInfo[];
  tableStyles: ComputedStyleInfo[];
  mainStyles: ComputedStyleInfo | null;
  spacingAnalysis: SpacingInfo[];
  overflowIssues: OverflowInfo[];
  emptyElements: EmptyElementInfo[];
  colorSamples: ColorContrastInfo[];
  viewportOverflows: ViewportOverflow[];
  enhancedCardStyles: EnhancedCardInfo[];
  siblingConsistency: SiblingConsistencyInfo[];
  textOverflowIssues: TextOverflowInfo[];
  invalidNesting: InvalidNestingInfo[];
  cardTitleConsistency: CardTitleConsistencyInfo[];
  loadTimeMs: number;
  error?: string;
}

// Pages to inspect - same list as inspect-ui.spec.ts
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

const viewports: ViewportSize[] = [
  { name: 'Desktop', width: 1280, height: 720 },
  { name: 'Mobile', width: 375, height: 812 },
];

// Elements to focus on for DOM extraction
const STRUCTURAL_TAGS = new Set([
  'div', 'section', 'article', 'nav', 'header', 'footer', 'main', 'aside', 'form', 'table', 'ul', 'ol'
]);

async function extractDOMStructure(page: import('@playwright/test').Page): Promise<DOMNode | null> {
  return page.evaluate((structuralTags) => {
    const main = document.querySelector('main');
    if (!main) return null;

    function simplifyNode(node: Element, depth: number): DOMNode | null {
      // Stop at 4 levels deep
      if (depth > 4) return null;

      const tag = node.tagName.toLowerCase();
      const classes = node.className || '';

      // Only include structural tags or elements with classes
      if (!structuralTags.includes(tag) && !classes && depth > 1) {
        return null;
      }

      const children: DOMNode[] = [];

      // Get direct children only
      for (const child of Array.from(node.children)) {
        const simplified = simplifyNode(child, depth + 1);
        if (simplified) {
          children.push(simplified);
        }
      }

      return {
        tag,
        classes: typeof classes === 'string' ? classes : '',
        children,
      };
    }

    return simplifyNode(main, 1);
  }, Array.from(STRUCTURAL_TAGS));
}

async function extractHeadingStyles(page: import('@playwright/test').Page): Promise<ComputedStyleInfo[]> {
  return page.evaluate(() => {
    const results: ComputedStyleInfo[] = [];
    const headings = document.querySelectorAll('h1, h2, h3');

    headings.forEach((heading, index) => {
      const style = window.getComputedStyle(heading);
      results.push({
        selector: `${heading.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
        styles: {
          'font-size': style.fontSize,
          'font-weight': style.fontWeight,
          'color': style.color,
          'margin-top': style.marginTop,
          'margin-bottom': style.marginBottom,
        },
      });
    });

    return results;
  });
}

async function extractCardStyles(page: import('@playwright/test').Page): Promise<ComputedStyleInfo[]> {
  return page.evaluate(() => {
    const results: ComputedStyleInfo[] = [];
    // Match .card class or data-slot="card" attribute
    const cards = document.querySelectorAll('.card, [data-slot="card"]');

    cards.forEach((card, index) => {
      if (index >= 10) return; // First 10 only
      const style = window.getComputedStyle(card);
      results.push({
        selector: `.card:nth-of-type(${index + 1})`,
        styles: {
          'padding': style.padding,
          'margin': style.margin,
          'border-radius': style.borderRadius,
          'background-color': style.backgroundColor,
          'box-shadow': style.boxShadow,
        },
      });
    });

    return results;
  });
}

async function extractButtonStyles(page: import('@playwright/test').Page): Promise<ComputedStyleInfo[]> {
  return page.evaluate(() => {
    const results: ComputedStyleInfo[] = [];
    const buttons = document.querySelectorAll('button, [role="button"]');

    buttons.forEach((button, index) => {
      if (index >= 10) return; // First 10 only
      const style = window.getComputedStyle(button);
      results.push({
        selector: `button:nth-of-type(${index + 1})`,
        styles: {
          'padding': style.padding,
          'height': style.height,
          'font-size': style.fontSize,
          'border-radius': style.borderRadius,
        },
      });
    });

    return results;
  });
}

async function extractTableStyles(page: import('@playwright/test').Page): Promise<ComputedStyleInfo[]> {
  return page.evaluate(() => {
    const results: ComputedStyleInfo[] = [];
    const tables = document.querySelectorAll('table');

    tables.forEach((table, index) => {
      const style = window.getComputedStyle(table);
      results.push({
        selector: `table:nth-of-type(${index + 1})`,
        styles: {
          'width': style.width,
          'border-collapse': style.borderCollapse,
        },
      });
    });

    return results;
  });
}

async function extractMainStyles(page: import('@playwright/test').Page): Promise<ComputedStyleInfo | null> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;

    const style = window.getComputedStyle(main);
    return {
      selector: 'main',
      styles: {
        'padding': style.padding,
        'max-width': style.maxWidth,
        'gap': style.gap,
      },
    };
  });
}

async function analyzeSpacing(page: import('@playwright/test').Page): Promise<SpacingInfo[]> {
  return page.evaluate(() => {
    const results: SpacingInfo[] = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const display = style.display;

      // Check for flex/grid containers
      if (display === 'flex' || display === 'grid') {
        const gap = style.gap;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
                       parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const margin = parseFloat(style.marginTop) + parseFloat(style.marginBottom) +
                       parseFloat(style.marginLeft) + parseFloat(style.marginRight);

        const spacingInfo: SpacingInfo = {
          element: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
          display,
          gap,
        };

        // Flag large padding/margin (> 48px)
        if (padding > 48) {
          spacingInfo.largePadding = `${padding}px (padding)`;
        }
        if (margin > 48) {
          spacingInfo.largeMargin = `${margin}px (margin)`;
        }

        if (gap !== '0px' || padding > 48 || margin > 48) {
          results.push(spacingInfo);
        }
      }
    });

    // Limit results to avoid overwhelming output
    return results.slice(0, 20);
  });
}

async function detectOverflow(page: import('@playwright/test').Page): Promise<OverflowInfo[]> {
  return page.evaluate(() => {
    const results: OverflowInfo[] = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;

      // Check for overflow
      if (scrollWidth > clientWidth || scrollHeight > clientHeight) {
        // Handle SVGAnimatedString case
        const className = typeof el.className === 'string' ? el.className : '';
        results.push({
          element: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${className ? '.' + className.split(' ')[0] : ''}`,
          tag: el.tagName.toLowerCase(),
          classes: className,
          scrollWidth,
          clientWidth,
          scrollHeight,
          clientHeight,
          overflowX: scrollWidth - clientWidth,
          overflowY: scrollHeight - clientHeight,
        });
      }
    });

    // Sort by overflow amount and limit
    return results
      .sort((a, b) => Math.max(b.overflowX, b.overflowY) - Math.max(a.overflowX, a.overflowY))
      .slice(0, 15);
  });
}

async function detectEmptyInvisibleElements(page: import('@playwright/test').Page): Promise<EmptyElementInfo[]> {
  return page.evaluate(() => {
    const results: EmptyElementInfo[] = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      // Check for 0 width or height but not explicitly hidden
      const isHidden = style.display === 'none' || style.visibility === 'hidden';
      const hasZeroSize = rect.width === 0 || rect.height === 0;
      const isMeaningful = el.children.length > 0 || (el.textContent?.trim() || '').length > 0;

      // Skip if it's a known empty element or not meaningful
      const emptyTags = ['script', 'style', 'link', 'meta', 'br', 'hr', 'wbr'];
      if (emptyTags.includes(el.tagName.toLowerCase())) return;

      if (hasZeroSize && !isHidden && isMeaningful) {
        // Handle SVGAnimatedString case
        const className = typeof el.className === 'string' ? el.className : '';
        results.push({
          tag: el.tagName.toLowerCase(),
          classes: className,
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
        });
      }
    });

    return results.slice(0, 20);
  });
}

async function sampleColorContrast(page: import('@playwright/test').Page): Promise<ColorContrastInfo[]> {
  return page.evaluate(() => {
    const results: ColorContrastInfo[] = [];
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label, td, th, li');

    let count = 0;
    for (const el of Array.from(textElements)) {
      if (count >= 20) break; // First 20 only

      const rect = el.getBoundingClientRect();
      // Only visible elements in viewport
      if (rect.top < 0 || rect.top > window.innerHeight) continue;
      if (rect.width === 0 || rect.height === 0) continue;

      const text = (el.textContent || '').trim().slice(0, 50);
      if (!text) continue;

      const style = window.getComputedStyle(el);
      const color = style.color;

      // Find nearest ancestor with background color
      let bgColor = 'transparent';
      let parent: Element | null = el;
      while (parent && bgColor === 'transparent') {
        const parentStyle = window.getComputedStyle(parent);
        const parentBg = parentStyle.backgroundColor;
        if (parentBg && parentBg !== 'transparent' && parentBg !== 'rgba(0, 0, 0, 0)') {
          bgColor = parentBg;
          break;
        }
        parent = parent.parentElement;
      }

      results.push({
        text,
        color,
        backgroundColor: bgColor,
        fontSize: style.fontSize,
      });
      count++;
    }

    return results;
  });
}

async function detectViewportOverflow(page: import('@playwright/test').Page): Promise<ViewportOverflow[]> {
  return page.evaluate(() => {
    const results: ViewportOverflow[] = [];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      // Skip hidden elements
      if (style.display === 'none' || style.visibility === 'hidden') return;

      // Check if element extends beyond viewport width
      if (rect.right > viewportWidth + 5) { // +5 for tolerance
        // Handle SVGAnimatedString case
        const className = typeof el.className === 'string' ? el.className : '';
        results.push({
          element: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${className ? '.' + className.split(' ')[0] : ''}`,
          tag: el.tagName.toLowerCase(),
          classes: className,
          rect: {
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
          viewportWidth,
        });
      }
    });

    return results.slice(0, 10);
  });
}

// 1. Enhanced card detection — find card-like elements by visual properties
async function extractEnhancedCardStyles(page: import('@playwright/test').Page): Promise<EnhancedCardInfo[]> {
  return page.evaluate(() => {
    const results: EnhancedCardInfo[] = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el, index) => {
      if (index > 200) return; // Limit for performance

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip hidden or tiny elements
      if (style.display === 'none' || rect.width < 50 || rect.height < 50) return;

      // Check for card-like visual properties
      const borderRadius = parseFloat(style.borderRadius);
      const borderWidth = parseFloat(style.borderWidth);
      const paddingTop = parseFloat(style.paddingTop);
      const paddingLeft = parseFloat(style.paddingLeft);
      const hasBackground = style.backgroundColor &&
        style.backgroundColor !== 'transparent' &&
        style.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const hasShadow = style.boxShadow && style.boxShadow !== 'none';

      // Also check for explicit card attributes
      const hasCardAttr = el.hasAttribute('data-slot') && el.getAttribute('data-slot') === 'card';
      const hasCardClass = el.classList.contains('card');
      const hasRegionRole = el.getAttribute('role') === 'region';

      // Check for common card-like class patterns
      const classNameStr = typeof el.className === 'string' ? el.className.toLowerCase() : '';
      const hasCardLikeClass = classNameStr.includes('card') ||
        classNameStr.includes('panel') ||
        classNameStr.includes('tile') ||
        classNameStr.includes('box') ||
        classNameStr.includes('surface');

      // Card-like detection:
      // 1. Has card class/attr/role
      // 2. Has border-radius AND (border OR background OR shadow) AND padding
      // 3. Has background AND padding AND (shadow OR border OR border-radius)
      // 4. Has card-like class AND background AND padding
      const looksLikeCard = hasCardAttr ||
        hasCardClass ||
        hasRegionRole ||
        (borderRadius > 0 && (borderWidth > 0 || hasBackground || hasShadow) && paddingTop > 4) ||
        (hasBackground && paddingTop > 8 && (hasShadow || borderWidth > 0 || borderRadius > 0)) ||
        (hasCardLikeClass && hasBackground && paddingTop > 4);

      if (looksLikeCard) {
        // Handle SVGAnimatedString case
        const className = typeof el.className === 'string' ? el.className : '';
        const hasHeading = el.querySelector('h1, h2, h3, h4, h5, h6') !== null;

        results.push({
          selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${className ? '.' + className.split(' ')[0] : ''}:nth-of-type(${index + 1})`,
          styles: {
            'border-radius': style.borderRadius,
            'border-width': style.borderWidth,
            'padding': style.padding,
            'background-color': style.backgroundColor,
            'box-shadow': style.boxShadow === 'none' ? 'none' : 'present',
            'width': `${Math.round(rect.width)}px`,
            'height': `${Math.round(rect.height)}px`,
          },
          hasHeading,
          childCount: el.children.length,
        });
      }
    });

    return results.slice(0, 15);
  });
}

// 2. Sibling consistency check
async function checkSiblingConsistency(page: import('@playwright/test').Page): Promise<SiblingConsistencyInfo[]> {
  return page.evaluate(() => {
    const results: SiblingConsistencyInfo[] = [];

    // Find all grid and flex containers
    const containers = document.querySelectorAll('[class*="grid"], [class*="flex"], [style*="display: flex"], [style*="display: grid"]');

    containers.forEach((container) => {
      const style = window.getComputedStyle(container);
      // Only check actual flex/grid containers with multiple children
      if ((style.display === 'flex' || style.display === 'grid') && container.children.length >= 3) {
        const children = Array.from(container.children).filter(child => {
          const childStyle = window.getComputedStyle(child);
          return childStyle.display !== 'none';
        });

        if (children.length < 3) return;

        const widths: number[] = [];
        const heights: number[] = [];
        const paddings: number[] = [];

        children.forEach(child => {
          const rect = child.getBoundingClientRect();
          const childStyle = window.getComputedStyle(child);
          widths.push(rect.width);
          heights.push(rect.height);
          paddings.push(parseFloat(childStyle.paddingTop) + parseFloat(childStyle.paddingBottom));
        });

        // Calculate medians
        const sortedWidths = [...widths].sort((a, b) => a - b);
        const sortedHeights = [...heights].sort((a, b) => a - b);
        const sortedPaddings = [...paddings].sort((a, b) => a - b);

        const medianWidth = sortedWidths[Math.floor(sortedWidths.length / 2)];
        const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];
        const medianPadding = sortedPaddings[Math.floor(sortedPaddings.length / 2)];

        // Find deviations > 10%
        const deviations: string[] = [];
        children.forEach((child, i) => {
          const className = typeof child.className === 'string' ? child.className : '';
          const id = child.id || `${child.tagName.toLowerCase()}:${i}`;

          if (medianWidth > 0 && Math.abs(widths[i] - medianWidth) / medianWidth > 0.1) {
            deviations.push(`${id}: width ${widths[i]}px vs median ${medianWidth}px`);
          }
          if (medianHeight > 0 && Math.abs(heights[i] - medianHeight) / medianHeight > 0.1) {
            deviations.push(`${id}: height ${heights[i]}px vs median ${medianHeight}px`);
          }
          if (medianPadding > 0 && Math.abs(paddings[i] - medianPadding) / medianPadding > 0.1) {
            deviations.push(`${id}: padding ${paddings[i]}px vs median ${medianPadding}px`);
          }
        });

        // Only report if there are deviations
        if (deviations.length > 0) {
          // Handle SVGAnimatedString case
          const containerClassName = typeof container.className === 'string' ? container.className : '';
          results.push({
            container: `${container.tagName.toLowerCase()}${container.id ? '#' + container.id : ''}${containerClassName ? '.' + containerClassName.split(' ')[0] : ''}`,
            childCount: children.length,
            widths,
            heights,
            paddings,
            deviations,
          });
        }
      }
    });

    return results.slice(0, 10);
  });
}

// 3. Text overflow / clipping detection
async function detectTextOverflow(page: import('@playwright/test').Page): Promise<TextOverflowInfo[]> {
  return page.evaluate(() => {
    const results: TextOverflowInfo[] = [];
    const interactiveElements = document.querySelectorAll('button, a, [role="button"], [role="link"], label, .btn, [class*="button"]');

    interactiveElements.forEach((el) => {
      const style = window.getComputedStyle(el);

      // Skip hidden elements
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;

      // Check for overflow
      const hasOverflow = scrollWidth > clientWidth + 1 || scrollHeight > clientHeight + 1;

      // Check font size vs container height
      const fontSize = parseFloat(style.fontSize);
      const hasOversizedFont = fontSize > clientHeight - 2; // Allow 2px padding

      if (hasOverflow || hasOversizedFont) {
        // Handle SVGAnimatedString case
        const className = typeof el.className === 'string' ? el.className : '';
        const text = (el.textContent || '').trim().slice(0, 50);

        results.push({
          element: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${className ? '.' + className.split(' ')[0] : ''}`,
          text,
          scrollWidth,
          clientWidth,
          scrollHeight,
          clientHeight,
          fontSize,
          containerHeight: clientHeight,
        });
      }
    });

    return results.slice(0, 15);
  });
}

// 4. Invalid HTML nesting detection
async function detectInvalidNesting(page: import('@playwright/test').Page): Promise<InvalidNestingInfo[]> {
  return page.evaluate(() => {
    const results: InvalidNestingInfo[] = [];
    const interactiveSelectors = 'button, a, [role="button"], [role="link"]';
    const allInteractive = document.querySelectorAll(interactiveSelectors);

    allInteractive.forEach((parent) => {
      // Check for nested interactive elements
      const nestedButtons = parent.querySelectorAll('button, [role="button"]');
      const nestedLinks = parent.querySelectorAll('a, [role="link"]');

      nestedButtons.forEach((child) => {
        if (parent !== child) {
          const parentClassName = typeof parent.className === 'string' ? parent.className : '';
          const childClassName = typeof child.className === 'string' ? child.className : '';
          results.push({
            parent: `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}`,
            child: `${child.tagName.toLowerCase()}${child.id ? '#' + child.id : ''}`,
            parentClasses: parentClassName.split(' ').slice(0, 3).join(' '),
            childClasses: childClassName.split(' ').slice(0, 3).join(' '),
            violation: 'button/button or button/[role="button"]',
          });
        }
      });

      nestedLinks.forEach((child) => {
        if (parent !== child) {
          const parentClassName = typeof parent.className === 'string' ? parent.className : '';
          const childClassName = typeof child.className === 'string' ? child.className : '';
          results.push({
            parent: `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}`,
            child: `${child.tagName.toLowerCase()}${child.id ? '#' + child.id : ''}`,
            parentClasses: parentClassName.split(' ').slice(0, 3).join(' '),
            childClasses: childClassName.split(' ').slice(0, 3).join(' '),
            violation: `${parent.tagName.toLowerCase()}/a or ${parent.tagName.toLowerCase()}/[role="link"]`,
          });
        }
      });
    });

    // Also check for specific problematic patterns
    const buttonLinks = document.querySelectorAll('button a, a button');
    buttonLinks.forEach((el) => {
      const parent = el.parentElement;
      if (parent) {
        const parentClassName = typeof parent.className === 'string' ? parent.className : '';
        const elClassName = typeof el.className === 'string' ? el.className : '';
        results.push({
          parent: `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}`,
          child: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`,
          parentClasses: parentClassName.split(' ').slice(0, 3).join(' '),
          childClasses: elClassName.split(' ').slice(0, 3).join(' '),
          violation: `${parent.tagName.toLowerCase()}>${el.tagName.toLowerCase()}`,
        });
      }
    });

    return results.slice(0, 15);
  });
}

// 5. Card title consistency
async function checkCardTitleConsistency(page: import('@playwright/test').Page): Promise<CardTitleConsistencyInfo[]> {
  return page.evaluate(() => {
    const results: CardTitleConsistencyInfo[] = [];

    // Find sections that likely contain cards (sections, grids with multiple card-like children)
    const sections = document.querySelectorAll('section, [class*="grid"], [class*="cards"], article');

    sections.forEach((section) => {
      // Find card-like children
      const children = Array.from(section.children);
      const cardLikeChildren = children.filter(child => {
        const style = window.getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        const borderRadius = parseFloat(style.borderRadius);
        const hasBackground = style.backgroundColor &&
          style.backgroundColor !== 'transparent' &&
          style.backgroundColor !== 'rgba(0, 0, 0, 0)';

        return rect.width > 100 && rect.height > 80 && (borderRadius > 0 || hasBackground);
      });

      if (cardLikeChildren.length >= 2) {
        let titlesInside = 0;
        let titlesOutside = 0;

        cardLikeChildren.forEach(card => {
          // Check for heading inside the card
          const hasInternalTitle = card.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]') !== null;

          // Check for heading immediately before the card
          let hasExternalTitle = false;
          let prevSibling = card.previousElementSibling;
          while (prevSibling) {
            if (prevSibling.querySelector('h1, h2, h3, h4, h5, h6') ||
                /h[1-6]/i.test(prevSibling.tagName)) {
              hasExternalTitle = true;
              break;
            }
            // Stop if we hit another card-like element
            const prevStyle = window.getComputedStyle(prevSibling);
            if (parseFloat(prevStyle.borderRadius) > 0 ||
                (prevStyle.backgroundColor && prevStyle.backgroundColor !== 'transparent')) {
              break;
            }
            prevSibling = prevSibling.previousElementSibling;
          }

          if (hasInternalTitle) titlesInside++;
          if (hasExternalTitle) titlesOutside++;
        });

        // If we have a mix, flag it
        if ((titlesInside > 0 && titlesOutside > 0) || (titlesInside > 0 && titlesOutside === 0 && cardLikeChildren.length > 2)) {
          // Check consistency
          const allHaveInternal = titlesInside === cardLikeChildren.length;
          const allHaveExternal = titlesOutside === cardLikeChildren.length;
          const consistent = allHaveInternal || allHaveExternal;

          const sectionClassName = typeof section.className === 'string' ? section.className : '';
          results.push({
            section: `${section.tagName.toLowerCase()}${section.id ? '#' + section.id : ''}${sectionClassName ? '.' + sectionClassName.split(' ')[0] : ''}`,
            cardCount: cardLikeChildren.length,
            titlesInside,
            titlesOutside,
            consistent,
          });
        }
      }
    });

    return results.slice(0, 10);
  });
}

async function capturePageDesign(
  page: import('@playwright/test').Page,
  pageConfig: { path: string; name: string },
  viewport: ViewportSize
): Promise<PageDesignCapture> {
  const startTime = Date.now();

  // Set viewport size
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Navigate
  await page.goto(pageConfig.path, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });

  // Wait for React to settle
  await page.waitForTimeout(1500);

  const loadTimeMs = Date.now() - startTime;

  // Run all extraction functions
  const [
    domStructure,
    headingStyles,
    cardStyles,
    buttonStyles,
    tableStyles,
    mainStyles,
    spacingAnalysis,
    overflowIssues,
    emptyElements,
    colorSamples,
    viewportOverflows,
    enhancedCardStyles,
    siblingConsistency,
    textOverflowIssues,
    invalidNesting,
    cardTitleConsistency,
  ] = await Promise.all([
    extractDOMStructure(page),
    extractHeadingStyles(page),
    extractCardStyles(page),
    extractButtonStyles(page),
    extractTableStyles(page),
    extractMainStyles(page),
    analyzeSpacing(page),
    detectOverflow(page),
    detectEmptyInvisibleElements(page),
    sampleColorContrast(page),
    detectViewportOverflow(page),
    extractEnhancedCardStyles(page),
    checkSiblingConsistency(page),
    detectTextOverflow(page),
    detectInvalidNesting(page),
    checkCardTitleConsistency(page),
  ]);

  return {
    name: pageConfig.name,
    path: pageConfig.path,
    viewport,
    domStructure,
    headingStyles,
    cardStyles,
    buttonStyles,
    tableStyles,
    mainStyles,
    spacingAnalysis,
    overflowIssues,
    emptyElements,
    colorSamples,
    viewportOverflows,
    enhancedCardStyles,
    siblingConsistency,
    textOverflowIssues,
    invalidNesting,
    cardTitleConsistency,
    loadTimeMs,
  };
}

function formatDOMTree(node: DOMNode, indent: string = ''): string {
  const classPart = node.classes ? ` class="${node.classes.split(' ').slice(0, 5).join(' ')}"` : '';
  let result = `${indent}<${node.tag}${classPart}>`;

  if (node.children.length > 0) {
    result += '\n';
    for (const child of node.children) {
      result += formatDOMTree(child, indent + '  ');
    }
    result += `${indent}</${node.tag}>\n`;
  } else {
    result += `</${node.tag}>\n`;
  }

  return result;
}

function formatStylesTable(styles: ComputedStyleInfo[]): string {
  if (styles.length === 0) return '*No elements found*\n';

  const lines: string[] = [];
  lines.push('| Element | Property | Value |');
  lines.push('|---------|----------|-------|');

  for (const info of styles) {
    for (const [prop, value] of Object.entries(info.styles)) {
      lines.push(`| ${info.selector} | ${prop} | ${value} |`);
    }
  }

  return lines.join('\n') + '\n';
}

function generateReport(captures: PageDesignCapture[]): string {
  const lines: string[] = [];

  lines.push('# Pinchy Web Design Audit Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Pages inspected: ${captures.length / 2} (×2 viewports each)`);
  lines.push(`Viewports: Desktop (1280×720), Mobile (375×812)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary by viewport
  lines.push('## Summary by Viewport');
  lines.push('');

  for (const viewport of viewports) {
    const viewportCaptures = captures.filter(c => c.viewport.name === viewport.name);
    lines.push(`### ${viewport.name} (${viewport.width}×${viewport.height})`);
    lines.push('');

    lines.push('| Page | Load (ms) | Cards | Buttons | Tables | Overflow Issues | Empty Elements |');
    lines.push('|------|-----------|-------|---------|--------|-----------------|----------------|');

    for (const c of viewportCaptures) {
      if (c.error) {
        lines.push(`| ${c.name} | ERROR | - | - | - | - | - |`);
      } else {
        lines.push(
          `| ${c.name} | ${c.loadTimeMs} | ${c.cardStyles.length} | ${c.buttonStyles.length} | ${c.tableStyles.length} | ${c.overflowIssues.length} | ${c.emptyElements.length} |`
        );
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Detailed sections per page per viewport
  for (const c of captures) {
    lines.push(`## ${c.name} — ${c.viewport.name}`);
    lines.push('');
    lines.push(`- **Route:** \`${c.path}\``);
    lines.push(`- **Viewport:** ${c.viewport.width}×${c.viewport.height}`);
    lines.push(`- **Load time:** ${c.loadTimeMs}ms`);
    lines.push('');

    if (c.error) {
      lines.push(`**Error:** ${c.error}`);
      lines.push('');
      lines.push('---');
      lines.push('');
      continue;
    }

    // DOM Structure
    lines.push('### DOM Structure (Main Element, 4 levels deep)');
    lines.push('');
    if (c.domStructure) {
      lines.push('```html');
      lines.push(formatDOMTree(c.domStructure, '').trim());
      lines.push('```');
    } else {
      lines.push('*No `<main>` element found*');
    }
    lines.push('');

    // Computed Styles
    lines.push('### Computed Styles');
    lines.push('');

    if (c.headingStyles.length > 0) {
      lines.push('#### Headings (h1, h2, h3)');
      lines.push('');
      lines.push(formatStylesTable(c.headingStyles));
    }

    if (c.cardStyles.length > 0) {
      lines.push('#### Cards (.card, [data-slot="card"])');
      lines.push('');
      lines.push(formatStylesTable(c.cardStyles));
    }

    if (c.buttonStyles.length > 0) {
      lines.push('#### Buttons (button, [role="button"])');
      lines.push('');
      lines.push(formatStylesTable(c.buttonStyles));
    }

    if (c.tableStyles.length > 0) {
      lines.push('#### Tables');
      lines.push('');
      lines.push(formatStylesTable(c.tableStyles));
    }

    if (c.mainStyles) {
      lines.push('#### Main Element');
      lines.push('');
      lines.push(formatStylesTable([c.mainStyles]));
    }

    // Spacing Analysis
    if (c.spacingAnalysis.length > 0) {
      lines.push('### Spacing Analysis (Flex/Grid Containers)');
      lines.push('');
      lines.push('| Element | Display | Gap | Notes |');
      lines.push('|---------|---------|-----|-------|');
      for (const info of c.spacingAnalysis) {
        const notes = [info.largePadding, info.largeMargin].filter(Boolean).join(', ') || '-';
        lines.push(`| ${info.element} | ${info.display} | ${info.gap} | ${notes} |`);
      }
      lines.push('');
    }

    // Overflow Issues
    if (c.overflowIssues.length > 0) {
      lines.push('### Overflow Detection');
      lines.push('');
      lines.push('| Element | Tag | Classes | Overflow X | Overflow Y |');
      lines.push('|---------|-----|---------|------------|------------|');
      for (const info of c.overflowIssues) {
        const classes = info.classes.split(' ').slice(0, 3).join(' ') || '-';
        lines.push(`| ${info.element} | ${info.tag} | ${classes} | ${info.overflowX}px | ${info.overflowY}px |`);
      }
      lines.push('');
    }

      // Empty/Invisible Elements
    if (c.emptyElements.length > 0) {
      lines.push('### Empty/Invisible Elements (Potential Bugs)');
      lines.push('');
      lines.push('| Tag | Classes | Width | Height | Display |');
      lines.push('|-----|---------|-------|--------|---------|');
      for (const info of c.emptyElements) {
        const classes = typeof info.classes === 'string' ? info.classes.split(' ').slice(0, 3).join(' ') || '-' : '-';
        lines.push(`| ${info.tag} | ${classes} | ${info.width}px | ${info.height}px | ${info.display} |`);
      }
      lines.push('');
    }

    // Color Contrast Samples
    if (c.colorSamples.length > 0) {
      lines.push('### Color Contrast Sampling (First 20 visible text elements)');
      lines.push('');
      lines.push('| Text | Font Size | Color | Background |');
      lines.push('|------|-----------|-------|------------|');
      for (const info of c.colorSamples) {
        const text = info.text.length > 30 ? info.text.slice(0, 30) + '...' : info.text;
        lines.push(`| ${text} | ${info.fontSize} | ${info.color} | ${info.backgroundColor} |`);
      }
      lines.push('');
    }

    // Viewport Overflow
    if (c.viewportOverflows.length > 0) {
      lines.push('### Viewport Overflow (Elements extending beyond viewport)');
      lines.push('');
      lines.push('| Element | Tag | Right Edge | Viewport Width | Overflow |');
      lines.push('|---------|-----|------------|----------------|----------|');
      for (const info of c.viewportOverflows) {
        const classes = info.classes.split(' ').slice(0, 2).join(' ') || '-';
        const overflow = info.rect.right - info.viewportWidth;
        lines.push(`| ${info.element} | ${info.tag} | ${info.rect.right}px | ${info.viewportWidth}px | +${overflow}px |`);
      }
      lines.push('');
      lines.push('⚠️ **These elements may cause horizontal scrolling**');
      lines.push('');
    }

    // Enhanced Card Styles
    if (c.enhancedCardStyles.length > 0) {
      lines.push('### Enhanced Card Styles (Visual Detection)');
      lines.push('');
      lines.push('| Selector | Border Radius | Border | Padding | Background | Has Heading |');
      lines.push('|----------|---------------|--------|---------|------------|-------------|');
      for (const info of c.enhancedCardStyles) {
        lines.push(`| ${info.selector.slice(0, 40)} | ${info.styles['border-radius']} | ${info.styles['border-width']} | ${info.styles['padding']} | ${info.styles['background-color'] === 'transparent' ? 'none' : 'yes'} | ${info.hasHeading ? '✓' : '✗'} |`);
      }
      lines.push('');
    }

    // Sibling Consistency
    if (c.siblingConsistency.length > 0) {
      lines.push('### Sibling Consistency Issues');
      lines.push('');
      for (const info of c.siblingConsistency) {
        lines.push(`**Container:** ${info.container} (${info.childCount} children)`);
        lines.push('');
        lines.push('Deviations detected:');
        for (const deviation of info.deviations) {
          lines.push(`- ${deviation}`);
        }
        lines.push('');
      }
      lines.push('⚠️ **Children should have consistent sizing within the same container**');
      lines.push('');
    }

    // Text Overflow
    if (c.textOverflowIssues.length > 0) {
      lines.push('### Text Overflow / Clipping Issues');
      lines.push('');
      lines.push('| Element | Text | Scroll W | Client W | Scroll H | Client H | Font Size |');
      lines.push('|---------|------|----------|----------|----------|----------|-----------|');
      for (const info of c.textOverflowIssues) {
        const text = info.text.length > 20 ? info.text.slice(0, 20) + '...' : info.text || '(empty)';
        lines.push(`| ${info.element.slice(0, 30)} | ${text} | ${info.scrollWidth}px | ${info.clientWidth}px | ${info.scrollHeight}px | ${info.clientHeight}px | ${info.fontSize}px |`);
      }
      lines.push('');
      lines.push('⚠️ **Elements with scrollWidth > clientWidth may have clipped text**');
      lines.push('');
    }

    // Invalid Nesting
    if (c.invalidNesting.length > 0) {
      lines.push('### Invalid HTML Nesting Violations');
      lines.push('');
      lines.push('| Parent | Child | Violation | Parent Classes | Child Classes |');
      lines.push('|--------|-------|-----------|----------------|---------------|');
      for (const info of c.invalidNesting) {
        lines.push(`| ${info.parent} | ${info.child} | ${info.violation} | ${info.parentClasses || '-'} | ${info.childClasses || '-'} |`);
      }
      lines.push('');
      lines.push('🚫 **Interactive elements should not be nested inside each other**');
      lines.push('');
    }

    // Card Title Consistency
    if (c.cardTitleConsistency.length > 0) {
      lines.push('### Card Title Placement Consistency');
      lines.push('');
      lines.push('| Section | Card Count | Titles Inside | Titles Outside | Consistent |');
      lines.push('|---------|------------|---------------|----------------|------------|');
      for (const info of c.cardTitleConsistency) {
        const consistent = info.consistent ? '✓' : '✗ MISMATCH';
        lines.push(`| ${info.section.slice(0, 30)} | ${info.cardCount} | ${info.titlesInside} | ${info.titlesOutside} | ${consistent} |`);
      }
      lines.push('');
      if (c.cardTitleConsistency.some(i => !i.consistent)) {
        lines.push('⚠️ **Some sections have inconsistent title placement (inside vs outside cards)**');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Main test
test('design audit for all pages', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes

  // Ensure output directory exists
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const allCaptures: PageDesignCapture[] = [];

  for (const pageConfig of pages) {
    for (const viewport of viewports) {
      console.log(`Auditing: ${pageConfig.name} (${pageConfig.path}) at ${viewport.name}`);

      try {
        const capture = await capturePageDesign(page, pageConfig, viewport);
        allCaptures.push(capture);
      } catch (error) {
        console.error(`Failed to audit ${pageConfig.path} at ${viewport.name}:`, error);
        allCaptures.push({
          name: pageConfig.name,
          path: pageConfig.path,
          viewport,
          domStructure: null,
          headingStyles: [],
          cardStyles: [],
          buttonStyles: [],
          tableStyles: [],
          mainStyles: null,
          spacingAnalysis: [],
          overflowIssues: [],
          emptyElements: [],
          colorSamples: [],
          viewportOverflows: [],
          enhancedCardStyles: [],
          siblingConsistency: [],
          textOverflowIssues: [],
          invalidNesting: [],
          cardTitleConsistency: [],
          loadTimeMs: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Generate and write report
  const report = generateReport(allCaptures);
  fs.writeFileSync(REPORT_FILE, report, 'utf-8');

  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(`Inspected ${pages.length} pages × ${viewports.length} viewports = ${allCaptures.length} captures`);
});
