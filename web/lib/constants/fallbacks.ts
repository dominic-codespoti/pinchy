/**
 * Standardized fallback values for the application
 * 
 * Key principle: Fallbacks should clearly indicate "not configured"
 * rather than looking like real values.
 * 
 * ❌ Bad: || 'Default' (looks like a real model name)
 * ✅ Good: || '(no model configured)' (clearly indicates missing config)
 */

export const FALLBACKS = {
  // Model/provider
  MODEL: '(no model configured)',
  PROVIDER: '(no provider)',

  // Names/labels
  NAME: '(unnamed)',
  AGENT_NAME: '(unnamed agent)',

  // Time/date
  TIMEZONE: 'UTC',
  DATE: '-',

  // IDs/references
  SESSION: '(no session)',
  ID: '-',

  // Status
  STATUS: 'unknown',
  DESCRIPTION: '(no description)',
} as const;
