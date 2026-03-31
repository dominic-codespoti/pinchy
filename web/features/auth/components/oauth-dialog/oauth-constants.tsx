'use client';

import { Globe, Smartphone, Key } from 'lucide-react';
import { AuthMethod } from '../../types';

export interface MethodConfig {
  label: string;
  icon: React.ReactNode;
  description: string;
}

export const methodConfigs: Record<AuthMethod, MethodConfig> = {
  oauth_browser: {
    label: 'ChatGPT Plus/Pro',
    icon: <Globe className="h-4 w-4" />,
    description: 'Sign in with your ChatGPT account',
  },
  oauth_device: {
    label: 'Device Code',
    icon: <Smartphone className="h-4 w-4" />,
    description: 'Enter a code on GitHub',
  },
  api_key: {
    label: 'API Key',
    icon: <Key className="h-4 w-4" />,
    description: 'Enter your API key directly',
  },
};

// Provider icon components
export const OpenAIIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z" />
  </svg>
);

export const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

export const AnthropicIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
    <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541zm-.264 10.656 1.848-4.848 1.848 4.848z" />
  </svg>
);

// Provider configurations
export const providerConfigs: Record<string, { icon: React.ReactNode; bgColor: string; methods: AuthMethod[] }> = {
  openai: {
    icon: <OpenAIIcon />,
    bgColor: 'bg-[#10A37F]/10',
    methods: ['oauth_browser', 'api_key'],
  },
  copilot: {
    icon: <GitHubIcon />,
    bgColor: 'bg-[#24292F]/10',
    methods: ['oauth_device'],
  },
  anthropic: {
    icon: <AnthropicIcon />,
    bgColor: 'bg-[#D4A27F]/10',
    methods: ['api_key'],
  },
};
