# MCP JSON-RPC Protocol Reference

All MCP communication uses JSON-RPC 2.0 over the chosen transport (stdio, SSE, or streamable HTTP).

## Lifecycle

### 1. Initialize (must be the first message)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": { "name": "pinchy", "version": "1.0" }
  }
}
```

### 2. Initialized notification (confirm handshake)

```json
{"jsonrpc": "2.0", "method": "notifications/initialized"}
```

### 3. Use the server

After initialization, you can call any method.

## Key methods

| Method | Description |
|---|---|
| `initialize` | Handshake with server (must be first) |
| `tools/list` | List all tools the server exposes |
| `tools/call` | Call a specific tool with arguments |
| `resources/list` | List available resources |
| `resources/read` | Read a specific resource |
| `prompts/list` | List available prompts |
| `prompts/get` | Get a specific prompt |

## tools/call request

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { "key": "value" }
  }
}
```

## tools/call response

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "result text here" }
    ]
  }
}
```

## Raw stdio interaction (without mcptools)

For quick interaction without mcptools installed:

```bash
# List tools from a filesystem server via raw JSON-RPC
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pinchy","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx -y @modelcontextprotocol/server-filesystem /tmp 2>/dev/null
```

```bash
# Call a tool via raw JSON-RPC
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pinchy","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/tmp/example.txt"}}}' | npx -y @modelcontextprotocol/server-filesystem /tmp 2>/dev/null
```

## HTTP servers

For servers running as HTTP endpoints:

```bash
# Streamable HTTP
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pinchy","version":"1.0"}}}'
```

## Error handling

MCP server errors return standard JSON-RPC error objects:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

## Notes

* Always send `initialize` before any other request — servers reject messages until initialized.
* Use `2>/dev/null` to suppress server stderr logging when piping.
* Parse JSON responses with `jq` for clean output.
* For long-running server sessions, use a named pipe (FIFO) or background process.
* If `npx` is slow, install servers globally: `npm install -g @modelcontextprotocol/server-filesystem`.
