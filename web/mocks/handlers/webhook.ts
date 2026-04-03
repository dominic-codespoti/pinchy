import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'webhook-ingest': http.post('/api/webhook/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    return HttpResponse.json({
      accepted: true,
      agent_id: agentId,
      queued: true,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
