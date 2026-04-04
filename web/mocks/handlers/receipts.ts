// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Helper for dynamic timestamps
const dynamicTs = () => Math.floor(Date.now() - Math.random() * 86400000);
const dynamicDate = () => new Date(dynamicTs()).toISOString();

// Define handlers with endpoint keys
const handlerMap = {
  'receipts-list': http.get('/api/agents/:agent_id/receipts', () => {
    const ts = dynamicTs();
    return HttpResponse.json({
      receipts: [
        {
          id: 'r1',
          session_id: `default-${ts}`,
          tool: 'read_file',
          status: 'success',
          timestamp: dynamicDate(),
          __mock: true,
        },
      ],
    });
  }),

  'receipts-by-session': http.get(
    '/api/agents/:agent_id/receipts/:session_id',
    ({ params }) => {
      const sessionId = params.session_id as string;
      return HttpResponse.json({
        receipts: [
          {
            id: 'r1',
            session_id: sessionId,
            tool: 'read_file',
            status: 'success',
            timestamp: dynamicDate(),
            __mock: true,
          },
        ],
      });
    }
  ),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
