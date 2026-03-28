---
name: mcp
description: "Connect to and use MCP (Model Context Protocol) servers to access external tools, data sources, and services. Uses the mcptools CLI (mcp/mcpt) for ergonomic server interaction. Requires mcptools (go install github.com/f/mcptools/cmd/mcptools@latest) or Node.js (npx) for stdio servers."
compatibility: "Requires mcptools CLI (recommended) or Node.js (npx) for stdio-based servers. Network access required for HTTP servers."
allowed-tools: exec_shell read_file write_file
metadata:
  author: pinchy
  version: "2.0"
---
# MCP (Model Context Protocol) Integration

Use `exec_shell` to interact with MCP servers via the **mcptools** CLI (`mcp` or `mcpt`).

## Install mcptools

```bash
# macOS (Homebrew)
brew tap f/mcptools && brew install mcp

# Linux / Windows (Go)
go install github.com/f/mcptools/cmd/mcptools@latest
# binary installs as 'mcptools', alias to 'mcp' or 'mcpt'
```

## Quick start

```bash
# List tools from a filesystem server
mcp tools npx -y @modelcontextprotocol/server-filesystem /tmp

# Call a tool
mcp call read_file --params '{"path":"/tmp/example.txt"}' npx -y @modelcontextprotocol/server-filesystem /tmp

# List tools from an HTTP server
mcp tools http://localhost:3000

# Pretty JSON output
mcp tools --format pretty npx -y @modelcontextprotocol/server-filesystem /tmp
```

## Core commands

| Command | Description |
|---|---|
| `mcp tools <server…>` | List all tools the server exposes |
| `mcp call <tool> --params '{…}' <server…>` | Call a specific tool |
| `mcp resources <server…>` | List available resources |
| `mcp read-resource <uri> <server…>` | Read a specific resource |
| `mcp prompts <server…>` | List available prompts |
| `mcp get-prompt <name> <server…>` | Get a specific prompt |
| `mcp shell <server…>` | Interactive shell session |

## Transport types

| Transport | Example |
|---|---|
| **stdio** | `mcp tools npx -y @modelcontextprotocol/server-filesystem /tmp` |
| **SSE** | `mcp tools http://localhost:3000/sse` |
| **Streamable HTTP** | `mcp tools http://localhost:3000` |

## Output formats

```bash
mcp tools <server…>                  # table format (default, colorized)
mcp tools --format json <server…>    # compact JSON
mcp tools --format pretty <server…>  # indented JSON
```

## Common MCP servers

| Server | Package | Purpose |
|---|---|---|
| Filesystem | `@modelcontextprotocol/server-filesystem` | Read/write files, search, manage directories |
| GitHub | `@modelcontextprotocol/server-github` | Repos, issues, PRs, code search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query databases, inspect schemas |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search via Brave API |
| Memory | `@modelcontextprotocol/server-memory` | Persistent knowledge graph |
| Fetch | `@modelcontextprotocol/server-fetch` | HTTP requests and web content |
| SQLite | `@modelcontextprotocol/server-sqlite` | SQLite database operations |

### Running servers

```bash
# Filesystem — give it directories to expose
npx -y @modelcontextprotocol/server-filesystem /path/to/dir

# GitHub — requires GITHUB_TOKEN
GITHUB_TOKEN=ghp_xxx npx -y @modelcontextprotocol/server-github

# PostgreSQL — pass connection string
npx -y @modelcontextprotocol/server-postgres "postgresql://user:pass@localhost/db"
```

## Tips

* Use `mcp tools` first to discover what's available before calling tools.
* Use `--format json` and pipe to `jq` for scripting: `mcp call tool --params '{}' server | jq .`
* For repeated use, create an alias: `mcp alias add myfs npx -y @modelcontextprotocol/server-filesystem ~/`
* If `mcptools` is not installed, fall back to raw JSON-RPC — see `references/protocol.md`.
* Use `--server-logs` flag to see server-side logs for debugging.

## Reference files

This skill includes additional reference material:

- **references/protocol.md** — JSON-RPC protocol details and raw stdio interaction.
- **references/servers.md** — Extended MCP server catalog with install commands.
- **scripts/mcp-call.sh** — Helper script for raw JSON-RPC tool calls without mcptools.

Use `read_file` to load these when you need the detailed reference.
