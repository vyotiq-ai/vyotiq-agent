import type { AgentSettings, LLMProviderName, ProviderSettings } from '../../../shared/types';
import type { LLMProvider } from './baseProvider';
import { OpenAIProvider } from './openAIProvider';
import { DeepSeekProvider } from './deepseekProvider';
import { AnthropicProvider } from './anthropicProvider';
import { GeminiProvider } from './geminiProvider';
import { OpenRouterProvider } from './openrouterProvider';
import { createLogger } from '../../logger';

const logger = createLogger('ProviderRegistry');

// Re-export types and utilities from baseProvider
export { APIError, withRetry, sleep, type RetryConfig, type LLMProvider } from './baseProvider';

// Re-export OpenRouter provider and types
export { 
  OpenRouterProvider, 
  type OpenRouterModel,
  type OpenRouterModelCategory,
  getModelCategory,
  modelSupportsTools,
  modelSupportsVision,
  modelSupportsStreaming,
  getModelProvider,
} from './openrouterProvider';

// Re-export Anthropic provider and types
export { AnthropicProvider, type AnthropicModel } from './anthropicProvider';

// Re-export OpenAI provider and types
export { OpenAIProvider, type OpenAIModel } from './openAIProvider';

// Re-export DeepSeek provider and types
export { DeepSeekProvider, type DeepSeekModel } from './deepseekProvider';

// Re-export Gemini provider and types
export { GeminiProvider, type GeminiModel } from './geminiProvider';

// Re-export Gemini Files API service
export { 
  GeminiFilesService, 
  getGeminiFilesService,
  type GeminiFileMetadata,
  type UploadFileOptions,
} from './geminiFilesService';

// Re-export Gemini Context Caching service
export {
  GeminiCacheService,
  getGeminiCacheService,
  type CachedContent,
  type CreateCacheConfig,
  type UpdateCacheConfig,
  type ListCachesResponse,
} from './geminiCacheService';

// Re-export provider registry
export {
  PROVIDER_CONFIGS,
  ANTHROPIC_CONFIG,
  OPENAI_CONFIG,
  DEEPSEEK_CONFIG,
  GEMINI_CONFIG,
  OPENROUTER_CONFIG,
  getProviderConfig,
  getModelDefinition,
  getDefaultModel,
  getProviderModels,
  providerSupports,
  getProviderRateLimits,
  getAllProviders,
  type ProviderDefinition,
  type ModelDefinition,
  type RateLimitTier,
} from './registry';

// Re-export provider management
export { 
  CostManager, 
  DEFAULT_COST_RATES,
  registerOpenRouterPricing,
  clearDynamicPricingCache,
  type CostRates, 
  type CostSummary 
} from './CostManager';
export { 
  ProviderHealthMonitor, 
  DEFAULT_HEALTH_CONFIG, 
  type HealthCheckConfig 
} from './ProviderHealthMonitor';
export { 
  FailoverManager, 
  DEFAULT_FAILOVER_CHAINS, 
  type FailoverDecision, 
  type FailoverEvent,
  type ProviderPreference 
} from './FailoverManager';

/** Provider with metadata for selection logic */
export interface ProviderInfo {
  provider: LLMProvider;
  hasApiKey: boolean;
  enabled: boolean;
  priority: number;
}

/** Map of providers with additional metadata */
export type ProviderMap = Map<LLMProviderName, ProviderInfo>;

/**
 * Build a map of LLM providers from settings
 * Each provider is configured with:
 * - API key from settings
 * - Custom base URL if configured
 * - Default model from provider settings
 * - Enabled/disabled state
 * - Priority for selection ordering
 */
export function buildProviderMap(settings: AgentSettings): ProviderMap {
  const providers = new Map<LLMProviderName, ProviderInfo>();
  
  // Helper to get provider settings with defaults
  const getSettings = (name: LLMProviderName): ProviderSettings => {
    return settings.providerSettings?.[name] ?? {
      enabled: true,
      priority: 99,
      model: { modelId: '' },
      timeout: 120000,
    };
  };
  
  // Debug: Log all available API keys
  logger.debug('Available API keys', {
    hasOpenAI: Boolean(settings.apiKeys.openai?.trim()),
    hasDeepSeek: Boolean(settings.apiKeys.deepseek?.trim()),
    hasAnthropic: Boolean(settings.apiKeys.anthropic?.trim()),
    hasGemini: Boolean(settings.apiKeys.gemini?.trim()),
    hasOpenRouter: Boolean(settings.apiKeys.openrouter?.trim()),
    openaiKeyLength: settings.apiKeys.openai?.length ?? 0,
    deepseekKeyLength: settings.apiKeys.deepseek?.length ?? 0,
    anthropicKeyLength: settings.apiKeys.anthropic?.length ?? 0,
    geminiKeyLength: settings.apiKeys.gemini?.length ?? 0,
    openrouterKeyLength: settings.apiKeys.openrouter?.length ?? 0,
  });
  
  // OpenAI
  const openaiSettings = getSettings('openai');
  const openaiApiKey = settings.apiKeys.openai;
  providers.set('openai', {
    provider: new OpenAIProvider(
      openaiApiKey,
      openaiSettings.baseUrl || 'https://api.openai.com/v1',
      openaiSettings.model?.modelId
    ),
    hasApiKey: Boolean(openaiApiKey?.trim()),
    enabled: openaiSettings.enabled,
    priority: openaiSettings.priority,
  });
  
  // DeepSeek  
  const deepseekSettings = getSettings('deepseek');
  const deepseekApiKey = settings.apiKeys.deepseek;
  // Pass the enableDeepSeekThinking setting from agent config
  // Default to false - thinking mode should only be enabled explicitly or when using deepseek-reasoner
  // When enabled on deepseek-chat, the API returns reasoning_content (CoT) separately from content
  // @see https://api-docs.deepseek.com/guides/thinking_mode
  const enableDeepSeekThinking = settings.defaultConfig?.enableDeepSeekThinking ?? false;
  providers.set('deepseek', {
    provider: new DeepSeekProvider(
      deepseekApiKey,
      deepseekSettings.baseUrl || 'https://api.deepseek.com',
      deepseekSettings.model?.modelId,
      enableDeepSeekThinking
    ),
    hasApiKey: Boolean(deepseekApiKey?.trim()),
    enabled: deepseekSettings.enabled,
    priority: deepseekSettings.priority,
  });
  
  // Anthropic
  const anthropicSettings = getSettings('anthropic');
  const anthropicApiKey = settings.apiKeys.anthropic;
  providers.set('anthropic', {
    provider: new AnthropicProvider(
      anthropicApiKey,
      anthropicSettings.baseUrl,
      anthropicSettings.model?.modelId
    ),
    hasApiKey: Boolean(anthropicApiKey?.trim()),
    enabled: anthropicSettings.enabled,
    priority: anthropicSettings.priority,
  });
  
  // Gemini
  const geminiSettings = getSettings('gemini');
  const geminiApiKey = settings.apiKeys.gemini;
  providers.set('gemini', {
    provider: new GeminiProvider(
      geminiApiKey,
      geminiSettings.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      geminiSettings.model?.modelId
    ),
    hasApiKey: Boolean(geminiApiKey?.trim()),
    enabled: geminiSettings.enabled,
    priority: geminiSettings.priority,
  });
  
  // OpenRouter
  const openrouterSettings = getSettings('openrouter');
  const openrouterApiKey = settings.apiKeys.openrouter;
  providers.set('openrouter', {
    provider: new OpenRouterProvider(
      openrouterApiKey,
      openrouterSettings.baseUrl || 'https://openrouter.ai/api/v1',
      openrouterSettings.model?.modelId
    ),
    hasApiKey: Boolean(openrouterApiKey?.trim()),
    enabled: openrouterSettings.enabled,
    priority: openrouterSettings.priority,
  });
  
  return providers;
}

/**
 * Get list of available providers (has API key and is enabled)
 * sorted by priority (lower priority number = higher preference)
 */
export function getAvailableProviders(providerMap: ProviderMap): LLMProvider[] {
  return Array.from(providerMap.entries())
    .filter(([, info]) => info.hasApiKey && info.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([, info]) => info.provider);
}

/**
 * Get list of provider names that are available
 */
export function getAvailableProviderNames(providerMap: ProviderMap): LLMProviderName[] {
  return Array.from(providerMap.entries())
    .filter(([, info]) => info.hasApiKey && info.enabled)
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name]) => name);
}

/**
 * Check if a specific provider is available
 */
export function isProviderAvailable(providerMap: ProviderMap, name: LLMProviderName): boolean {
  const info = providerMap.get(name);
  return Boolean(info?.hasApiKey && info?.enabled);
}
