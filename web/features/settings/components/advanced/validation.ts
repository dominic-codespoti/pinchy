import { ADVANCED_CONFIG_DEFAULTS } from './defaults';
import type {
  AdvancedConfigData,
  AdvancedValidationErrors,
  RawConfigRecord,
} from './types';

type AdvancedConfigField = keyof AdvancedConfigData;

const NUMBER_FIELDS: AdvancedConfigField[] = [
  'session_expiry_days',
  'cron_session_expiry_days',
  'cron_events_max_keep',
];

export function normalizeAdvancedConfig(config: RawConfigRecord): AdvancedConfigData {
  return {
    session_expiry_days:
      (config.session_expiry_days as number) ?? ADVANCED_CONFIG_DEFAULTS.session_expiry_days,
    cron_session_expiry_days:
      (config.cron_session_expiry_days as number) ??
      ADVANCED_CONFIG_DEFAULTS.cron_session_expiry_days,
    cron_events_max_keep:
      (config.cron_events_max_keep as number) ?? ADVANCED_CONFIG_DEFAULTS.cron_events_max_keep,
    timezone: (config.timezone as string) ?? ADVANCED_CONFIG_DEFAULTS.timezone,
    skills: {
      enabled:
        (config.skills as { enabled?: boolean })?.enabled ??
        ADVANCED_CONFIG_DEFAULTS.skills?.enabled,
      allow:
        (config.skills as { allow?: string[] })?.allow ?? ADVANCED_CONFIG_DEFAULTS.skills?.allow,
      deny:
        (config.skills as { deny?: string[] })?.deny ?? ADVANCED_CONFIG_DEFAULTS.skills?.deny,
    },
    chromium_path: (config.chromium_path as string) ?? ADVANCED_CONFIG_DEFAULTS.chromium_path,
  };
}

export function validateAdvancedField(
  field: AdvancedConfigField,
  value: number | string | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (Number.isNaN(num)) {
    return 'Must be a valid number';
  }

  switch (field) {
    case 'session_expiry_days':
      if (num < 0) return 'Minimum 0 (disabled)';
      if (num > 365) return 'Maximum 365 days';
      break;
    case 'cron_session_expiry_days':
      if (num < 0) return 'Minimum 0 (disabled)';
      if (num > 90) return 'Maximum 90 days';
      break;
    case 'cron_events_max_keep':
      if (num < 10) return 'Minimum 10 events';
      if (num > 1000) return 'Maximum 1,000 events';
      break;
    default:
      break;
  }

  return undefined;
}

export function validateAdvancedConfig(data: AdvancedConfigData): {
  isValid: boolean;
  errors: AdvancedValidationErrors;
} {
  const errors: AdvancedValidationErrors = {};

  NUMBER_FIELDS.forEach((field) => {
    const error = validateAdvancedField(field, data[field] as number | undefined);
    if (error) {
      errors[field as keyof AdvancedValidationErrors] = error;
    }
  });

  return {
    isValid: Object.values(errors).every((error) => error === undefined),
    errors,
  };
}

export function buildAdvancedUpdatePayload(data: AdvancedConfigData): RawConfigRecord {
  const payload: RawConfigRecord = {};

  if (data.session_expiry_days !== undefined) {
    payload.session_expiry_days = data.session_expiry_days;
  }

  if (data.cron_session_expiry_days !== undefined) {
    payload.cron_session_expiry_days = data.cron_session_expiry_days;
  }

  if (data.cron_events_max_keep !== undefined) {
    payload.cron_events_max_keep = data.cron_events_max_keep;
  }

  if (data.timezone !== undefined) {
    payload.timezone = data.timezone;
  }

  if (data.skills !== undefined) {
    payload.skills = data.skills;
  }

  if (data.chromium_path !== undefined) {
    payload.chromium_path = data.chromium_path || undefined;
  }

  return payload;
}
