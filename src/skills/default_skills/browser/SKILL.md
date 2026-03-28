---
name: browser
description: "Automates browser interactions via playwright-cli for web navigation, research, form filling, screenshots, and data extraction. Use when the user needs to browse websites, research topics, interact with web pages, or extract information. Requires playwright-cli (npm install -g @playwright/cli@latest)."
allowed-tools: exec_shell
metadata:
  author: pinchy
  version: "2.0"
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

## Core workflow

1. **Open** a page: `playwright-cli open <url>`
2. **Snapshot** to see element refs: `playwright-cli snapshot`
3. **Interact** using refs: `playwright-cli click e5`, `playwright-cli fill e3 "text"`
4. **Navigate**: `playwright-cli goto <url>`, `playwright-cli go-back`
5. **Save**: `playwright-cli screenshot`, `playwright-cli pdf --filename=page.pdf`
6. **Close**: `playwright-cli close`

## Snapshots

After each command, playwright-cli provides a snapshot with element refs (`e1`, `e5`, `e15`). Use these refs in `click`, `fill`, `hover`, etc. Run `playwright-cli snapshot` to refresh on demand.

## Sessions

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

## Tips

* Always run `snapshot` after navigation or clicks to see available element refs.
* Use `fill` for form inputs (not `type` — `type` appends text, `fill` replaces).
* If `playwright-cli` is not found, try `npx playwright-cli` instead.
* Sessions persist between CLI calls — no need to re-navigate.
* Use `--filename=` for screenshots/PDFs when the artifact is part of the result.

## Reference files

This skill includes additional reference material in the `references/` subdirectory:

- **commands.md** — Full command reference for all playwright-cli commands.
- **research-strategy.md** — Multi-source research strategy for thorough web research.

Use `read_file` to load these when you need the detailed reference.
