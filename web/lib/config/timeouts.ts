/**
 * Shared timeout and interval constants
 *
 * Use these constants instead of inline values to maintain consistent
 * timing behavior across the application. Makes tuning performance easier
 * and documents intent of each timeout.
 */

/** Timeout values in milliseconds */
export const TIMEOUTS = {
  /** 30 seconds - Session creation timeout */
  SESSION_CREATION: 30 * 1000,
  /** 5 minutes - Max OAuth polling duration */
  OAUTH_POLLING_MAX: 5 * 60 * 1000,
  /** 5 seconds - WebSocket reconnect base delay */
  WEBSOCKET_RECONNECT_BASE: 5000,
  /** 10 seconds - Test timeout for UI operations */
  TEST_TIMEOUT: 10 * 1000,
  /** 24 hours (in seconds) - Max heartbeat interval */
  MAX_HEARTBEAT_INTERVAL_SECONDS: 24 * 60 * 60,
  /** 1 second - Min invalidation interval */
  MIN_INVALIDATION_INTERVAL: 1000,
  /** 100 milliseconds - Message batching interval */
  MESSAGE_BATCH_INTERVAL: 100,
} as const;

/** Interval values in milliseconds */
export const INTERVALS = {
  /** 30 seconds - Health check polling */
  HEALTH_CHECK: 30 * 1000,
  /** 2 seconds - Logs refresh polling */
  LOGS_REFRESH: 2000,
  /** 5 seconds - Frequent polling */
  SHORT: 5000,
  /** 10 seconds - Standard polling (heartbeat) */
  NORMAL: 10 * 1000,
  /** 30 seconds - Background polling (agents list) */
  LONG: 30 * 1000,
} as const;

/** Retry configuration */
export const RETRY = {
  /** 5 attempts - Max WebSocket reconnect attempts */
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;

/** Form validation limits */
export const LIMITS = {
  /** 10 seconds - Min heartbeat interval */
  MIN_HEARTBEAT_INTERVAL_SECONDS: 10,
  /** 86400 seconds (24 hours) - Max heartbeat interval */
  MAX_HEARTBEAT_INTERVAL_SECONDS: 24 * 60 * 60,
} as const;
