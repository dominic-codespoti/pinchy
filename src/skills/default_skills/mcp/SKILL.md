---
name: mcp
description: "Connect to and use MCP (Model Context Protocol) servers to access external tools, data sources, and services. Use native MCP tools for configured servers or mcptools CLI for ad-hoc servers. Servers are configured in config.yaml under mcp_servers."
compatibility: "Requires mcp_servers configured in config.yaml for native tools. For ad-hoc servers, requires mcptools CLI (go install github.com/f/mcptools/cmd/mcptools@latest) or Node.js (npx)."
allowed-tools: mcp_list_servers mcp_list_tools mcp_call_tool exec_shell read_file write_file
metadata:
  author: pinchy
  version: "3.0"
---
# MCP (Model Context Protocol) Integration

Pinchy has **native MCP support** with three built-in tools. Configure servers once in `config.yaml`, then use the tools directly.

## Native MCP Tools

### mcp_list_servers

List all configured MCP servers.

```json
{}
```

Returns list of server names and count.

### mcp_list_tools

List tools available on a specific MCP server.

```json
{
  "server": "filesystem"
}
```

### mcp_call_tool

Call a tool on an MCP server.

```json
{
  "server": "github",
  "tool": "search_repositories",
  "arguments": {
    "query": "repo:rust-lang/rust is:public",
    "per_page": 5
  }
}
```

## Configuring MCP Servers

Add to your `config.yaml`:

```yaml
mcp_servers:
  filesystem:
    transport: stdio
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    
  github:
    transport: http
    url: "https://api.github.com/mcp"
    auth:
      type: "bearer"
      token: "${GITHUB_TOKEN}"
    
  postgres:
    transport: stdio
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
```

### Transport Types

| Transport | Config | Use Case |
|-----------|--------|----------|
| `stdio` | `command` + `args` | Local subprocess servers (npx, python -m) |
| `http` | `url` + `auth` | HTTP endpoints with authentication |

### Authentication

```yaml
# Bearer token
auth:
  type: "bearer"
  token: "${GITHUB_TOKEN}"  # Supports env var substitution

# OAuth 2.1 PKCE (for servers requiring OAuth)
auth:
  type: "oauth"
  client_id: "your-client-id"
  auth_url: "https://auth.example.com/authorize"
  token_url: "https://auth.example.com/token"
  scopes: "read write"
```

## Using mcptools CLI (Ad-hoc Servers)

For servers not configured in `config.yaml`, use the mcptools CLI:

```bash
# Install mcptools
brew tap f/mcptools && brew install mcp  # macOS
go install github.com/f/mcptools/cmd/mcptools@latest  # Linux/Windows

# List tools from a filesystem server
mcp tools npx -y @modelcontextprotocol/server-filesystem /tmp

# Call a tool
mcp call read_file --params '{"path":"/tmp/example.txt"}' \
  npx -y @modelcontextprotocol/server-filesystem /tmp
```

## Common MCP Servers

| Server | Package | Purpose |
|--------|---------|---------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | Read/write files, search, manage directories |
| GitHub | `@modelcontextprotocol/server-github` | Repos, issues, PRs, code search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | Query databases, inspect schemas |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search via Brave API |
| Memory | `@modelcontextprotocol/server-memory` | Persistent knowledge graph |
| Fetch | `@modelcontextprotocol/server-fetch` | HTTP requests and web content |
| SQLite | `@modelcontextprotocol/server-sqlite` | SQLite database operations |

## Workflow

1. **Configure servers once** in `config.yaml` under `mcp_servers`
2. **List available tools** with `mcp_list_tools` for each server
3. **Call tools** with `mcp_call_tool` specifying server, tool name, and arguments
4. **Parse results** from the returned JSON

## Tips

- Use `mcp_list_servers` to see which servers are configured
- Use `mcp_list_tools` with a server name to discover available tools
- Arguments format depends on the tool's input schema (usually JSON object)
- For repeated use, configure servers in `config.yaml` to avoid CLI overhead
