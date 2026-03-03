---
name: browser
description: "Automates browser interactions via playwright-cli for web navigation, research, form filling, screenshots, and data extraction. Use when the user needs to browse websites, research topics, interact with web pages, or extract information. Requires playwright-cli (npm install -g @playwright/cli@latest)."
---
# Browser Automation with playwright-cli

Use `exec_shell` to run `playwright-cli` commands. This is a CLI-based browser that is more token-efficient than MCP — it avoids loading large tool schemas and accessibility trees into context.

## Quick start

```bash
playwright-cli open https://example.com
playwright-cli snapshot
playwright-cli click e15
playwright-cli type "search query"
playwright-cli screenshot
playwright-cli close
```

## Commands

### Core

```bash
playwright-cli open [url]               # open browser, optionally navigate to url
playwright-cli goto <url>               # navigate to a url
playwright-cli close                    # close the page
playwright-cli type <text>              # type text into editable element
playwright-cli click <ref>              # click element by ref from snapshot
playwright-cli dblclick <ref>           # double click
playwright-cli fill <ref> <text>        # fill text into editable element
playwright-cli drag <startRef> <endRef> # drag and drop between two elements
playwright-cli hover <ref>              # hover over element
playwright-cli select <ref> <val>       # select an option in a dropdown
playwright-cli upload <file>            # upload file(s)
playwright-cli check <ref>              # check a checkbox or radio button
playwright-cli uncheck <ref>            # uncheck a checkbox or radio button
playwright-cli snapshot                 # capture page snapshot to obtain element refs
playwright-cli eval <func> [ref]        # evaluate JavaScript expression
playwright-cli dialog-accept [prompt]   # accept a dialog
playwright-cli dialog-dismiss           # dismiss a dialog
playwright-cli resize <w> <h>           # resize the browser window
```

### Navigation

```bash
playwright-cli go-back                  # go back
playwright-cli go-forward               # go forward
playwright-cli reload                   # reload current page
```

### Keyboard

```bash
playwright-cli press <key>              # press a key (Enter, ArrowDown, etc.)
playwright-cli keydown <key>            # key down
playwright-cli keyup <key>              # key up
```

### Save as

```bash
playwright-cli screenshot               # screenshot of current page
playwright-cli screenshot <ref>         # screenshot of specific element
playwright-cli screenshot --filename=f  # save with specific filename
playwright-cli pdf --filename=page.pdf  # save page as PDF
```

### Tabs

```bash
playwright-cli tab-list                 # list all tabs
playwright-cli tab-new [url]            # create a new tab
playwright-cli tab-close [index]        # close a tab
playwright-cli tab-select <index>       # select a tab
```

## Snapshots

After each command, playwright-cli provides a snapshot of the current browser state with element refs (e.g. `e1`, `e5`, `e15`). Use these refs in `click`, `fill`, `hover`, etc.

```
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

Use `playwright-cli snapshot` to take a snapshot on demand.

## Research Strategy

When researching a topic, **be resourceful** — don't rely on a single source.

### 1. Go direct to the most likely source

| Query context | Go directly to |
|---|---|
| Code, libraries, dev projects | `github.com/search?q=…&type=repositories` |
| Python packages | `pypi.org/search/?q=…` |
| Rust crates | `crates.io/search?q=…` |
| npm packages | `www.npmjs.com/search?q=…` |
| General knowledge | `en.wikipedia.org/wiki/…` |
| News, current events | `news.ycombinator.com`, RSS feeds |
| Documentation | The project's docs site directly |

### 2. Search engine fallback chain

If you need a search engine, try in this order — **do not stop at the first failure**:

1. **DuckDuckGo** (HTML): `https://html.duckduckgo.com/html/?q=…`
2. **Bing**: `https://www.bing.com/search?q=…`
3. **Google**: `https://www.google.com/search?q=…`

### 3. When blocked (CAPTCHA, empty results)

- Switch to the next search engine immediately.
- Try the direct source for the domain.
- For JSON APIs, you can use `curl` as a last resort:
  - GitHub: `curl -s "https://api.github.com/search/repositories?q=TOPIC" | jq '.items[:5] | .[] | {name, description, html_url}'`
  - HN: `curl -s "https://hacker-news.firebaseio.com/v0/topstories.json" | jq '.[:10]'`

### 4. Multi-source corroboration

For thorough research, use at least 2–3 sources. Cross-reference findings.

## Browser Sessions

```bash
playwright-cli -s=mysession open https://example.com  # named session
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close
playwright-cli list                                     # list all sessions
playwright-cli close-all                                # close all browsers
```

## Open parameters

```bash
playwright-cli open --browser=chrome    # specific browser
playwright-cli open --headed            # visible browser (headless by default)
playwright-cli open --persistent        # persist profile to disk
playwright-cli open --config=file.json  # use config file
```

## Example: Research a topic

```bash
playwright-cli open https://news.ycombinator.com
playwright-cli snapshot
# read the snapshot to find story refs
playwright-cli click e5
playwright-cli snapshot
# extract content from the page
playwright-cli close
```

## Example: Form submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
```

## Tips

* Always run `snapshot` after navigation or clicks to see available element refs.
* Use `fill` for form inputs (not `type` — `type` appends text, `fill` replaces).
* If `playwright-cli` is not found, try `npx playwright-cli` instead.
* Sessions persist between CLI calls — no need to re-navigate.
* Use `--filename=` for screenshots/PDFs when the artifact is part of the result.
