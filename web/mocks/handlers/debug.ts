import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockRequests = [
  {
    id: 'req-001',
    model: 'copilot-default',
    provider: 'copilot',
    timestamp: '2024-01-23T10:00:00Z',
    input_tokens: 500,
    output_tokens: 200,
    latency_ms: 1200,
    status: 'success',
  },
  {
    id: 'req-002',
    model: 'anthropic-claude-3-5-sonnet',
    provider: 'anthropic',
    timestamp: '2024-01-23T10:05:00Z',
    input_tokens: 1000,
    output_tokens: 500,
    latency_ms: 2500,
    status: 'success',
  },
];

// Define handlers with endpoint keys
const handlerMap = {
  'debug-model-requests-list': http.get('/api/debug/model-requests', () => {
    return HttpResponse.json({ requests: mockRequests });
  }),
  'debug-model-request-get': http.get('/api/debug/model-requests/:request_id', ({ params }) => {
    const requestId = params.request_id as string;
    const req = mockRequests.find(r => r.id === requestId);
    if (!req) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({
      ...req,
      request_body: { messages: [], model: req.model },
      response_body: { choices: [{ message: { content: 'Mock response' } }] },
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
