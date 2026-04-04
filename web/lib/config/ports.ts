/**
 * Centralized port configuration for the Pinchy application.
 *
 * These ports are used across the frontend and must stay synchronized
 * with the backend configuration.
 */

// Type-safe port configuration
const DEFAULT_GATEWAY_PORT = 3131;
const DEFAULT_FRONTEND_DEV_PORT = 3000;
const DEFAULT_VITE_PORT = 5173;
const DEFAULT_ANTHROPIC_COMPAT_PORT = 8080;
const DEFAULT_OLLAMA_PORT = 11434;

/**
 * Port numbers used throughout the application.
 * @readonly
 */
export const PORTS = {
  /** Backend gateway port - can be overridden via env var */
  GATEWAY: Number(process.env.NEXT_PUBLIC_GATEWAY_PORT) || DEFAULT_GATEWAY_PORT,
  /** Frontend dev server port (Next.js) */
  FRONTEND_DEV: DEFAULT_FRONTEND_DEV_PORT,
  /** Vite dev server port */
  VITE: DEFAULT_VITE_PORT,
  /** Anthropic/OpenAI compatible API port */
  ANTHROPIC_COMPAT: DEFAULT_ANTHROPIC_COMPAT_PORT,
  /** Ollama local API port */
  OLLAMA_DEFAULT: DEFAULT_OLLAMA_PORT,
} as const;

/**
 * Get the WebSocket URL for the main gateway WebSocket.
 * Handles development vs production environments.
 */
export function getGatewayWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return `ws://127.0.0.1:${PORTS.GATEWAY}/ws`;
  }

  const isDev = process.env.NODE_ENV === 'development';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

  if (isDev && isLocalhost) {
    return `ws://127.0.0.1:${PORTS.GATEWAY}/ws`;
  }

  if (isDev) {
    return `${protocol}://${window.location.hostname}:${PORTS.GATEWAY}/ws`;
  }

  // Production: use same-origin
  return `${protocol}://${window.location.host}/ws`;
}

/**
 * Get the WebSocket URL for the logs WebSocket endpoint.
 */
export function getLogsWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return `ws://127.0.0.1:${PORTS.GATEWAY}/ws/logs`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:${PORTS.GATEWAY}/ws/logs`;
}

/**
 * Get the API base URL for backend requests.
 * Used primarily in development mode with Next.js rewrites.
 */
export function getApiBaseUrl(): string {
  return `http://127.0.0.1:${PORTS.GATEWAY}/api`;
}
