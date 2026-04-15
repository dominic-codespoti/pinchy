# Dev Mode Command

Runs Pinchy development environment with Vite HMR + Rust backend.

## Usage

```bash
kilo dev
```

## What it does

1. Builds React frontend (`vite build`)
2. Starts Vite dev server on `:5173` with HMR
3. Starts Rust backend on `:3131` (with cargo-watch if installed)

## Environment

- Frontend: http://localhost:5173/react/
- Backend API: http://localhost:3131
- WebSocket: ws://localhost:3131/ws

## Prerequisites

- Node.js + npm (or pnpm)
- Rust + cargo
- cargo-watch (optional, for auto-rebuild)

## Flags

None - runs with sensible defaults for development.
