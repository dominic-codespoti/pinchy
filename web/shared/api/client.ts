import { ApiError } from '@/shared/types/api';

export type { ApiError } from '@/shared/types/api';

/**
 * Check if an error is a "not found" error (404)
 */
export function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as ApiError).status === 404;
  }
  return false;
}

/**
 * Base HTTP client for all API requests
 * This is the ONLY HTTP client that all features should use
 */
export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: ApiError = {
        message: errorData.error || `API error: ${response.statusText}`,
        status: response.status,
      };
      throw error;
    }

    return await response.json();
  } catch (error) {
    if ((error as ApiError).message) {
      throw error;
    }
    throw {
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiError;
  }
}
