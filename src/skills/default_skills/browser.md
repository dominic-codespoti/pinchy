---
name: browser
description: "Multi-action headless browser with persistent session. Navigate, click, extract links, read text, go back — all within a single browsing session."
---
# Browser Skill

Headless browser with a **persistent session** — navigate to pages, click links, extract content, and go back, all across multiple tool calls.

## Actions

| Action      | Description |
|-------------|-------------|
| `navigate`  | Go to a URL and return page text (default if `url` provided) |
| `click`     | Click a link/button by CSS selector or by matching text |
| `links`     | List all links on the current page with their URLs |
| `text`      | Re-read the current page text (no navigation) |
| `eval`      | Evaluate a JavaScript expression in the page |
| `back`      | Go back in browser history |
| `screenshot`| Capture a screenshot |
| `reset`     | Close the browser session and start fresh |

## Arguments

| Argument           | Used by       | Description |
|--------------------|---------------|-------------|
| `action`           | all           | Which action to perform (default: `navigate` if url given) |
| `url`              | navigate      | URL to navigate to |
| `selector`         | navigate/click/text/links | CSS selector to scope extraction or click target |
| `text`             | click         | Find and click a link/button containing this text |
| `index`            | click         | Which match to click if multiple (0-based, default 0) |
| `extract`          | navigate/text | `text` (default) or `html` |
| `expression`       | eval          | JavaScript expression to evaluate |
| `wait_ms`          | navigate/click | Wait N ms after action for dynamic content |
| `content_selector` | click         | CSS selector to extract content from after clicking |
| `limit`            | links         | Max links to return (default 50) |
| `headless`         | all           | `true` (default) or `false` for visible browser |

## Examples

Navigate to a page:
```json
{ "name": "browser", "args": { "url": "https://news.ycombinator.com" } }
```

List all links on the current page:
```json
{ "name": "browser", "args": { "action": "links" } }
```

Click a link by its text:
```json
{ "name": "browser", "args": { "action": "click", "text": "comments" } }
```

Click a specific CSS element:
```json
{ "name": "browser", "args": { "action": "click", "selector": "a.storylink" } }
```

Read a specific section of the current page:
```json
{ "name": "browser", "args": { "action": "text", "selector": ".comment-tree" } }
```

Go back to the previous page:
```json
{ "name": "browser", "args": { "action": "back" } }
```

Get links from a specific section only:
```json
{ "name": "browser", "args": { "action": "links", "selector": "#hnmain" } }
```

## Browsing Workflow

The session persists across calls, so you can browse like a human:

1. `navigate` to a page
2. `links` to see what's clickable
3. `click` a link by text or selector
4. `text` to read the content
5. `back` to return to the previous page

## Tips

* The session persists — no need to re-navigate to a page you already visited.
* Use `links` to discover clickable elements before clicking.
* Use `click` with `text` to click links naturally (e.g. "Read more", "Next page").
* When a URL fails with DNS errors, the tool returns suggestions — try an archive or alternative URL.
* Use `selector` to narrow large pages to specific sections.
* Use `reset` if the browser gets into a bad state.
* Default `text` mode strips scripts/styles — compact and LLM-friendly.

## Error Recovery

* DNS failures return a suggestion to try web.archive.org or check the URL.
* Click failures return a list of available links/buttons on the page.
* If a selector matches nothing, you get a clear message instead of null.

## Security Notes

* Operator-only — inert unless the `playwright` Cargo feature is compiled in.
* Always run the daemon as a non-root user.
* Configure domain allowlists in `TOOLS.md` to restrict navigation targets.
