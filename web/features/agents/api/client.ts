/**
 * Agents API Client - Error handling and request utilities
 * Uses shared fetchApi for all HTTP requests
 */

import { fetchApi, isNotFoundError, type ApiError } from '@/shared/api/client';
import type { AgentFile, SendTestMessageResponse } from '../types';

export { fetchApi, isNotFoundError };
export type { ApiError };

/**
 * Generic API response wrapper with metadata
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers?: Record<string, string>;
}

/**
 * Error response from the API
 */
export interface ApiErrorResponse {
  error: string;
  details?: string;
  code?: string;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('fetch');
}

/**
 * Check if error is a server error (5xx)
 */
export function isServerError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as ApiError).status;
    return typeof status === 'number' && status >= 500 && status < 600;
  }
  return false;
}

/**
 * Check if error is a client error (4xx)
 */
export function isClientError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as ApiError).status;
    return typeof status === 'number' && status >= 400 && status < 500;
  }
  return false;
}

/**
 * Check if error is a conflict error (409)
 */
export function isConflictError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as ApiError).status === 409;
  }
  return false;
}

/**
 * Check if error is a bad request error (400)
 */
export function isBadRequestError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as ApiError).status === 400;
  }
  return false;
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as ApiError).message === 'string') {
      return (error as ApiError).message;
    }
    if ('error' in error && typeof (error as { error: string }).error === 'string') {
      return (error as { error: string }).error;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

/**
 * Retry options for failed requests
 */
export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Fetch with automatic retry
 */
export async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, shouldRetry = isServerError } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && shouldRetry(error)) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
