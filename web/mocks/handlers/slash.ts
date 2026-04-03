import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'slash-commands': http.get('/api/slash/commands', () => {
    return HttpResponse.json({
      commands: [
        { name: '/help', description: 'Show available commands' },
        { name: '/status', description: 'Show agent status' },
        { name: '/clear', description: 'Clear session history' },
        { name: '/compact', description: 'Compact session context' },
      ],
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
