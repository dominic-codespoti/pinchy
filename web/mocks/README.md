# Mock API Infrastructure

Type-safe mock API layer using [MSW (Mock Service Worker)](https://mswjs.io/).

## Architecture

```
mocks/
├── registry.ts          # Source of truth: all endpoint keys + paths
├── browser.ts           # MSW browser worker (dev mode)
├── server.ts            # MSW Node server (testing)
├── README.md            # This file
└── handlers/
    ├── index.ts         # Combines all handlers + compile-time enforcement
    ├── health.ts        # /api/health, /api/status
    ├── config.ts        # /api/config, /api/config/schema
    ├── agents.ts        # /api/agents CRUD + clone
    ├── agent-files.ts   # /api/agents/:id/files/:filename
    ├── sessions.ts      # /api/agents/:id/sessions
    ├── receipts.ts      # /api/agents/:id/receipts
    ├── heartbeat.ts     # /api/heartbeat/status
    ├── cron.ts          # /api/cron/jobs
    ├── memory.ts        # /api/agents/:id/memory
    ├── skills.ts        # /api/skills
    ├── ai.ts            # /api/ai/enhance-prompt
    ├── slash.ts         # /api/slash/commands
    ├── usage.ts         # /api/usage
    ├── debug.ts         # /api/debug/model-requests
    ├── models.ts        # /api/models, /api/models/registry
    ├── providers.ts     # /api/providers/status, test
    ├── auth.ts          # /api/auth (copilot, masked, save, clear)
    ├── admin.ts         # /api/admin/stats
    └── webhook.ts       # /api/webhook/:agent_id
```

## Compile-Time Enforcement

The key innovation is in `handlers/index.ts`. Every endpoint in `registry.ts` must
have a corresponding handler. If you add a new endpoint to the registry but forget
to add a handler, `npx tsc --noEmit` will fail.

### How it works

1. `registry.ts` exports `EndpointKey` — a union of all endpoint string keys
2. Each handler file exports a `Record<subset of EndpointKey, RequestHandler>`
3. `handlers/index.ts` merges all handler records and checks that the combined
   record covers ALL keys from `EndpointKey` via a type assertion

### Adding a new endpoint

1. Add the endpoint to `ENDPOINTS` in `registry.ts`
2. Create or update a handler file in `handlers/`
3. Export the handler in the handler file's `handlerMap` record
4. The handler map in `handlers/index.ts` will fail to compile if coverage is incomplete

## Usage

### Development (browser)

```typescript
// In your app entry point or layout
if (process.env.NEXT_PUBLIC_ENABLE_MOCKS === 'true') {
  const { startMockWorker } = await import('@/mocks/browser');
  await startMockWorker();
}
```

### Testing (Node)

```typescript
import { server } from '@/mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```
