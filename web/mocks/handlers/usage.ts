import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'usage': http.get('/api/usage', () => {
    return HttpResponse.json({
      total_cost: 12.50,
      total_input_tokens: 150000,
      total_output_tokens: 45000,
      by_model: {
        'copilot-default': {
          cost: 8.00,
          input_tokens: 100000,
          output_tokens: 30000,
        },
        'anthropic-claude-3-5-sonnet': {
          cost: 4.50,
          input_tokens: 50000,
          output_tokens: 15000,
        },
      },
      by_agent: {
        'default': {
          cost: 8.00,
          requests: 50,
        },
        'researcher': {
          cost: 4.50,
          requests: 25,
        },
      },
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
