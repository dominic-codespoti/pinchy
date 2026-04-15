export interface AdvancedConfigData {
  session_expiry_days?: number;
  cron_session_expiry_days?: number;
  cron_events_max_keep?: number;
  timezone?: string;
  skills?: {
    enabled?: boolean;
    allow?: string[];
    deny?: string[];
  };
  chromium_path?: string;
}

export interface AdvancedValidationErrors {
  session_expiry_days?: string;
  cron_session_expiry_days?: string;
  cron_events_max_keep?: string;
  timezone?: string;
}

export type RawConfigRecord = Record<string, unknown>;
