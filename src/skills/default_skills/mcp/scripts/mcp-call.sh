#!/usr/bin/env bash
# mcp-call.sh — Call an MCP tool via raw JSON-RPC over stdio.
# Useful when mcptools is not installed.
#
# Usage:
#   ./mcp-call.sh <tool-name> <args-json> <server-command…>
#
# Examples:
#   ./mcp-call.sh read_file '{"path":"/tmp/test.txt"}' npx -y @modelcontextprotocol/server-filesystem /tmp
#   ./mcp-call.sh list_dir '{"path":"/tmp"}' npx -y @modelcontextprotocol/server-filesystem /tmp

set -euo pipefail

TOOL="${1:?Usage: mcp-call.sh <tool-name> <args-json> <server-command…>}"
ARGS="${2:?Usage: mcp-call.sh <tool-name> <args-json> <server-command…>}"
shift 2
SERVER_CMD=("$@")

if [ ${#SERVER_CMD[@]} -eq 0 ]; then
  echo "Error: no server command specified" >&2
  exit 1
fi

{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pinchy","version":"1.0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}"
} | "${SERVER_CMD[@]}" 2>/dev/null | tail -n1 | jq .
