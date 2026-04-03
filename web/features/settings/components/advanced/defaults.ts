import type { AdvancedConfigData } from './types';

export const ADVANCED_CONFIG_DEFAULTS: AdvancedConfigData = {
  session_expiry_days: 30,
  cron_session_expiry_days: 7,
  cron_events_max_keep: 50,
  timezone: 'UTC',
  skills: {
    enabled: true,
    allow: [],
    deny: [],
  },
  chromium_path: '',
};
