/**
 * LLM Providers Module
 * 
 * This module provides a comprehensive configuration system for LLM providers
 * and their models. It includes:
 * 
 * - Type definitions for providers, models, and capabilities
 * - Provider definitions and metadata
 * - Model configurations
 * - Helper functions for working with providers and models
 * - Unified message formatting for all providers
 * 
 * @module providers
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  ModelInfo,
  ProviderInfo,
  ProviderCapabilities,
  ModelTier,
  ProviderIconType,
} from './types';

// Re-export types from shared types for convenience
export type { LLMProviderName, ProviderSettings } from '../types';

// =============================================================================
// Constant Exports
// =============================================================================

// Provider definitions
export { 
  PROVIDERS, 
  PROVIDER_ORDER,
  getProvider,
  getAllProviderIds 
} from './definitions';

// Provider capabilities
export { PROVIDER_CAPABILITIES } from './capabilities';

// Models
export {
  MODELS,
  DEFAULT_MODELS,
  getModelsForProvider,
  getChatModelsForProvider,
  getChatCapableModels,
  getDefaultModel,
  getModelById,
  getModelsByTier,
  getAllModels,
  getModelsWithFeature,
  isValidModelId,
  getProviderForModel,
} from './models';

// Pricing
export {
  MODEL_PRICING,
  lookupModelPricing,
  type ModelPricing,
} from './pricing';

// =============================================================================
// Function Exports
// =============================================================================

// Formatting utilities
export {
  formatCost,
  formatContextWindow,
  formatNumber,
  formatTokens,
  formatSpeed,
  getTierBadge,
} from './formatting';

// Provider configuration utilities
export {
  isProviderConfigured,
  getConfiguredProviders,
  getFirstConfiguredProvider,
  getProviderInfo,
  getAvailableProviders,
  isValidProvider,
  getProviderDisplayName,
  getProviderWebsite,
  getProviderDocsUrl,
  getProviderDescription,
} from './configuration';

// =============================================================================
// Message Formatting Exports
// =============================================================================

export {
  getFormatter,
  registerFormatter,
  convertMessages,
  formatToolsForProvider,
  parseProviderResponse,
  AnthropicFormatter,
  OpenAIFormatter,
  BaseMessageFormatter,
  type MessageFormatter,
  type InternalMessage,
  type InternalToolDefinition,
  type SystemPromptOptions,
  type AnthropicMessage,
  type OpenAIMessage,
} from './messageFormatting';

