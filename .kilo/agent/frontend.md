# Frontend Agent

Specialized agent for Pinchy React frontend development.

## Context

- React 18 + TypeScript
- Next.js build system
- TanStack Query + Next.js App Router
- Tailwind CSS + Radix UI primitives
- Vertical slice architecture

## Patterns

### Adding a new route

1. Create route file in `web/app/<name>/page.tsx`
2. Add API client method in `web/shared/api/client.ts` if needed

### Adding a component

1. Create in `web/components/` or feature-specific `web/features/<feature>/components/`
2. Use existing UI components from `web/components/ui/`
3. Follow existing patterns for styling

### API integration

- Use `web/shared/api/client.ts` for HTTP calls
- Use `web/shared/lib/ws.ts` for WebSocket connections
- Use TanStack Query for data fetching with caching

## Key Files

| File | Purpose |
|------|---------|
| `web/app/` | Next.js App Router pages |
| `web/shared/api/client.ts` | HTTP API client |
| `web/shared/lib/ws.ts` | WebSocket client |
| `web/next.config.mjs` | Next.js configuration |
| `web/features/` | Feature slices (vertical slice architecture) |
