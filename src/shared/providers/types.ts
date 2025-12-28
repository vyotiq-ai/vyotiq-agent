/**
 * Provider Types and Interfaces
 * 
 * Core type definitions for LLM providers and models.
 * This module contains all interfaces used across the provider system.
 */

import type { LLMProviderName } from '../types';

// =============================================================================
// Provider Info Types
// =============================================================================

/** Icon types available for providers */
export type ProviderIconType = 'bot' | 'brain' | 'cpu' | 'atom' | 'sparkles';

/** Provider display and metadata information */
export interface ProviderInfo {
  /** Unique provider identifier */
  id: LLMProviderName;
  /** Full display name */
  name: string;
  /** Short display name for compact UI */
  shortName: string;
  /** Brief description of the provider */
  description: string;
  /** Provider website URL */
  website: string;
  /** Documentation URL */
  docsUrl: string;
  /** Tailwind text color class */
  color: string;
  /** Tailwind background color class */
  bgColor: string;
  /** Icon identifier */
  icon: ProviderIconType;
}

// =============================================================================
// Provider Capability Types
// =============================================================================

/** Provider-level capability definitions */
export interface ProviderCapabilities {
  /** Whether the provider supports streaming responses */
  supportsStreaming: boolean;
  /** Whether the provider supports tool/function calling */
  supportsToolUse: boolean;
  /** Whether the provider supports vision/image inputs */
  supportsVision: boolean;
  /** Whether the provider supports audio input understanding */
  supportsAudioInput?: boolean;
  /** Whether the provider supports video input understanding */
  supportsVideoInput?: boolean;
  /** Whether the provider supports document/PDF processing */
  supportsDocuments?: boolean;
  /** Whether the provider supports image generation output */
  supportsImageGeneration?: boolean;
  /** Whether the provider supports text-to-speech output */
  supportsTTS?: boolean;
  /** Whether the provider supports structured JSON output */
  supportsStructuredOutput?: boolean;
  /** Whether the provider supports thinking/reasoning */
  supportsThinking?: boolean;
  /** 
   * Whether the provider/model supports multi-turn chat conversations.
   * Defaults to true for most models. Set to false for TTS, image-only, etc.
   */
  supportsMultiturnChat?: boolean;
}

// =============================================================================
// Model Types
// =============================================================================

/** Performance/cost tier classification */
export type ModelTier = 'flagship' | 'balanced' | 'fast' | 'legacy';

/** Complete model information */
export interface ModelInfo {
  /** Unique model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Provider this model belongs to */
  provider: LLMProviderName;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Cost per 1M input tokens in USD */
  inputCostPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1M: number;
  /** Whether the model supports tool/function calling */
  supportsTools: boolean;
  /** Whether the model supports vision/image inputs */
  supportsVision: boolean;
  /** Whether the model supports streaming */
  supportsStreaming: boolean;
  /** Whether the model supports audio input */
  supportsAudioInput?: boolean;
  /** Whether the model supports video input */
  supportsVideoInput?: boolean;
  /** Whether the model supports document/PDF processing */
  supportsDocuments?: boolean;
  /** Whether the model can generate images */
  supportsImageGeneration?: boolean;
  /** Whether the model can generate speech/audio */
  supportsTTS?: boolean;
  /** Whether the model supports structured JSON output */
  supportsStructuredOutput?: boolean;
  /** Whether the model supports thinking/reasoning */
  supportsThinking?: boolean;
  /** 
   * Whether the model supports multi-turn chat conversations.
   * Defaults to true. Set to false for TTS-only, image-only models, etc.
   */
  supportsMultiturnChat?: boolean;
  /** Performance/cost tier */
  tier: ModelTier;
  /** Brief description */
  description: string;
  /** Whether this is the default model for the provider */
  isDefault?: boolean;
}

// =============================================================================
// Export Types
// =============================================================================
