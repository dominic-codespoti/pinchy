import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'receipts-list': http.get('/api/agents/:agent_id/receipts', () => {
    return HttpResponse.json({
      receipts: [
        {
          id: 'r1',
          session_id: 'default-1706000000000',
          tool: 'read_file',
          status: 'success',
          timestamp: '2024-01-23T10:00:00Z',
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
            timestamp: '2024-01-23T10:00:00Z',
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
