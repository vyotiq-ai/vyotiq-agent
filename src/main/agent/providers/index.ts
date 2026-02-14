import type { AgentSettings, LLMProviderName, ProviderSettings } from '../../../shared/types';
import type { LLMProvider } from './baseProvider';
import { OpenAIProvider } from './openAIProvider';
import { DeepSeekProvider } from './deepseekProvider';
import { AnthropicProvider } from './anthropicProvider';
import { GeminiProvider } from './geminiProvider';
import { OpenRouterProvider } from './openrouterProvider';
import { XAIProvider } from './xaiProvider';
import { MistralProvider } from './mistralProvider';
import { GLMProvider, GLM_GENERAL_ENDPOINT, GLM_CODING_ENDPOINT } from './glmProvider';
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

// Re-export xAI provider and types
export { XAIProvider, type XAIModel } from './xaiProvider';

// Re-export Mistral provider and types
export { MistralProvider, type MistralModel } from './mistralProvider';

// Re-export GLM provider and types
export { GLMProvider, type GLMModel, GLM_GENERAL_ENDPOINT, GLM_CODING_ENDPOINT } from './glmProvider';

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
  XAI_CONFIG,
  MISTRAL_CONFIG,
  GLM_CONFIG,
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
    hasXAI: Boolean(settings.apiKeys.xai?.trim()),
    hasMistral: Boolean(settings.apiKeys.mistral?.trim()),
    hasGLM: Boolean(settings.apiKeys.glm?.trim()),
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
  const claudeSubscriptionToken = settings.claudeSubscription?.accessToken;
  const hasAnthropicAuth = Boolean(anthropicApiKey?.trim()) || Boolean(claudeSubscriptionToken);
  providers.set('anthropic', {
    provider: new AnthropicProvider(
      anthropicApiKey,
      anthropicSettings.baseUrl,
      anthropicSettings.model?.modelId,
      claudeSubscriptionToken
    ),
    hasApiKey: hasAnthropicAuth,
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
  
  // xAI (Grok)
  const xaiSettings = getSettings('xai');
  const xaiApiKey = settings.apiKeys.xai;
  providers.set('xai', {
    provider: new XAIProvider(
      xaiApiKey,
      xaiSettings.baseUrl || 'https://api.x.ai/v1',
      xaiSettings.model?.modelId
    ),
    hasApiKey: Boolean(xaiApiKey?.trim()),
    enabled: xaiSettings.enabled,
    priority: xaiSettings.priority,
  });
  
  // Mistral
  const mistralSettings = getSettings('mistral');
  const mistralApiKey = settings.apiKeys.mistral;
  providers.set('mistral', {
    provider: new MistralProvider(
      mistralApiKey,
      mistralSettings.baseUrl || 'https://api.mistral.ai/v1',
      mistralSettings.model?.modelId
    ),
    hasApiKey: Boolean(mistralApiKey?.trim()),
    enabled: mistralSettings.enabled,
    priority: mistralSettings.priority,
  });
  
  // GLM (Z.AI)
  const glmSettings = getSettings('glm');
  const glmSubscription = settings.glmSubscription;
  // Use subscription API key if available, otherwise fall back to regular API key
  const glmApiKey = glmSubscription?.apiKey || settings.apiKeys.glm;
  // Use coding endpoint if subscription is configured to use it
  const glmBaseUrl = glmSubscription?.useCodingEndpoint 
    ? GLM_CODING_ENDPOINT
    : (glmSettings.baseUrl || GLM_GENERAL_ENDPOINT);
  providers.set('glm', {
    provider: new GLMProvider(
      glmApiKey,
      glmBaseUrl,
      glmSettings.model?.modelId,
      true // enableThinking
    ),
    hasApiKey: Boolean(glmApiKey?.trim()),
    enabled: glmSettings.enabled,
    priority: glmSettings.priority,
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
