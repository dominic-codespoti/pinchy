# Verify Command

Runs text-only UI regression tests with Playwright. No screenshots—just DOM text and computed style assertions.

## Usage

```bash
kilo verify
```

## What it does

1. Starts the dev server (`make dev` or `cargo run`)
2. Runs Playwright tests in `web/e2e/` that probe visible text content
3. Asserts on exact text matches for critical UI elements (headings, button labels, status text)
4. Checks computed CSS values (colors, visibility) when verifying visual state

## Prerequisites

- Playwright installed in `web/`: `cd web && npx playwright install chromium`
- Dev server dependencies: Node.js + Rust toolchain

## Test patterns

Text-only probes avoid screenshot brittleness:

```typescript
// Assert on exact visible text
const heading = await page.locator('h1').filter({ visible: true }).textContent();
expect(heading).toContain('Commands');

// Check computed styles
const color = await page.locator('button').evaluate(el =>
  getComputedStyle(el).backgroundColor
);
expect(color).toBe('rgb(59, 130, 246)');
```

## CI-friendly path

For CI or headless environments, run the e2e suite directly:

```bash
cd web
npx playwright test --reporter=line
```

Tests run against `http://localhost:3000` (configurable via `BASE_URL`).

## When to use

- After major shadcn rewrites or route refactors
- Before submitting PRs with UI changes
- Verifying subagent UI work without screenshot diffs
