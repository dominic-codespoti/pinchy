# Pinchy Web UI

React/Next.js admin interface for the Pinchy agent daemon.

In production, the Rust gateway (Axum) serves these files as static assets from `static/react/`. In development, the Next.js dev server runs on `:3000` and proxies API calls to the Rust backend at `:3131`.

## Getting Started

Install dependencies (from repo root):

```bash
cd web && npm install --legacy-peer-deps
```

Start full dev mode (backend + frontend):

```bash
make dev  # From repo root; starts Rust + Next.js concurrently
```

Start frontend only (backend already running on `:3131`):

```bash
npm run dev  # Inside web/
```

Build for production:

```bash
npm run build  # Outputs to ../static/react (see next.config.ts)
```

## Project Structure

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router pages: dashboard, agents, chat, settings, cron jobs, models, etc. |
| `components/ui/` | shadcn/ui primitives and local wrappers: Card, Button, Dialog, Badge, Table, etc. |
| `lib/validation/schemas.ts` | Zod schemas for API response validation; types exported via `z.infer<typeof Schema>` |
| `shared/api/client.ts` | Centralized `fetchApi` wrapper with base URL handling, error parsing, and optional Zod validation |
| `features/*/api/` | Feature-specific API modules (agents, cron, chat, settings, etc.) |
| `shared/providers/query-provider.tsx` | TanStack Query client configuration |
| `shared/providers/websocket.tsx` | WebSocket context for real-time events |
| `next.config.ts` | Dev proxy rewrites (`/api/*` → `:3131`) and static export config |
| `tsconfig.json` | Strict TypeScript mode enabled |
| `tailwind.config.ts` | Tailwind with shadcn theme tokens |

## Key Patterns

### API Client

All backend calls go through `fetchApi` in `shared/api/client.ts`:

```typescript
import { fetchApi } from '@/shared/api/client';
import { AgentSchema } from '@/lib/validation/schemas';

const agent = await fetchApi('/api/agents/123', {}, AgentSchema);
```

The client handles:
- Base URL resolution (same-origin in production, proxied in dev)
- Error parsing into `ApiError` objects
- Optional Zod schema validation
- Empty response handling (204 No Content)

### Data Fetching

Uses TanStack React Query with the provider in `shared/providers/query-provider.tsx`:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['agents'],
  queryFn: () => fetchApi('/api/agents', {}, AgentListSchema),
});
```

### Validation

Zod schemas in `lib/validation/schemas.ts` must stay in sync with Rust structs in `src/gateway/types.rs`. Example:

```typescript
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  max_turns: z.number().nullable().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;
```

Use `unknown` (never `any`) for truly dynamic data like tool arguments or log metadata.

### TypeScript

Strict mode is enabled in `tsconfig.json`. Never use `any`. Use proper typing for all function parameters and return values.

### UI Components

Always use shadcn primitives from `components/ui/`. Never build custom buttons, cards, or inputs with raw `<div>` elements and Tailwind classes. Import from the UI index:

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
```

### WebSocket

Real-time events are handled in `shared/providers/websocket.tsx`. The provider debounces query invalidation to prevent excessive refetches:

```typescript
import { useWebSocket } from '@/shared/providers/websocket';

const { status, send } = useWebSocket();
```

## Build & Export

Production builds use Next.js static export:

- `output: 'export'` in `next.config.ts`
- `distDir: '../static/react'` — places files where the Rust binary expects them
- The Axum server in `src/gateway/` embeds and serves these files at `/`

Dev mode uses rewrites to proxy API requests:

```typescript
// next.config.ts (devConfig)
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://127.0.0.1:3131/api/:path*',
    },
  ];
}
```

## Scripts Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server with HMR (proxies `/api/*` to `:3131`) |
| `npm run build` | Static export to `../static/react` |
| `npm run type-check` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint on TypeScript files |
| `npm run serve` | Serve the built static files (for testing) |

## Type Safety Check

Before committing changes that touch API types or paths:

```bash
cd web && npx tsc --noEmit
```

Ensure no `any` types are introduced and all API responses match their Zod schemas.
