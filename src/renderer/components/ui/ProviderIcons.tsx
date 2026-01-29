/**
 * Provider Icons
 * 
 * Official SVG icons for LLM providers.
 * Based on actual brand logos.
 */

import React from 'react';
import type { LLMProviderName } from '../../../shared/types';

interface IconProps {
  size?: number;
  className?: string;
}

/** Anthropic (Claude) - Official logo mark */
export const AnthropicIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 46 32" fill="none" className={className}>
    <path
      d="M32.73 0h-6.945L38.46 32h6.945L32.73 0ZM13.275 0 0 32h7.148l2.73-7.22h12.47L25.077 32h7.148L19.005 0h-5.73Zm-.837 18.62 4.153-10.985 4.152 10.985H12.438Z"
      fill="currentColor"
    />
  </svg>
);

/** OpenAI - Official logo */
export const OpenAIIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
      fill="currentColor"
    />
  </svg>
);

/** DeepSeek - Official whale/fish logo */
export const DeepSeekIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M21.168 10.645c-.473-1.738-1.713-3.151-3.418-3.892-.19-.082-.384-.155-.58-.218a6.343 6.343 0 0 0-.761-.183c-.347-.063-.7-.1-1.055-.11a7.472 7.472 0 0 0-.818.017 8.06 8.06 0 0 0-1.59.27 9.593 9.593 0 0 0-1.52.54c-.49.22-.96.48-1.4.78-.44.3-.85.64-1.22 1.01-.37.37-.7.78-.99 1.21-.29.43-.54.89-.74 1.37-.2.48-.36.98-.46 1.49-.1.51-.15 1.03-.14 1.55.01.52.07 1.04.19 1.54.12.5.29.99.51 1.45.22.46.49.9.8 1.3.31.4.66.77 1.05 1.1.39.33.81.62 1.26.87.45.25.93.46 1.42.62.49.16 1 .28 1.52.35.52.07 1.04.09 1.56.06.52-.03 1.04-.11 1.54-.24.5-.13.99-.31 1.45-.53.46-.22.9-.49 1.3-.8.4-.31.77-.66 1.1-1.05.33-.39.62-.81.87-1.26.25-.45.46-.93.62-1.42.16-.49.28-1 .35-1.52.07-.52.09-1.04.06-1.56-.03-.52-.11-1.04-.24-1.54z"
      fill="currentColor"
    />
    <circle cx="17" cy="11" r="1.2" fill="var(--color-surface-1)" />
  </svg>
);

/** Google Gemini - Official sparkle/star logo */
export const GeminiIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 24A14.304 14.304 0 0 0 12 0a14.304 14.304 0 0 0 0 24zM12 24c0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12 0 6.627-5.373 12-12 12 6.627 0 12 5.373 12 12z"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
    />
  </svg>
);

/** OpenRouter - Official logo (stylized OR) */
export const OpenRouterIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"
      fill="currentColor"
    />
    <path
      d="M12 6c-3.309 0-6 2.691-6 6s2.691 6 6 6 6-2.691 6-6-2.691-6-6-6zm0 10c-2.206 0-4-1.794-4-4s1.794-4 4-4 4 1.794 4 4-1.794 4-4 4z"
      fill="currentColor"
    />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

/** xAI (Grok) - X logo */
export const XAIIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      fill="currentColor"
    />
  </svg>
);

/** Mistral AI - Wind/breeze logo */
export const MistralIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="2" y="4" width="4" height="4" fill="currentColor" />
    <rect x="6" y="4" width="4" height="4" fill="currentColor" opacity="0.7" />
    <rect x="14" y="4" width="4" height="4" fill="currentColor" opacity="0.7" />
    <rect x="18" y="4" width="4" height="4" fill="currentColor" />
    <rect x="2" y="10" width="4" height="4" fill="currentColor" />
    <rect x="10" y="10" width="4" height="4" fill="currentColor" />
    <rect x="18" y="10" width="4" height="4" fill="currentColor" />
    <rect x="2" y="16" width="4" height="4" fill="currentColor" />
    <rect x="6" y="16" width="4" height="4" fill="currentColor" opacity="0.7" />
    <rect x="14" y="16" width="4" height="4" fill="currentColor" opacity="0.7" />
    <rect x="18" y="16" width="4" height="4" fill="currentColor" />
  </svg>
);

/** Z.AI GLM - Brain/neural network logo */
export const GLMIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
      fill="currentColor"
    />
    <path
      d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"
      fill="currentColor"
      opacity="0.7"
    />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <path
      d="M12 8v-2M12 18v-2M8 12H6M18 12h-2M9.17 9.17L7.76 7.76M16.24 16.24l-1.41-1.41M9.17 14.83l-1.41 1.41M16.24 7.76l-1.41 1.41"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Auto/Smart routing icon - sparkle/magic wand */
export const AutoIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0L9.937 15.5z"
      fill="currentColor"
    />
    <path
      d="M20 3v4M22 5h-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Map of provider IDs to icon components */
export const PROVIDER_ICONS: Record<LLMProviderName | 'auto', React.FC<IconProps>> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
  deepseek: DeepSeekIcon,
  gemini: GeminiIcon,
  openrouter: OpenRouterIcon,
  xai: XAIIcon,
  mistral: MistralIcon,
  glm: GLMIcon,
  auto: AutoIcon,
};

/** Get icon component for a provider */
export function getProviderIcon(provider: LLMProviderName | 'auto'): React.FC<IconProps> {
  return PROVIDER_ICONS[provider] || AutoIcon;
}

/** Provider icon component that renders the appropriate icon */
export const ProviderIcon: React.FC<IconProps & { provider: LLMProviderName | 'auto' }> = ({
  provider,
  size = 16,
  className,
}) => {
  const Icon = getProviderIcon(provider);
  return <Icon size={size} className={className} />;
};
