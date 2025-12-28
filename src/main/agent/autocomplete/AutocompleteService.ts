/**
 * Autocomplete Service
 * 
 * Provides AI-powered inline autocomplete suggestions for the chat input.
 * Uses the configured LLM providers to generate sentence/word completions.
 * 
 * Features:
 * - Uses only configured providers (with valid API keys)
 * - Prefers fast models for low latency
 * - Caches recent suggestions
 * - Supports request cancellation
 * - Respects provider cooldown state (e.g., quota/billing errors)
 */

import type { LLMProviderName, AutocompleteRequest, AutocompleteResponse, AutocompleteSettings } from '../../../shared/types';
import { DEFAULT_AUTOCOMPLETE_SETTINGS } from '../../../shared/types';
import type { ProviderMap } from '../providers';
import { PROVIDER_CONFIGS } from '../providers/registry';
import type { Logger } from '../../logger';
import { AutocompleteCache } from './cache';
import type { SelectedProvider } from './types';

/**
 * Models preferred for autocomplete (fast, low-latency)
 * Ordered by preference within each provider
 */
const FAST_MODELS: Partial<Record<LLMProviderName, string[]>> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-haiku-20240307'],
  deepseek: ['deepseek-chat'],
  // OpenRouter: prefer free models for autocomplete to avoid credit issues
  openrouter: [
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-exp-1206:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'mistralai/mistral-small-24b-instruct-2501:free',
  ],
};

/**
 * Provider priority for autocomplete (fastest first)
 * Includes all supported providers to ensure fallback works correctly
 */
const PROVIDER_PRIORITY: LLMProviderName[] = ['gemini', 'openai', 'deepseek', 'anthropic', 'openrouter'];

interface AutocompleteServiceDeps {
  getProviders: () => ProviderMap;
  getSettings: () => AutocompleteSettings | undefined;
  logger: Logger;
  /** Optional function to check if a provider is in cooldown (e.g., quota/billing errors) */
  isProviderInCooldown?: (provider: LLMProviderName) => boolean;
}

export class AutocompleteService {
  private readonly getProviders: () => ProviderMap;
  private readonly getSettings: () => AutocompleteSettings | undefined;
  private readonly logger: Logger;
  private readonly cache: AutocompleteCache;
  private readonly isProviderInCooldown: (provider: LLMProviderName) => boolean;
  private pendingController: AbortController | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: AutocompleteServiceDeps) {
    this.getProviders = deps.getProviders;
    this.getSettings = deps.getSettings;
    this.logger = deps.logger;
    this.cache = new AutocompleteCache(100, 60000);
    // Default to no cooldown check if not provided
    this.isProviderInCooldown = deps.isProviderInCooldown ?? (() => false);

    // Periodic cache cleanup
    this.cleanupInterval = setInterval(() => {
      this.cache.cleanup();
    }, 30000);
  }

  /**
   * Get the current settings with defaults
   */
  private get settings(): AutocompleteSettings {
    return this.getSettings() ?? DEFAULT_AUTOCOMPLETE_SETTINGS;
  }

  /**
   * Check if autocomplete is enabled
   */
  isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Select the best available provider for autocomplete
   * Prioritizes fast models from configured providers
   * Skips providers that are in cooldown (e.g., quota/billing errors)
   */
  private selectProvider(): SelectedProvider | null {
    const providers = this.getProviders();
    const settings = this.settings;

    // If user specified a preferred provider, try that first
    if (settings.preferredProvider !== 'auto') {
      const info = providers.get(settings.preferredProvider);
      // Check if provider is available AND not in cooldown
      if (info?.hasApiKey && info.enabled && !this.isProviderInCooldown(settings.preferredProvider)) {
        // Get the fastest model for this provider or fall back to configured model
        const fastModels = FAST_MODELS[settings.preferredProvider] ?? [];
        const providerModels = PROVIDER_CONFIGS[settings.preferredProvider]?.models ?? [];
        
        // For OpenRouter, use fast models directly (they're full model IDs)
        // For other providers, find first fast model that exists in provider's models
        let modelId: string | undefined;
        if (settings.preferredProvider === 'openrouter' && fastModels.length > 0) {
          modelId = fastModels[0]; // Use first free model for OpenRouter
        } else {
          modelId = fastModels.find(m => providerModels.some(pm => pm.id === m));
        }
        
        // Fall back to provider's configured model or default
        if (!modelId) {
          modelId = (info.provider as { defaultModel?: string }).defaultModel ?? 
                    PROVIDER_CONFIGS[settings.preferredProvider]?.defaultModel ?? 
                    providerModels[0]?.id;
        }

        if (modelId) {
          return { name: settings.preferredProvider, modelId };
        }
      } else if (this.isProviderInCooldown(settings.preferredProvider)) {
        this.logger.debug('Preferred provider is in cooldown, trying alternatives', {
          provider: settings.preferredProvider,
        });
      }
    }

    // Auto-select: try providers in priority order, skipping those in cooldown
    for (const providerName of PROVIDER_PRIORITY) {
      const info = providers.get(providerName);
      if (!info?.hasApiKey || !info.enabled) continue;
      
      // Skip providers in cooldown
      if (this.isProviderInCooldown(providerName)) {
        this.logger.debug('Skipping provider in cooldown for autocomplete', { provider: providerName });
        continue;
      }

      const fastModels = FAST_MODELS[providerName] ?? [];
      const providerModels = PROVIDER_CONFIGS[providerName]?.models ?? [];

      // For OpenRouter, use fast models directly (they're full model IDs)
      // For other providers, find first fast model that exists in provider's models
      let modelId: string | undefined;
      if (providerName === 'openrouter' && fastModels.length > 0) {
        modelId = fastModels[0]; // Use first free model for OpenRouter
      } else {
        modelId = fastModels.find(m => providerModels.some(pm => pm.id === m));
      }
      
      // Fall back to default model
      if (!modelId) {
        modelId = PROVIDER_CONFIGS[providerName]?.defaultModel ?? providerModels[0]?.id;
      }

      if (modelId) {
        return { name: providerName, modelId };
      }
    }

    return null;
  }

  /**
   * Build the prompt for autocomplete with context awareness
   */
  private buildPrompt(request: AutocompleteRequest): string {
    const textBeforeCursor = request.text.slice(0, request.cursorPosition);
    
    // Build context sections
    const contextParts: string[] = [];
    
    // Workspace context
    if (request.context?.workspaceName) {
      contextParts.push(`Workspace: ${request.context.workspaceName}`);
    }
    if (request.context?.projectType) {
      contextParts.push(`Project type: ${request.context.projectType}`);
    }
    if (request.context?.recentFiles && request.context.recentFiles.length > 0) {
      contextParts.push(`Recent files: ${request.context.recentFiles.slice(0, 5).join(', ')}`);
    }
    if (request.context?.sessionTopic) {
      contextParts.push(`Topic: ${request.context.sessionTopic}`);
    }
    
    // Build context from recent messages if available
    if (request.recentMessages && request.recentMessages.length > 0) {
      const recentContext = request.recentMessages
        .slice(-3) // Last 3 messages
        .map(m => `${m.role}: ${m.content.slice(0, 150)}...`)
        .join('\n');
      contextParts.push(`Recent conversation:\n${recentContext}`);
    }
    
    const contextStr = contextParts.length > 0 
      ? `Context:\n${contextParts.join('\n')}\n\n` 
      : '';

    return `Complete the user's message naturally and concisely.
Output ONLY the completion text, nothing else. Do not repeat what was already typed.
If you cannot provide a good completion, respond with an empty string.

${contextStr}The user is typing a message to an AI coding assistant.
Current input: "${textBeforeCursor}"

Continue this naturally (output only the continuation):`;
  }

  /**
   * Request an autocomplete suggestion
   */
  async getSuggestion(request: AutocompleteRequest): Promise<AutocompleteResponse> {
    const startTime = Date.now();

    if (!this.settings.enabled) {
      return { suggestion: null, error: 'Autocomplete is disabled' };
    }

    // Cancel any pending request
    this.cancelPending();

    const textBeforeCursor = request.text.slice(0, request.cursorPosition);

    // Check minimum length
    if (textBeforeCursor.trim().length < this.settings.minChars) {
      return { suggestion: null };
    }

    // Check cache first
    const cached = this.cache.get(textBeforeCursor);
    if (cached) {
      this.logger.debug('Autocomplete cache hit', { text: textBeforeCursor.slice(-30) });
      return {
        suggestion: cached.suggestion,
        provider: cached.provider,
        modelId: cached.modelId,
        latencyMs: Date.now() - startTime,
        cached: true,
      };
    }

    // Check for extended match (user continued typing and suggestion still applies)
    const extendedMatch = this.cache.getExtendedMatch(textBeforeCursor);
    if (extendedMatch && extendedMatch.remainingSuggestion.length > 0) {
      this.logger.debug('Autocomplete extended cache hit', { 
        remaining: extendedMatch.remainingSuggestion.slice(0, 30) 
      });
      return {
        suggestion: extendedMatch.remainingSuggestion,
        provider: extendedMatch.entry.provider,
        modelId: extendedMatch.entry.modelId,
        latencyMs: Date.now() - startTime,
        cached: true,
      };
    }

    // Select provider
    const selected = this.selectProvider();
    if (!selected) {
      this.logger.warn('No available provider for autocomplete - check that at least one provider has an API key configured');
      return { suggestion: null, error: 'No provider available. Please configure at least one LLM provider with an API key in Settings.' };
    }

    // Get the provider instance
    const providers = this.getProviders();
    const providerInfo = providers.get(selected.name);
    if (!providerInfo) {
      return { suggestion: null, error: 'Provider not found' };
    }

    // Create abort controller for this request
    this.pendingController = new AbortController();
    const signal = this.pendingController.signal;

    try {
      const prompt = this.buildPrompt(request);

      this.logger.debug('Requesting autocomplete', {
        provider: selected.name,
        model: selected.modelId,
        textLength: textBeforeCursor.length,
      });

      // Make a simple non-streaming request using the generate method
      const response = await providerInfo.provider.generate({
        systemPrompt: 'You are an autocomplete assistant. Complete the user\'s text naturally and concisely. Output ONLY the completion text, nothing else.',
        messages: [
          { role: 'user', content: prompt },
        ],
        tools: [],
        config: {
          model: selected.modelId,
          temperature: this.settings.temperature,
          maxOutputTokens: this.settings.maxTokens,
        },
        signal,
      });

      // Check if aborted
      if (signal.aborted) {
        return { suggestion: null };
      }

      // Extract suggestion from response
      let suggestion = response.content?.trim() ?? '';

      // Clean up the suggestion
      // Remove quotes if the model wrapped it
      if ((suggestion.startsWith('"') && suggestion.endsWith('"')) ||
          (suggestion.startsWith("'") && suggestion.endsWith("'"))) {
        suggestion = suggestion.slice(1, -1);
      }

      // Don't return empty or very short suggestions
      if (suggestion.length < 2) {
        return { suggestion: null };
      }

      // Cache the result
      this.cache.set(textBeforeCursor, {
        suggestion,
        provider: selected.name,
        modelId: selected.modelId,
      });

      const latencyMs = Date.now() - startTime;
      this.logger.debug('Autocomplete completed', {
        provider: selected.name,
        suggestionLength: suggestion.length,
        latencyMs,
      });

      return {
        suggestion,
        provider: selected.name,
        modelId: selected.modelId,
        latencyMs,
        cached: false,
      };
    } catch (error) {
      // Don't log aborted requests as errors
      if (signal.aborted) {
        return { suggestion: null };
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Autocomplete error', { error: message });
      
      return { suggestion: null, error: message };
    } finally {
      this.pendingController = null;
    }
  }

  /**
   * Cancel any pending autocomplete request
   */
  cancelPending(): void {
    if (this.pendingController) {
      this.pendingController.abort();
      this.pendingController = null;
    }
  }

  /**
   * Clear the suggestion cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.cancelPending();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Singleton instance
let instance: AutocompleteService | null = null;

/**
 * Get the autocomplete service instance
 */
export function getAutocompleteService(): AutocompleteService | null {
  return instance;
}

/**
 * Initialize the autocomplete service
 */
export function initAutocompleteService(deps: AutocompleteServiceDeps): AutocompleteService {
  if (instance) {
    instance.dispose();
  }
  instance = new AutocompleteService(deps);
  
  // Log initialization status
  const providers = deps.getProviders();
  const availableProviders = Array.from(providers.entries())
    .filter(([, info]) => info.hasApiKey && info.enabled)
    .map(([name]) => name);
  
  deps.logger.info('AutocompleteService initialized', {
    totalProviders: providers.size,
    availableProviders,
    settings: deps.getSettings(),
  });
  
  if (availableProviders.length === 0) {
    deps.logger.warn('AutocompleteService: No providers available - autocomplete will not work until at least one provider is configured with an API key');
  }
  
  return instance;
}
