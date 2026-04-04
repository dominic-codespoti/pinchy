// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'config-get': http.get('/api/config', () => {
    return HttpResponse.json({
      models: {
        default: {
          provider: 'copilot',
          model: 'copilot-default',
        },
      },
      gateway: {
        port: 3131,
      },
    });
  }),

  'config-put': http.put('/api/config', async () => {
    return HttpResponse.json({
      status: 'saved',
    });
  }),

  'config-schema': http.get('/api/config/schema', () => {
    return HttpResponse.json({
      type: 'object',
      properties: {
        models: { type: 'object' },
        gateway: { type: 'object' },
      },
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
