// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Helper for realistic token counts
const randomTokens = () => Math.floor(Math.random() * 50000) + 1000;
const randomCost = () => parseFloat((Math.random() * 20 + 1).toFixed(2));

// Define handlers with endpoint keys
const handlerMap = {
  'usage': http.get('/api/usage', () => {
    const totalInput = randomTokens();
    const totalOutput = Math.floor(totalInput * 0.3);
    return HttpResponse.json({
      total_cost: randomCost(),
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      by_model: {
        'copilot-default': {
          cost: randomCost(),
          input_tokens: randomTokens(),
          output_tokens: randomTokens(),
        },
        'anthropic-claude-3-5-sonnet': {
          cost: randomCost(),
          input_tokens: randomTokens(),
          output_tokens: randomTokens(),
        },
      },
      by_agent: {
        'default': {
          cost: randomCost(),
          requests: Math.floor(Math.random() * 100) + 10,
        },
        'researcher': {
          cost: randomCost(),
          requests: Math.floor(Math.random() * 100) + 10,
        },
      },
      __mock: true,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
