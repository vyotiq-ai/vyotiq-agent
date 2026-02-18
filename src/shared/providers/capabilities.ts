/**
 * Provider Capabilities
 * 
 * Defines what features each LLM provider supports.
 * This is the source of truth for provider-level feature flags.
 */

import type { LLMProviderName } from '../types';
import type { ProviderCapabilities } from './types';

// =============================================================================
// Provider Capabilities
// =============================================================================

/**
 * Capabilities for each LLM provider.
 * This defines what features each provider supports for optimal feature usage.
 */
export const PROVIDER_CAPABILITIES: Record<LLMProviderName, ProviderCapabilities> = {
  anthropic: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,
    supportsThinking: true,  // Extended thinking support for Claude models
  },
  deepseek: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,  // DeepSeek V3/reasoner support vision
  },
  openai: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,
    supportsStructuredOutput: true,
    supportsThinking: true,  // Reasoning models with configurable effort
  },
  gemini: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,
    supportsAudioInput: true,
    supportsVideoInput: true,
    supportsDocuments: true,
    supportsImageGeneration: true,
    supportsTTS: true,
    supportsStructuredOutput: true,
    supportsThinking: true,
  },
  openrouter: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,  // Depends on selected model
    supportsStructuredOutput: true,  // Depends on selected model
  },
  xai: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  mistral: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,
    supportsStructuredOutput: true,
  },
  glm: {
    supportsStreaming: true,
    supportsToolUse: true,
    supportsVision: true,  // GLM-4.6V, GLM-4.5V support vision
    supportsStructuredOutput: true,
    supportsThinking: true,  // GLM-4.7, GLM-4.6 support thinking mode
  },
};

// =============================================================================
// Capability Helper Functions
// =============================================================================

/**
 * Get capabilities for a provider
 */
export function getProviderCapabilities(provider: LLMProviderName): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

/**
 * Check if provider supports streaming
 */
export function supportsStreaming(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsStreaming ?? false;
}

/**
 * Check if provider supports tool use
 */
export function supportsToolUse(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsToolUse ?? false;
}

/**
 * Check if provider supports vision
 */
export function supportsVision(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsVision ?? false;
}

/**
 * Check if provider supports audio input understanding
 */
export function supportsAudioInput(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsAudioInput ?? false;
}

/**
 * Check if provider supports video input understanding
 */
export function supportsVideoInput(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsVideoInput ?? false;
}

/**
 * Check if provider supports document/PDF processing
 */
export function supportsDocuments(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsDocuments ?? false;
}

/**
 * Check if provider supports image generation output
 */
export function supportsImageGeneration(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsImageGeneration ?? false;
}

/**
 * Check if provider supports text-to-speech output
 */
export function supportsTTS(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsTTS ?? false;
}

/**
 * Check if provider supports structured JSON output
 */
export function supportsStructuredOutput(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsStructuredOutput ?? false;
}

/**
 * Check if provider supports thinking/reasoning
 */
export function supportsThinking(provider: LLMProviderName): boolean {
  return PROVIDER_CAPABILITIES[provider]?.supportsThinking ?? false;
}
