import { z } from "zod";

/** Error thrown when an HTTP request fails */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(body || statusText || `HTTP ${status}`);
    this.name = "HttpError";
  }
}

/** Convert HeadersInit to a plain Record for spreading */
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
 * Type-safe fetch wrapper. Every call validates the response through a
 * Zod schema, guaranteeing the return type at runtime.
 */
export async function typedRequest<T>(
  schema: z.ZodType<T>,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...normalizeHeaders(init?.headers),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(response.status, response.statusText, body);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json: unknown = await response.json();
    return schema.parse(json);
  }

  // For non-JSON responses, parse as string through the schema
  const text: unknown = await response.text();
  return schema.parse(text);
}

/**
 * Untyped request for endpoints where we don't validate the shape
 * (e.g. config which is arbitrary JSON). Returns `unknown` — callers
 * must narrow the result themselves.
 */
export async function rawRequest(
  input: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...normalizeHeaders(init?.headers),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(response.status, response.statusText, body);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  return response.text();
}
