/**
 * Shared TanStack Query configuration constants
 * 
 * Use these constants instead of inline values to maintain consistent
 * caching behavior across the application.
 */

/** Stale time values in milliseconds */
export const STALE_TIME = {
  /** 1s - Chat messages, live data, recent logs */
  REALTIME: 1000,
  /** 5s - Dashboard, logs, frequently changing data */
  SHORT: 5000,
  /** 10s - Agent details, receipts */
  MEDIUM: 10000,
  /** 30s - Standard data (settings, providers, config) */
  NORMAL: 30000,
  /** 60s - Stable data (models, commands) */
  LONG: 60000,
  /** 5m - Schema, config (rarely changes) */
  SCHEMA: 300000,
} as const;

/** GC time values in milliseconds */
export const GC_TIME = {
  /** 5m - Short-lived data */
  SHORT: 300000,
  /** 10m - Normal data */
  NORMAL: 600000,
  /** 30m - Long-lived data */
  LONG: 1800000,
} as const;

/** Refetch interval values in milliseconds */
export const REFETCH_INTERVAL = {
  /** 2s - Real-time polling (recent logs) */
  REALTIME: 2000,
  /** 5s - Frequent polling */
  SHORT: 5000,
  /** 10s - Standard polling (heartbeat) */
  NORMAL: 10000,
  /** 30s - Background polling (agents list) */
  LONG: 30000,
} as const;

/** Pagination limits for API requests and UI buffers */
export const PAGINATION = {
  /** Default page size for most API requests */
  DEFAULT_LIMIT: 100,
  /** Maximum allowed page size for API requests */
  MAX_LIMIT: 1000,
  /** Page size for real-time/WebSocket feeds (logs, events) */
  REALTIME_LIMIT: 200,
  /** Maximum number of logs to keep in memory buffer */
  LOGS_MAX_BUFFER: 2000,
  /** Default memory entries per request */
  MEMORY_DEFAULT: 100,
} as const;
