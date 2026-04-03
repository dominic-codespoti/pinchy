import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'admin-stats': http.get('/api/admin/stats', () => {
    return HttpResponse.json({
      totalAgents: 2,
      totalSessions: 17,
      totalMessages: 75,
      storageUsage: 134217728, // 128 MB in bytes
      uptime: 86400, // 1 day in seconds
      version: '0.1.19',
    });
  }),

  'admin-db-status': http.get('/api/admin/db/status', () => {
    return HttpResponse.json({
      journalMode: 'wal',
      synchronous: 1,
      foreignKeys: true,
      pageCount: 1024,
      pageSize: 4096,
      freelistCount: 0,
      estimatedSizeBytes: 4194304,
      readOnly: false,
      walSizeBytes: 0,
    });
  }),

  'admin-db-tables': http.get('/api/admin/db/tables', () => {
    return HttpResponse.json({
      tables: [
        { name: 'sessions', rowCount: 17, hasRowid: true },
        { name: 'exchanges', rowCount: 150, hasRowid: true },
        { name: 'receipts', rowCount: 75, hasRowid: true },
        { name: 'cron_jobs', rowCount: 3, hasRowid: false },
        { name: 'cron_events', rowCount: 45, hasRowid: true },
        { name: 'heartbeat_status', rowCount: 2, hasRowid: false },
      ],
    });
  }),

  'admin-db-optimize': http.post('/api/admin/db/optimize', () => {
    return HttpResponse.json({
      success: true,
      sizeBeforeBytes: 4194304,
      sizeAfterBytes: 3670016,
      bytesReclaimed: 524288,
    });
  }),

  'admin-db-wal-checkpoint': http.post('/api/admin/db/wal-checkpoint', () => {
    return HttpResponse.json({
      success: true,
      status: 'completed',
      logFramesCheckpointed: 10,
      framesCheckpointedSinceLast: 5,
      walSizeBeforeBytes: 1024,
      walSizeAfterBytes: 0,
    });
  }),

  'admin-db-diagnostics': http.get('/api/admin/db/diagnostics', () => {
    return HttpResponse.json({
      indexes: [
        { name: 'idx_sessions_agent', table: 'sessions', unique: false, columns: ['agent_id'], partial: false },
        { name: 'idx_exchanges_session', table: 'exchanges', unique: false, columns: ['session_id'], partial: false },
        { name: 'idx_receipts_agent', table: 'receipts', unique: false, columns: ['agent_id'], partial: false },
        { name: 'idx_memory_agent_key', table: 'memory', unique: true, columns: ['agent_id', 'key'], partial: false },
      ],
      agentStorage: [
        { agentId: 'dev-helper', sessionCount: 10, exchangeCount: 85, receiptCount: 42, memoryCount: 15, estimatedBytes: 204800 },
        { agentId: 'code-reviewer', sessionCount: 7, exchangeCount: 65, receiptCount: 33, memoryCount: 8, estimatedBytes: 153600 },
      ],
      pragma: {
        encoding: 'UTF-8',
        schemaVersion: 1,
        userVersion: 0,
        applicationId: 0,
        autoVacuum: 0,
        cacheSize: -2000,
        tempStore: 0,
        legacyAlterTable: false,
        reverseUnorderedSelects: false,
      },
    });
  }),

  'admin-backups-list': http.get('/api/admin/backups', () => {
    return HttpResponse.json({
      backups: [
        {
          filename: 'pinchy-backup-20250401-120000.tar.gz',
          sizeBytes: 10485760,
          createdAt: '2025-04-01 12:00:00',
        },
      ],
      backupDir: '/home/user/.pinchy/backups',
    });
  }),

  'admin-backup-create': http.post('/api/admin/backups', () => {
    return HttpResponse.json({
      success: true,
      filename: 'pinchy-backup-20250401-150420.tar.gz',
      path: '/home/user/.pinchy/backups/pinchy-backup-20250401-150420.tar.gz',
      sizeBytes: 10485760,
      fileCount: 150,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
