/**
 * Unified Provider Registry
 * Single source of truth for provider metadata, icons, colors, and models
 */

import type { ProviderMetadata, ModelsDevProvider, ProviderStatus } from '../../types';

// ============================================================================
// Provider Icons
// ============================================================================

const providerIcons: Record<string, React.ReactNode> = {
  openai: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.606-1.5z" />
    </svg>
  ),
  copilot: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  anthropic: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541zm-.264 10.656 1.848-4.848 1.848 4.848z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.46.66-1.15 1.2-1.97 1.55-.82.35-1.75.53-2.79.53-1.42 0-2.67-.49-3.75-1.47-1.08-.98-1.62-2.21-1.62-3.68 0-1.47.54-2.7 1.62-3.68 1.08-.98 2.33-1.47 3.75-1.47 1.04 0 1.97.18 2.79.53.82.35 1.51.89 1.97 1.55v2.05h-3.9v1.4h5.5v-4.2c-.6-.75-1.35-1.35-2.25-1.8-.9-.45-1.9-.67-3-.67-1.86 0-3.4.63-4.62 1.9C7.63 8.4 7.02 10.02 7.02 12s.61 3.6 1.83 4.88c1.22 1.27 2.76 1.9 4.62 1.9 1.1 0 2.1-.22 3-.67.9-.45 1.65-1.05 2.25-1.8l1.2 1.15z" />
    </svg>
  ),
  'azure-openai': (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505l8.295-16.553z" />
    </svg>
  ),
  bedrock: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  cohere: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
    </svg>
  ),
  cerebras: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L2 22h20L12 2zm0 4l7 14H5l7-14z" />
    </svg>
  ),
  groq: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  together: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  xai: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  mistral: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L8 7h8l-4-5zm-6 6l-4 5h8l-4-5zm12 0l-4 5h8l-4-5zM6 14l-4 5h8l-4-5zm12 0l-4 5h8l-4-5z" />
    </svg>
  ),
  fireworks: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm0 10l1.5 4.5L18 18l-4.5 1.5L12 22l-1.5-4.5L6 18l4.5-1.5L12 12zm6-6l.75 2.25L21 9l-2.25.75L18 12l-.75-2.25L15 9l2.25-.75L18 6zM6 6l.75 2.25L9 9l-2.25.75L6 12l-.75-2.25L3 9l2.25-.75L6 6z" />
    </svg>
  ),
  deepseek: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-8c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" />
    </svg>
  ),
  openrouter: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 4L2 9v6l10 5 10-5V9L12 4zm0 2.5l7 3.5-7 3.5-7-3.5 7-3.5zm-8 6l7 3.5 7-3.5v2L12 17 4 12.5v-2z" />
    </svg>
  ),
  ollama: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.1 0 2 .9 2 2 0 .68-.34 1.26-.85 1.62.57.42 1.01 1.02 1.23 1.72-.23-.05-.47-.08-.72-.08-1.66 0-3 1.34-3 3s1.34 3 3 3c.25 0 .49-.03.72-.08-.22.7-.66 1.3-1.23 1.72.51.36.85.94.85 1.62 0 1.1-.9 2-2 2s-2-.9-2-2c0-.68.34-1.26.85-1.62-.57-.42-1.01-1.02-1.23-1.72.23.05.47.08.72.08 1.66 0 3-1.34 3-3s-1.34-3-3-3c-.25 0-.49.03-.72.08.22-.7.66-1.3 1.23-1.72C9.34 8.26 9 7.68 9 7c0-1.1.9-2 2-2z" />
    </svg>
  ),
  lmstudio: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
    </svg>
  ),
  vllm: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L2 19h20L12 2zm0 3l7 12H5l7-12zm-1 8h2v2h-2v-2zm0-4h2v2h-2V9z" />
    </svg>
  ),
};

// ============================================================================
// Provider Colors & Theme
// ============================================================================

export interface ProviderTheme {
  badgeColor: string;
  textColor: string;
}

const providerThemes: Record<string, ProviderTheme> = {
  // Major providers
  openai: {
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    textColor: 'text-green-600 dark:text-green-400',
  },
  'azure-openai': {
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  azure: {
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  copilot: {
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    textColor: 'text-purple-600 dark:text-purple-400',
  },
  anthropic: {
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    textColor: 'text-orange-600 dark:text-orange-400',
  },
  google: {
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    textColor: 'text-blue-500 dark:text-blue-300',
  },
  'google-ai': {
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    textColor: 'text-blue-500 dark:text-blue-300',
  },
  'google-gemini': {
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    textColor: 'text-blue-500 dark:text-blue-300',
  },
  vertex: {
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    textColor: 'text-blue-500 dark:text-blue-300',
  },
  'vertex-ai': {
    badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    textColor: 'text-blue-500 dark:text-blue-300',
  },
  bedrock: {
    badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    textColor: 'text-yellow-600 dark:text-yellow-400',
  },
  'amazon-bedrock': {
    badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    textColor: 'text-yellow-600 dark:text-yellow-400',
  },
  cohere: {
    badgeColor: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100',
    textColor: 'text-pink-600 dark:text-pink-400',
  },
  cerebras: {
    badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    textColor: 'text-red-600 dark:text-red-400',
  },
  together: {
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
    textColor: 'text-indigo-600 dark:text-indigo-400',
  },
  'together-ai': {
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
    textColor: 'text-indigo-600 dark:text-indigo-400',
  },
  xai: {
    badgeColor: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100',
    textColor: 'text-gray-700 dark:text-gray-300',
  },
  'x-ai': {
    badgeColor: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100',
    textColor: 'text-gray-700 dark:text-gray-300',
  },
  grok: {
    badgeColor: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100',
    textColor: 'text-gray-700 dark:text-gray-300',
  },
  groq: {
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
    textColor: 'text-teal-600 dark:text-teal-400',
  },
  mistral: {
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
    textColor: 'text-cyan-600 dark:text-cyan-400',
  },
  'mistral-ai': {
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
    textColor: 'text-cyan-600 dark:text-cyan-400',
  },
  fireworks: {
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    textColor: 'text-orange-600 dark:text-orange-400',
  },
  'fireworks-ai': {
    badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    textColor: 'text-orange-600 dark:text-orange-400',
  },
  deepseek: {
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  openrouter: {
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    textColor: 'text-purple-600 dark:text-purple-400',
  },
  'open-router': {
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    textColor: 'text-purple-600 dark:text-purple-400',
  },
  ollama: {
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  lmstudio: {
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  'lm-studio': {
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  vllm: {
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100',
    textColor: 'text-violet-600 dark:text-violet-400',
  },
  // Extended providers
  ai21: {
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
    textColor: 'text-rose-600 dark:text-rose-400',
  },
  'ai21-labs': {
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
    textColor: 'text-rose-600 dark:text-rose-400',
  },
  perplexity: {
    badgeColor: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-100',
    textColor: 'text-lime-600 dark:text-lime-400',
  },
  'perplexity-ai': {
    badgeColor: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-100',
    textColor: 'text-lime-600 dark:text-lime-400',
  },
  huggingface: {
    badgeColor: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200',
    textColor: 'text-yellow-600 dark:text-yellow-400',
  },
  'hugging-face': {
    badgeColor: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200',
    textColor: 'text-yellow-600 dark:text-yellow-400',
  },
  replicate: {
    badgeColor: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200',
    textColor: 'text-red-500 dark:text-red-400',
  },
  moonshot: {
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-100',
    textColor: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  'moonshot-ai': {
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-100',
    textColor: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  qwen: {
    badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100',
    textColor: 'text-sky-600 dark:text-sky-400',
  },
  sambanova: {
    badgeColor: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200',
    textColor: 'text-green-500 dark:text-green-400',
  },
  'samba-nova': {
    badgeColor: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200',
    textColor: 'text-green-500 dark:text-green-400',
  },
  unify: {
    badgeColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200',
    textColor: 'text-purple-500 dark:text-purple-400',
  },
  deepinfra: {
    badgeColor: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200',
    textColor: 'text-cyan-500 dark:text-cyan-400',
  },
  'deep-infra': {
    badgeColor: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200',
    textColor: 'text-cyan-500 dark:text-cyan-400',
  },
};

const defaultTheme: ProviderTheme = {
  badgeColor: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  textColor: 'text-muted-foreground',
};

// ============================================================================
// Provider Models
// ============================================================================

const providerModels: Record<string, string[]> = {
  openai: ['GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo', 'o3-mini'],
  'azure-openai': ['GPT-4', 'GPT-4o', 'GPT-3.5 Turbo'],
  copilot: ['Copilot GPT-4', 'Copilot Claude'],
  anthropic: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Claude 3 Haiku'],
  google: ['Gemini Pro', 'Gemini Ultra'],
  bedrock: ['Claude 3', 'Llama 3', 'Titan'],
  cohere: ['Command', 'Command Light'],
  cerebras: ['Llama 3.1 70B', 'Llama 3.1 8B'],
  groq: ['Llama 3.1 70B', 'Llama 3.1 8B', 'Mixtral 8x7B'],
  together: ['Llama 3', 'Qwen 2', 'DeepSeek'],
  xai: ['Grok 2', 'Grok 1.5'],
  mistral: ['Mistral Large', 'Mistral Medium', 'Codestral'],
  fireworks: ['Llama 3.1 405B', 'Llama 3.1 70B', 'Mixtral 8x22B', 'Qwen 2.5 72B'],
  deepseek: ['DeepSeek V3', 'DeepSeek R1', 'DeepSeek Coder'],
  openrouter: ['Auto', 'Claude 3.5 Sonnet', 'GPT-4o', 'Llama 3.1 405B'],
  ollama: ['Local models'],
  lmstudio: ['Local models'],
  vllm: ['Local models'],
};

// ============================================================================
// Display Names
// ============================================================================

const wellKnownNames: Record<string, string> = {
  // Major cloud providers
  openai: 'OpenAI',
  'azure-openai': 'Azure OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  'google-ai': 'Google AI',
  'google-gemini': 'Google Gemini',
  bedrock: 'AWS Bedrock',
  'amazon-bedrock': 'AWS Bedrock',
  copilot: 'GitHub Copilot',
  'github-copilot': 'GitHub Copilot',
  // Popular AI providers
  cohere: 'Cohere',
  ai21: 'AI21 Labs',
  'ai21-labs': 'AI21 Labs',
  perplexity: 'Perplexity',
  'perplexity-ai': 'Perplexity',
  // High-performance inference
  groq: 'Groq',
  cerebras: 'Cerebras',
  'samba-nova': 'SambaNova',
  sambanova: 'SambaNova',
  // Open source hosts
  together: 'Together AI',
  'together-ai': 'Together AI',
  fireworks: 'Fireworks AI',
  'fireworks-ai': 'Fireworks AI',
  deepinfra: 'DeepInfra',
  'deep-infra': 'DeepInfra',
  replicate: 'Replicate',
  // Model-specific
  mistral: 'Mistral AI',
  'mistral-ai': 'Mistral AI',
  xai: 'xAI (Grok)',
  'x-ai': 'xAI (Grok)',
  grok: 'xAI (Grok)',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot AI',
  'moonshot-ai': 'Moonshot AI',
  qwen: 'Qwen',
  // Routers
  openrouter: 'OpenRouter',
  'open-router': 'OpenRouter',
  unify: 'Unify',
  // Local/self-hosted
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  'lm-studio': 'LM Studio',
  vllm: 'vLLM',
  llamacpp: 'llama.cpp',
  'llama-cpp': 'llama.cpp',
  kobold: 'KoboldAI',
  'kobold-ai': 'KoboldAI',
  tabby: 'TabbyAPI',
  'tabby-api': 'TabbyAPI',
  'text-gen': 'Text Generation WebUI',
  'text-generation-webui': 'Text Generation WebUI',
  // Enterprise
  'vertex-ai': 'Google Vertex AI',
  vertex: 'Google Vertex AI',
  'azure-ai': 'Azure AI',
  'azure-ml': 'Azure ML',
  watsonx: 'IBM Watsonx',
  'ibm-watsonx': 'IBM Watsonx',
  databricks: 'Databricks',
  // Specialized
  huggingface: 'Hugging Face',
  'hugging-face': 'Hugging Face',
  'hf-inference': 'Hugging Face Inference',
  pinecone: 'Pinecone',
  chroma: 'Chroma',
  weaviate: 'Weaviate',
  pgvector: 'pgvector',
};

// ============================================================================
// Core Provider List
// ============================================================================

/**
 * FALLBACK_PROVIDER_METADATA - Minimal static metadata for common providers.
 * This is used as a fallback when the models.dev API is unavailable.
 */
export const PROVIDERS: ProviderMetadata[] = [
  { id: 'openai', name: 'OpenAI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'azure-openai', name: 'Azure OpenAI', requiresApiKey: true, requiresEndpoint: true },
  { id: 'copilot', name: 'GitHub Copilot', requiresApiKey: false, requiresEndpoint: false, requiresOAuth: true },
  { id: 'anthropic', name: 'Anthropic', requiresApiKey: true, requiresEndpoint: false },
  { id: 'google', name: 'Google AI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'bedrock', name: 'AWS Bedrock', requiresApiKey: true, requiresEndpoint: false },
  { id: 'cohere', name: 'Cohere', requiresApiKey: true, requiresEndpoint: false },
  { id: 'cerebras', name: 'Cerebras', requiresApiKey: true, requiresEndpoint: false },
  { id: 'groq', name: 'Groq', requiresApiKey: true, requiresEndpoint: false },
  { id: 'together', name: 'Together AI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'xai', name: 'xAI (Grok)', requiresApiKey: true, requiresEndpoint: false },
  { id: 'mistral', name: 'Mistral', requiresApiKey: true, requiresEndpoint: false },
  { id: 'fireworks', name: 'Fireworks AI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'deepseek', name: 'DeepSeek', requiresApiKey: true, requiresEndpoint: false },
  { id: 'openrouter', name: 'OpenRouter', requiresApiKey: true, requiresEndpoint: false },
  { id: 'ollama', name: 'Ollama', requiresApiKey: false, requiresEndpoint: false },
  { id: 'lmstudio', name: 'LM Studio', requiresApiKey: false, requiresEndpoint: false },
  { id: 'vllm', name: 'vLLM', requiresApiKey: false, requiresEndpoint: false },
] as const;

// ============================================================================
// Unified Registry API
// ============================================================================

export interface UnifiedProviderMetadata extends ProviderMetadata {
  icon?: React.ReactNode;
  theme: ProviderTheme;
  models: string[];
}

/**
 * Get unified provider metadata including icon, theme, and models.
 * This is the preferred API for accessing all provider metadata.
 */
export function getProviderMetadata(providerId: string): UnifiedProviderMetadata {
  const base = PROVIDERS.find((p) => p.id === providerId);
  const displayName = wellKnownNames[providerId] || base?.name || capitalize(providerId);

  return {
    id: providerId,
    name: displayName,
    requiresApiKey: base?.requiresApiKey ?? true,
    requiresEndpoint: base?.requiresEndpoint ?? false,
    requiresOAuth: base?.requiresOAuth ?? false,
    icon: providerIcons[providerId],
    theme: providerThemes[providerId] ?? defaultTheme,
    models: providerModels[providerId] ?? [],
  };
}

/**
 * Get provider icon (SVG component)
 */
export function getProviderIcon(providerId: string): React.ReactNode | undefined {
  return providerIcons[providerId];
}

/**
 * Get provider badge color class
 * @deprecated Use getProviderMetadata(providerId).theme.badgeColor instead
 */
export function getProviderBadgeColor(providerId: string): string {
  return providerThemes[providerId]?.badgeColor ?? defaultTheme.badgeColor;
}

/**
 * Get provider text color class
 * @deprecated Use getProviderMetadata(providerId).theme.textColor instead
 */
export function getProviderTextColor(providerId: string): string {
  return providerThemes[providerId]?.textColor ?? defaultTheme.textColor;
}

/**
 * Get available models for a provider
 * @deprecated Use getProviderMetadata(providerId).models instead
 */
export function getProviderModels(providerId: string): string[] {
  return providerModels[providerId] ?? [];
}

/**
 * Get well-known display name for a provider
 */
export function getProviderDisplayName(providerId: string): string {
  return wellKnownNames[providerId] || capitalize(providerId);
}

// ============================================================================
// models.dev Integration
// ============================================================================

/**
 * Map models.dev provider data to local ProviderMetadata format.
 * This allows dynamic support for 105+ providers from the models.dev registry.
 */
export function providerFromModelsDevData(
  provider: ModelsDevProvider,
  status?: ProviderStatus
): ProviderMetadata {
  // Determine if API key is required based on env vars
  const requiresApiKey = provider.env && provider.env.length > 0 &&
    provider.env.some(e => e.includes('KEY') || e.includes('TOKEN'));

  // Special case: copilot uses OAuth
  const requiresOAuth = provider.id === 'copilot' || provider.id === 'github-copilot';

  // Determine if endpoint is required
  const requiresEndpoint =
    provider.id.includes('azure') ||
    provider.id === 'ollama' ||
    provider.id === 'lmstudio' ||
    provider.id === 'vllm' ||
    provider.env.some(e => e.includes('ENDPOINT') || e.includes('URL') || e.includes('BASE'));

  return {
    id: provider.id,
    name: wellKnownNames[provider.id] || provider.name || capitalize(provider.id),
    requiresApiKey: requiresApiKey && !requiresOAuth,
    requiresEndpoint,
    requiresOAuth,
  };
}

// ============================================================================
// Utilities
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Re-export providerIcons for backward compatibility
export { providerIcons };
