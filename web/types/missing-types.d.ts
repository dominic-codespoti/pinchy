// Type declarations for missing modules
declare module 'msw/browser' {
  export function setupWorker(...handlers: unknown[]): unknown;
}

declare module 'msw' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const http: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const HttpResponse: any;
  export type RequestHandler = unknown;
  export function delay(ms: number): Promise<void>;
}
