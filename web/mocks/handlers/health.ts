// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  health: http.get('/api/health', () => {
    return HttpResponse.json({
      status: 'ok',
      version: '0.1.0',
      uptime_secs: 3600,
    });
  }),

  status: http.get('/api/status', () => {
    return HttpResponse.json({
      status: 'ok',
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
