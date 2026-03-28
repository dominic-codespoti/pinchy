# MCP Server Catalog

Extended list of popular MCP servers with install and usage commands.

## Official reference servers

| Server | Package | Purpose |
|---|---|---|
| Filesystem | `@modelcontextprotocol/server-filesystem` | Read/write files, search, manage directories |
| GitHub | `@modelcontextprotocol/server-github` | Repos, issues, PRs, code search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query databases, inspect schemas |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search via Brave API |
| Memory | `@modelcontextprotocol/server-memory` | Persistent knowledge graph |
| Fetch | `@modelcontextprotocol/server-fetch` | HTTP requests and web content |
| Puppeteer | `@modelcontextprotocol/server-puppeteer` | Browser automation |
| SQLite | `@modelcontextprotocol/server-sqlite` | SQLite database operations |
| Google Maps | `@modelcontextprotocol/server-google-maps` | Location services |
| Git | `mcp-server-git` (uvx) | Git repository operations |

## Install and run examples

```bash
# Filesystem — give it directories to expose
npx -y @modelcontextprotocol/server-filesystem /path/to/dir1 /path/to/dir2

# GitHub — requires GITHUB_TOKEN env var
GITHUB_TOKEN=ghp_xxx npx -y @modelcontextprotocol/server-github

# PostgreSQL — pass connection string
npx -y @modelcontextprotocol/server-postgres "postgresql://user:pass@localhost/db"

# Brave Search — requires API key
BRAVE_API_KEY=xxx npx -y @modelcontextprotocol/server-brave-search

# Memory — persistent knowledge graph (no config needed)
npx -y @modelcontextprotocol/server-memory

# Fetch — HTTP requests
npx -y @modelcontextprotocol/server-fetch

# SQLite — pass database path
npx -y @modelcontextprotocol/server-sqlite /path/to/db.sqlite

# Git (Python-based, use uvx)
uvx mcp-server-git --repository /path/to/repo
```

## Notable third-party servers

| Server | Package / URL | Purpose |
|---|---|---|
| Slack | `@anthropic-ai/mcp-server-slack` | Slack workspace integration |
| Linear | `linear.app/docs/mcp` | Project management |
| Cloudflare | `@cloudflare/mcp-server-cloudflare` | Workers, KV, R2, D1 |
| Sentry | `@sentry/mcp-server` | Error monitoring |
| Docker | `docker/mcp-server` | Container management |
| Elasticsearch | Various | Search and analytics |

## Using with mcptools

```bash
# Discover tools on any server
mcp tools npx -y @modelcontextprotocol/server-filesystem /tmp

# Save as alias for reuse
mcp alias add myfs npx -y @modelcontextprotocol/server-filesystem ~/
mcp tools myfs
mcp call read_file --params '{"path":"README.md"}' myfs

# Interactive shell
mcp shell npx -y @modelcontextprotocol/server-github
```
