import type { RawConfigRecord } from './types';

export interface RawConfigValidationResult {
  valid: boolean;
  error?: string;
  parsed?: RawConfigRecord;
}

export function formatConfigJson(config: RawConfigRecord): string {
  try {
    return JSON.stringify(config, null, 2);
  } catch {
    return '{}';
  }
}

export function validateRawConfig(json: string): RawConfigValidationResult {
  try {
    const parsed = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false, error: 'Config must be a JSON object' };
    }

    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`,
    };
  }
}
