# Backend Agent

Specialized agent for Pinchy Rust backend development.

## Context

- Rust Axum web server with WebSocket support
- SQLite persistence with rusqlite
- Model providers: OpenAI, Azure OpenAI, Copilot
- Tool system with skill registry

## Patterns

### Adding a new tool

1. Create tool in `src/tools/builtins/<name>.rs`
2. Register in `src/tools/mod.rs`
3. Add to `AUTO_PLUCK_RULES` if deferred
4. Add test in `tests/`

### Adding a model provider

1. Create provider in `src/models/<name>.rs`
2. Implement `ModelProvider` trait
3. Register in `src/models/mod.rs`

### Error handling

- Use `anyhow::Result` for most functions
- Never `unwrap()` in production paths — use `?` or explicit error handling
- Log errors with `tracing`

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/mod.rs` | Tool registry, AUTO_PLUCK_RULES |
| `src/models/mod.rs` | Model provider trait + implementations |
| `src/agent/mod.rs` | Agent runtime, tool loop |
| `src/config.rs` | Config loading |
| `src/gateway/mod.rs` | HTTP/WS server |
