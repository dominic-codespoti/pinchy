/**
 * Shared mutation types for React Query hooks
 * Provides consistent mutation option patterns across all feature hooks
 */

/**
 * Standard mutation options interface for useMutation hooks.
 * Allows callers to provide success and error callbacks.
 */
export interface MutationOptions<TData = unknown, TError = Error> {
  /** Callback invoked when mutation succeeds */
  onSuccess?: (data: TData) => void;
  /** Callback invoked when mutation fails */
  onError?: (error: TError) => void;
}

/**
 * Standard mutation result wrapper for cases where
 * both data and error need to be tracked together.
 */
export interface MutationResult<TData = unknown, TError = Error> {
  /** Data returned on successful mutation */
  data?: TData;
  /** Error returned on failed mutation */
  error?: TError;
}
