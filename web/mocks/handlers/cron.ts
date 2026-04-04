// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Helper for dynamic dates
const dynamicDate = () => new Date(Date.now() - Math.random() * 86400000).toISOString();
const dynamicFutureDate = () => new Date(Date.now() + Math.random() * 86400000).toISOString();
const dynamicTsSecs = () => Math.floor((Date.now() - Math.random() * 86400000) / 1000);

const mockJobs = [
  {
    id: 'job-1',
    agent_id: 'default',
    name: 'Daily status check',
    schedule: '0 9 * * *',
    message: 'Check system status',
    kind: 'Recurring',
    last_status: 'success',
    last_run: dynamicDate(),
    next_run: dynamicFutureDate(),
    __mock: true,
  },
  {
    id: 'job-2',
    agent_id: 'default',
    name: 'Weekly report',
    schedule: '0 10 * * 1',
    message: 'Generate weekly report',
    kind: 'Recurring',
    last_status: null,
    __mock: true,
  },
];

// Define handlers with endpoint keys
const handlerMap = {
  'cron-jobs-list': http.get('/api/cron/jobs', () => {
    return HttpResponse.json({ jobs: mockJobs });
  }),

  'cron-jobs-create': http.post('/api/cron/jobs', async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      agent_id?: string;
      schedule?: string;
      message?: string;
    };
    return HttpResponse.json({
      job_id: 'job-new',
      name: body.name || 'New Job',
      agent_id: body.agent_id || 'default',
      schedule: body.schedule || '0 0 * * *',
      message: body.message || '',
      created_at: Date.now(),
    });
  }),

  'cron-jobs-by-agent': http.get('/api/cron/jobs/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    const filteredJobs = mockJobs.filter((job) => job.agent_id === agentId);
    return HttpResponse.json({ jobs: filteredJobs });
  }),

  'cron-job-runs': http.get('/api/cron/jobs/:job_id/runs', ({ params }) => {
    const jobId = params.job_id as string;
    const executedAt = dynamicTsSecs();
    return HttpResponse.json({
      runs: [
        {
          id: `run-1-${jobId}`,
          scheduled_at: executedAt - 60,
          executed_at: executedAt,
          completed_at: executedAt + 4,
          status: 'SUCCESS',
          duration_ms: Math.floor(Math.random() * 10000) + 1000,
        },
      ],
      __mock: true,
    });
  }),

  'cron-jobs-delete': http.delete('/api/cron/jobs/:job_id/delete', ({ params }) => {
    const jobId = params.job_id as string;
    return HttpResponse.json({
      deleted: true,
      job_id: jobId,
    });
  }),

  'cron-jobs-update': http.put('/api/cron/jobs/:job_id/update', async ({ params, request }) => {
    const jobId = params.job_id as string;
    const body = (await request.json()) as {
      name?: string;
      schedule?: string;
      message?: string;
    };
    const existingJob = mockJobs.find((j) => j.id === jobId) || mockJobs[0];
    return HttpResponse.json({
      ...existingJob,
      name: body.name || existingJob.name,
      schedule: body.schedule || existingJob.schedule,
      message: body.message || existingJob.message,
      updated_at: Date.now(),
    });
  }),

  'cron-job-trigger': http.post('/api/cron/jobs/:job_id/trigger', ({ params }) => {
    const jobId = params.job_id as string;
    return HttpResponse.json({
      triggered: true,
      job_id: jobId,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
