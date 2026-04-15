// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'memory-list': http.get('/api/agents/:agent_id/memory', () => {
    return HttpResponse.json({
      memories: [
        {
          key: 'user_preferences',
          value: 'Prefers TypeScript, uses VS Code',
          created_at: '2024-01-20T12:00:00Z',
        },
        {
          key: 'project_context',
          value: 'Working on Pinchy web UI',
          created_at: '2024-01-22T08:00:00Z',
        },
      ],
    });
  }),

  'memory-delete': http.delete('/api/agents/:agent_id/memory/:key', ({ params }) => {
    const key = params.key as string;
    return HttpResponse.json({
      deleted: true,
      key: key,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
