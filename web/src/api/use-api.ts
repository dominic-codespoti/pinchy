import { createSignal, onCleanup, createMemo } from "solid-js";
import { Effect, Exit } from "effect";
import type { HttpError, ParseError } from "@/api/http";

// ── Types ────────────────────────────────────────────

export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface QueryResult<T> {
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly status: QueryStatus;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly refetch: () => void;
}

export interface MutationResult<T, A> {
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly status: QueryStatus;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly mutate: (args: A) => void;
  readonly reset: () => void;
}

// ── Query key registry (for ws-sync invalidation) ────

type RefetchFn = () => void;
const queryRegistry = new Map<string, Set<RefetchFn>>();

function keyToString(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

function registerQuery(key: readonly unknown[], refetch: RefetchFn): () => void {
  const keyStr = keyToString(key);
  let set = queryRegistry.get(keyStr);
  if (!set) {
    set = new Set();
    queryRegistry.set(keyStr, set);
  }
  set.add(refetch);

  return () => {
    set!.delete(refetch);
    if (set!.size === 0) queryRegistry.delete(keyStr);
  };
}

/**
 * Invalidate all queries matching the given key prefix.
 * If the registered key starts with the same elements as `key`,
 * the query is refetched.
 */
export function invalidateQueries(key: readonly unknown[]): void {
  const prefix = JSON.stringify(key);
  // Exact match or prefix match (the key array is a prefix of registered keys)
  for (const [registered, fns] of queryRegistry) {
    if (registered === prefix || registered.startsWith(prefix.slice(0, -1) + ",")) {
      for (const fn of fns) fn();
    }
  }
}

/**
 * Remove all queries matching the given key (stops refetching but
 * they'll re-register if components remount).
 */
export function removeQueries(key: readonly unknown[]): void {
  const keyStr = keyToString(key);
  queryRegistry.delete(keyStr);
}

// ── Error extraction ─────────────────────────────────

function extractError(err: unknown): string {
  if (err && typeof err === "object") {
    if ("message" in err && typeof (err as { message: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    if ("reason" in err && typeof (err as { reason: unknown }).reason === "string") {
      return (err as { reason: string }).reason;
    }
  }
  return String(err);
}

// ── createQuery ──────────────────────────────────────

export interface CreateQueryOptions<T> {
  /** Stable query key for cache/invalidation */
  readonly key: readonly unknown[];
  /** Effect that fetches the data */
  readonly fn: () => Effect.Effect<T, HttpError | ParseError>;
  /** Whether the query is enabled (default true) */
  readonly enabled?: boolean;
  /** Auto-refetch interval in ms (0 = disabled) */
  readonly refetchInterval?: number;
}

export function createQuery<T>(opts: CreateQueryOptions<T>): QueryResult<T> {
  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [status, setStatus] = createSignal<QueryStatus>("idle");

  let intervalId: number | null = null;

  function run(): void {
    const enabled = opts.enabled ?? true;
    if (!enabled) return;

    setStatus("loading");
    setError(undefined);

    Effect.runPromiseExit(opts.fn()).then((exit) => {
      if (Exit.isSuccess(exit)) {
        setData(() => exit.value);
        setError(undefined);
        setStatus("success");
      } else {
        const cause = exit.cause;
        // Extract the actual failure value from the Cause
        let failureMsg = "Unknown error";
        if ("_tag" in cause && cause._tag === "Fail") {
          failureMsg = extractError((cause as { error: unknown }).error);
        } else {
          failureMsg = extractError(cause);
        }
        setError(failureMsg);
        setStatus("error");
      }
    });
  }

  function refetch(): void {
    run();
  }

  // Initial fetch
  const enabled = opts.enabled ?? true;
  if (enabled) run();

  // Polling
  if (opts.refetchInterval && opts.refetchInterval > 0) {
    intervalId = window.setInterval(() => {
      const en = opts.enabled ?? true;
      if (en) run();
    }, opts.refetchInterval);
  }

  // Register in query registry for invalidation
  const unregister = registerQuery(opts.key, refetch);

  onCleanup(() => {
    unregister();
    if (intervalId !== null) window.clearInterval(intervalId);
  });

  // Return a reactive object using memos for derived values
  const isLoading = createMemo(() => status() === "loading");
  const isError = createMemo(() => status() === "error");
  const isSuccess = createMemo(() => status() === "success");

  return {
    get data() { return data(); },
    get error() { return error(); },
    get status() { return status(); },
    get isLoading() { return isLoading(); },
    get isError() { return isError(); },
    get isSuccess() { return isSuccess(); },
    refetch,
  };
}

// ── createMutation ───────────────────────────────────

export interface CreateMutationOptions<T, A> {
  /** Effect that performs the mutation */
  readonly fn: (args: A) => Effect.Effect<T, HttpError | ParseError>;
  /** Called on success — use for cache invalidation */
  readonly onSuccess?: (data: T, args: A) => void;
  /** Called on error */
  readonly onError?: (error: string) => void;
}

export function createMutation<T, A = void>(
  opts: CreateMutationOptions<T, A>,
): MutationResult<T, A> {
  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [status, setStatus] = createSignal<QueryStatus>("idle");

  function mutate(args: A): void {
    setStatus("loading");
    setError(undefined);

    Effect.runPromiseExit(opts.fn(args)).then((exit) => {
      if (Exit.isSuccess(exit)) {
        setData(() => exit.value);
        setError(undefined);
        setStatus("success");
        opts.onSuccess?.(exit.value, args);
      } else {
        const cause = exit.cause;
        let failureMsg = "Unknown error";
        if ("_tag" in cause && cause._tag === "Fail") {
          failureMsg = extractError((cause as { error: unknown }).error);
        } else {
          failureMsg = extractError(cause);
        }
        setError(failureMsg);
        setStatus("error");
        opts.onError?.(failureMsg);
      }
    });
  }

  function reset(): void {
    setData(undefined);
    setError(undefined);
    setStatus("idle");
  }

  const isLoading = createMemo(() => status() === "loading");
  const isError = createMemo(() => status() === "error");
  const isSuccess = createMemo(() => status() === "success");

  return {
    get data() { return data(); },
    get error() { return error(); },
    get status() { return status(); },
    get isLoading() { return isLoading(); },
    get isError() { return isError(); },
    get isSuccess() { return isSuccess(); },
    mutate,
    reset,
  };
}
