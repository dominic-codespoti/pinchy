// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Helper for dynamic timestamps
const dynamicTs = () => Math.floor(Date.now() - Math.random() * 86400000);
const dynamicTsSecs = () => Math.floor((Date.now() - Math.random() * 86400000) / 1000);

const ts1 = dynamicTs();
const ts2 = dynamicTs();
const ts3 = dynamicTs();

const mockSessions = [
  {
    session_id: `default-${ts1}`,
    title: 'Help with project setup',
    file: `default-${ts1}.jsonl`,
    created_at: ts1,
    modified: dynamicTsSecs(),
    message_count: 15,
    __mock: true,
  },
  {
    session_id: `default-${ts2}`,
    title: 'Debug API issue',
    file: `default-${ts2}.jsonl`,
    created_at: ts2,
    modified: dynamicTsSecs(),
    message_count: 8,
    __mock: true,
  },
  {
    session_id: `default-${ts3}`,
    title: null,
    file: `default-${ts3}.jsonl`,
    created_at: ts3,
    modified: dynamicTsSecs(),
    message_count: 3,
    __mock: true,
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
    const msgTs1 = dynamicTs();
    return HttpResponse.json({
      messages: [
        {
          role: 'user',
          content: 'Hello',
          timestamp: msgTs1,
        },
        {
          role: 'assistant',
          content: 'Hi! How can I help you today?',
          timestamp: msgTs1 + 1000,
        },
      ],
      __mock: true,
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
