import { Effect, Schema as S } from "effect";

// ── Error types ──────────────────────────────────────

export class HttpError {
  readonly _tag = "HttpError" as const;
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {}

  get message(): string {
    return this.body || this.statusText || `HTTP ${this.status}`;
  }
}

export class ParseError {
  readonly _tag = "ParseError" as const;
  constructor(
    readonly reason: string,
  ) {}
}

// ── HTTP primitives ──────────────────────────────────

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const [k, v] of headers) {
      if (k !== undefined && v !== undefined) out[k] = v;
    }
    return out;
  }
  return headers;
}

/**
 * Type-safe fetch wrapper returning an Effect.
 * Validates the response through an Effect Schema.
 */
export function typedRequest<A, I>(
  schema: S.Schema<A, I>,
  input: string,
  init?: RequestInit,
): Effect.Effect<A, HttpError | ParseError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(input, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...normalizeHeaders(init?.headers),
          },
        }),
      catch: (e) => new HttpError(0, "Network error", String(e)),
    });

    if (!response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new HttpError(response.status, response.statusText, ""),
      });
      return yield* Effect.fail(
        new HttpError(response.status, response.statusText, body as string),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const decode = S.decodeUnknown(schema);

    if (contentType.includes("application/json")) {
      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (e) => new ParseError(`JSON parse error: ${e}`),
      });
      return yield* Effect.mapError(decode(json), (e) => new ParseError(String(e)));
    }

    const text = yield* Effect.tryPromise({
      try: () => response.text() as Promise<unknown>,
      catch: (e) => new ParseError(`Text read error: ${e}`),
    });
    return yield* Effect.mapError(decode(text), (e) => new ParseError(String(e)));
  });
}

/**
 * Untyped request for endpoints where we don't validate the shape
 * (e.g. config which is arbitrary JSON).
 */
export function rawRequest(
  input: string,
  init?: RequestInit,
): Effect.Effect<unknown, HttpError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(input, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...normalizeHeaders(init?.headers),
          },
        }),
      catch: (e) => new HttpError(0, "Network error", String(e)),
    });

    if (!response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new HttpError(response.status, response.statusText, ""),
      });
      return yield* Effect.fail(
        new HttpError(response.status, response.statusText, body as string),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (e) => new HttpError(0, "JSON parse error", String(e)),
      });
    }

    return yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) => new HttpError(0, "Text read error", String(e)),
    });
  });
}
