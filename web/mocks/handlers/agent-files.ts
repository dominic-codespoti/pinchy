import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'agent-files-get': http.get('/api/agents/:agent_id/files/:filename', ({ params }) => {
    const filename = params.filename as string;

    let content = '';
    switch (filename) {
      case 'SOUL.md':
        content = '# SOUL\n\nYou are a helpful assistant.';
        break;
      case 'TOOLS.md':
        content = '# TOOLS\n\nUse tools wisely.';
        break;
      case 'HEARTBEAT.md':
        content = '# HEARTBEAT\n\nCheck system status.';
        break;
      default:
        content = '';
    }

    return new HttpResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }),

  'agent-files-put': http.put('/api/agents/:agent_id/files/:filename', () => {
    return HttpResponse.json({
      saved: true,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
