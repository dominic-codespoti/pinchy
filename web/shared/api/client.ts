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
 * Base HTTP client for all API requests
 * This is the ONLY HTTP client that all features should use
 */
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
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

    // Check for empty response (204 No Content or empty body)
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type');
    
    if (response.status === 204 || contentLength === '0') {
      // Return undefined for empty responses
      return undefined as T;
    }

    // Only parse JSON if content-type indicates JSON
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      return data as T;
    }

    // For non-JSON responses, return the response for manual handling
    return response as unknown as T;
  } catch (error) {
    if ((error as ApiError).message) {
      throw error;
    }
    throw {
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiError;
  }
}

/**
 * Fetch API for endpoints that return 204 No Content or empty responses
 * Always returns void, useful for DELETE endpoints
 */
export async function fetchApiEmpty(
  endpoint: string,
  options?: RequestInit
): Promise<void> {
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

    // 204 No Content or empty body - no parsing needed
    return;
  } catch (error) {
    if ((error as ApiError).message) {
      throw error;
    }
    throw {
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiError;
  }
}
