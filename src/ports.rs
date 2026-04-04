//! Centralized port configuration for the Pinchy application.
//!
//! These ports are used across the backend and must stay synchronized
//! with the frontend configuration in `web/lib/config/ports.ts`.

/// Backend gateway port (default: 3131)
/// Can be overridden via the `PINCHY_GATEWAY_ADDR` environment variable
pub const GATEWAY_DEFAULT: u16 = 3131;

/// Frontend development port (Next.js default)
pub const FRONTEND_DEV: u16 = 3000;

/// Vite development port
pub const VITE_DEV: u16 = 5173;

/// Anthropic/OpenAI compatible API port for local providers
pub const ANTHROPIC_COMPAT: u16 = 8080;

/// Default Ollama API port
pub const OLLAMA_DEFAULT: u16 = 11434;

/// LM Studio default port
pub const LMSTUDIO_DEFAULT: u16 = 1234;

/// vLLM default port
pub const VLLM_DEFAULT: u16 = 8000;

/// CORS allowed ports for development
pub const CORS_ALLOWED_PORTS: &[u16] = &[GATEWAY_DEFAULT, FRONTEND_DEV, VITE_DEV, ANTHROPIC_COMPAT];

/// Default gateway bind address
pub const GATEWAY_BIND_DEFAULT: &str = "0.0.0.0:3131";

/// Default gateway address for local connections (used by CLI status check)
pub const GATEWAY_LOCAL_DEFAULT: &str = "127.0.0.1:3131";
