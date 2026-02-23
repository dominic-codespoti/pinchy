---
name: browser
description: "Multi-action headless browser with persistent session. Navigate, click, extract links, read text, go back — all within a single browsing session. Includes research strategy for resilient multi-source lookups."
---
# Browser Skill

Headless browser with a **persistent session** — navigate to pages, click links, extract content, and go back, all across multiple tool calls.

## Research Strategy

When researching a topic, **be resourceful** — don't rely on a single source or give up if one path fails.

### 1. Infer context from the query and go direct

Before searching, think about what the topic is and go to the most likely source directly:

| Query context | Go directly to |
|---|---|
| Code, libraries, MCP, AI tools, dev projects | `github.com/search?q=…&type=repositories` |
| Python packages | `pypi.org/search/?q=…` |
| Rust crates | `crates.io/search?q=…` |
| npm packages | `www.npmjs.com/search?q=…` |
| General knowledge, people, concepts | `en.wikipedia.org/wiki/…` |
| News, current events | `news.ycombinator.com`, RSS feeds |
| Documentation | The project's docs site directly |

**Example:** if asked to "research mcporter" — that looks like an MCP (Model Context Protocol) tool → go to `github.com/search?q=mcporter&type=repositories` first, not Google.

### 2. Search engine fallback chain

If you need a search engine, use this order — **do not stop at the first failure**:

1. **DuckDuckGo** (HTML version, less blocking): `https://html.duckduckgo.com/html/?q=…`
2. **Bing**: `https://www.bing.com/search?q=…`
3. **Google**: `https://www.google.com/search?q=…` (most likely to block headless browsers)

### 3. When blocked (CAPTCHA, "unusual traffic", empty results)

If a search engine blocks you:
- **Don't give up.** Switch to the next search engine immediately.
- **Try the direct source** for the domain (GitHub, PyPI, npm, crates.io, Wikipedia).
- **Use `exec_shell` with `curl`** for API-based lookups that bypass browser detection entirely:
	- GitHub: `curl -s "https://api.github.com/search/repositories?q=TOPIC" | jq '.items[:5] | .[] | {name, description, html_url}'`
	- PyPI: `curl -s "https://pypi.org/pypi/PACKAGE/json" | jq '{name: .info.name, summary: .info.summary, home_page: .info.home_page}'`
	- npm: `curl -s "https://registry.npmjs.org/-/v1/search?text=QUERY&size=5" | jq '.objects[].package | {name, description, links}'`
	- crates.io: `curl -s "https://crates.io/api/v1/crates?q=QUERY&per_page=5" | jq '.crates[] | {name, description, repository}'`

### 4. Multi-source corroboration

For thorough research, **use at least 2-3 sources**. Don't just read one page and summarise — cross-reference:
- Find the project → read its README
- Check for recent activity (commits, releases, issues)
- Look for discussions, blog posts, or comparisons

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
* **Search engine blocked?** Switch engines (DuckDuckGo → Bing → Google) or use `exec_shell` with `curl` for API-based lookups. Never give up after a single blocked request.

## Security Notes

* Operator-only — inert unless the `playwright` Cargo feature is compiled in.
* Always run the daemon as a non-root user.
* Configure domain allowlists in `TOOLS.md` to restrict navigation targets.
