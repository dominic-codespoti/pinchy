import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'heartbeat-status-all': http.get('/api/heartbeat/status', () => {
    return HttpResponse.json({
      agents: [
        {
          agent_id: 'default',
          enabled: true,
          health: 'OK',
          last_tick: new Date().toISOString(),
          next_tick: new Date(Date.now() + 300000).toISOString(),
          interval_secs: 300,
          message_preview: 'Heartbeat tick',
        },
        {
          agent_id: 'researcher',
          enabled: true,
          health: 'PENDING',
          interval_secs: 300,
        },
      ],
    });
  }),

  'heartbeat-status-one': http.get('/api/heartbeat/status/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    return HttpResponse.json({
      agent_id: agentId,
      enabled: true,
      health: 'OK',
      last_tick: new Date().toISOString(),
      next_tick: new Date(Date.now() + 300000).toISOString(),
      interval_secs: 300,
      message_preview: 'Heartbeat tick',
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
