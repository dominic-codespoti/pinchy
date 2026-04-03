import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockSessions = [
  {
    session_id: 'default-1706000000000',
    title: 'Help with project setup',
    file: 'default-1706000000000.jsonl',
    created_at: 1706000000000,
    modified: 1706003600,
    message_count: 15,
  },
  {
    session_id: 'default-1706100000000',
    title: 'Debug API issue',
    file: 'default-1706100000000.jsonl',
    created_at: 1706100000000,
    modified: 1706103600,
    message_count: 8,
  },
  {
    session_id: 'default-1706200000000',
    title: null,
    file: 'default-1706200000000.jsonl',
    created_at: 1706200000000,
    modified: 1706203600,
    message_count: 3,
  },
];

// Define handlers with endpoint keys
const handlerMap = {
  'sessions-current': http.get('/api/agents/:agent_id/session/current', () => {
    return HttpResponse.json({
      session_id: mockSessions[0].session_id,
    });
  }),

  'sessions-list': http.get('/api/agents/:agent_id/sessions', () => {
    return HttpResponse.json({ sessions: mockSessions });
  }),

  'sessions-get': http.get('/api/agents/:agent_id/sessions/:session_file', () => {
    return HttpResponse.json({
      messages: [
        {
          role: 'user',
          content: 'Hello',
          timestamp: 1706000000000,
        },
        {
          role: 'assistant',
          content: 'Hi! How can I help you today?',
          timestamp: 1706000001000,
        },
      ],
    });
  }),

  'sessions-update': http.put('/api/agents/:agent_id/sessions/:session_file', () => {
    return HttpResponse.json({ updated: true });
  }),

  'sessions-delete': http.delete('/api/agents/:agent_id/sessions/:session_file', ({ params }) => {
    const sessionFile = params.session_file as string;
    return HttpResponse.json({
      session_id: sessionFile.replace('.jsonl', ''),
      deleted: true,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
