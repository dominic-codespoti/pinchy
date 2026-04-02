import { ApiError } from '@/shared/types/api';
import { z } from 'zod';

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
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  schema?: z.ZodType<T>
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
      if (schema) {
        return schema.parse(undefined);
      }
      return undefined as T;
    }

    // Only parse JSON if content-type indicates JSON
    if (contentType?.includes('application/json')) {
      const data = await response.json();

      // Validate with Zod schema if provided
      if (schema) {
        return schema.parse(data);
      }

      return data as T;
    }

    // For non-JSON responses, return the response for manual handling
    return response as unknown as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[fetchApi] Validation error:', error.issues);
      const apiError: ApiError = {
        message: `API response validation failed: ${error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        status: 422,
      };
      throw apiError;
    }
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
