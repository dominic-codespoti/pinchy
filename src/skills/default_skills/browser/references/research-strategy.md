# Research Strategy

When researching a topic, **be resourceful** — don't rely on a single source.

## 1. Go direct to the most likely source

| Query context | Go directly to |
|---|---|
| Code, libraries, dev projects | `github.com/search?q=…&type=repositories` |
| Python packages | `pypi.org/search/?q=…` |
| Rust crates | `crates.io/search?q=…` |
| npm packages | `www.npmjs.com/search?q=…` |
| General knowledge | `en.wikipedia.org/wiki/…` |
| News, current events | `news.ycombinator.com`, RSS feeds |
| Documentation | The project's docs site directly |

## 2. Search engine fallback chain

If you need a search engine, try in this order — **do not stop at the first failure**:

1. **DuckDuckGo** (HTML): `https://html.duckduckgo.com/html/?q=…`
2. **Bing**: `https://www.bing.com/search?q=…`
3. **Google**: `https://www.google.com/search?q=…`

## 3. When blocked (CAPTCHA, empty results)

- Switch to the next search engine immediately.
- Try the direct source for the domain.
- For JSON APIs, you can use `curl` as a last resort:
  - GitHub: `curl -s "https://api.github.com/search/repositories?q=TOPIC" | jq '.items[:5] | .[] | {name, description, html_url}'`
  - HN: `curl -s "https://hacker-news.firebaseio.com/v0/topstories.json" | jq '.[:10]'`

## 4. Multi-source corroboration

For thorough research, use at least 2–3 sources. Cross-reference findings.
