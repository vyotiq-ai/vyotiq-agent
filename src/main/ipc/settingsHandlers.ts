/**
 * Settings IPC Handlers
 * 
 * Handles all settings-related IPC operations including:
 * - Settings get/update
 * - Cache management
 * - Debug configuration
 * - Provider model fetching
 */

import { ipcMain } from 'electron';
import { getCacheManager } from '../agent/cache/CacheManager';
import { getToolResultCache } from '../agent/cache/ToolResultCache';
import { getContextCache } from '../agent/cache/ContextCache';
import { createLogger } from '../logger';
import type { UpdateSettingsPayload } from '../../shared/types';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Settings');

export function registerSettingsHandlers(context: IpcContext): void {
  const { getSettingsStore, getOrchestrator, emitToRenderer } = context;

  // ==========================================================================
  // Settings Management
  // ==========================================================================

  ipcMain.handle('settings:get', () => getSettingsStore().get());

  ipcMain.handle('settings:update', async (_event, payload: UpdateSettingsPayload) => {
    const updated = await getSettingsStore().update(payload.settings ?? {});
    getOrchestrator()?.refreshProviders();

    // Apply cache settings to cache managers
    if (updated.cacheSettings) {
      const toolCache = getToolResultCache();
      const contextCache = getContextCache();

      if (updated.cacheSettings.toolCache) {
        toolCache.updateConfig({
          maxAge: updated.cacheSettings.toolCache.defaultTtlMs,
          maxSize: updated.cacheSettings.toolCache.maxEntries,
          enableLRU: updated.cacheSettings.enableLruEviction,
        });
      }

      if (updated.cacheSettings.contextCache) {
        contextCache.setConfig({
          maxSizeBytes: updated.cacheSettings.contextCache.maxSizeMb * 1024 * 1024,
          defaultTTL: updated.cacheSettings.contextCache.defaultTtlMs,
          enableTTL: updated.cacheSettings.contextCache.enabled,
        });
      }
    }

    // Apply debug settings
    if (updated.debugSettings) {
      const orchestrator = getOrchestrator();
      if (orchestrator) {
        orchestrator.updateDebugConfig({
          verbose: updated.debugSettings.verboseLogging,
          captureFullPayloads: updated.debugSettings.captureFullPayloads,
          stepMode: updated.debugSettings.stepByStepMode,
          exportOnError: updated.debugSettings.autoExportOnError,
          exportFormat: updated.debugSettings.traceExportFormat,
        });
        orchestrator.setDebugEnabled(updated.debugSettings.verboseLogging);
      }
    }

    emitToRenderer({ type: 'settings-update', settings: updated });
    return updated;
  });

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  ipcMain.handle('cache:get-stats', async () => {
    const promptCache = getCacheManager();
    const toolCache = getToolResultCache();
    const contextCache = getContextCache();

    const promptStats = promptCache.getSummary();
    const toolStats = toolCache.getStats();
    const contextStats = contextCache.getStats();

    return {
      prompt: {
        totalHits: promptStats.totalHits,
        totalMisses: promptStats.totalMisses,
        hitRate: promptStats.overallHitRate,
        tokensSaved: promptStats.totalTokensSaved,
        costSaved: promptStats.totalCostSaved,
        creations: promptStats.totalCreations,
        byProvider: promptCache.getAllStats(),
      },
      toolResult: {
        size: toolStats.size,
        maxSize: toolStats.maxSize,
        hits: toolStats.hits,
        misses: toolStats.misses,
        hitRate: toolStats.hitRate,
        byTool: toolStats.byTool,
      },
      context: {
        entries: contextStats.entries,
        sizeBytes: contextStats.sizeBytes,
        hits: contextStats.hits,
        misses: contextStats.misses,
        hitRate: contextStats.hitRate,
        evictions: contextStats.evictions,
        expirations: contextStats.expirations,
      },
    };
  });

  ipcMain.handle('cache:clear', async (_event, cacheType?: 'prompt' | 'tool' | 'context' | 'all') => {
    const type = cacheType ?? 'all';
    const promptCache = getCacheManager();
    const toolCache = getToolResultCache();
    const contextCache = getContextCache();

    const cleared: string[] = [];

    if (type === 'prompt' || type === 'all') {
      promptCache.resetStats();
      cleared.push('prompt');
    }

    if (type === 'tool' || type === 'all') {
      toolCache.invalidateAll();
      toolCache.resetStats();
      cleared.push('tool');
    }

    if (type === 'context' || type === 'all') {
      contextCache.clear();
      contextCache.resetStats();
      cleared.push('context');
    }

    return { success: true, cleared };
  });

  ipcMain.handle('cache:update-tool-config', async (_event, config: { maxAge?: number; maxSize?: number }) => {
    const toolCache = getToolResultCache();
    toolCache.updateConfig(config);
    return { success: true };
  });

  ipcMain.handle('cache:cleanup-tool-results', async () => {
    const toolCache = getToolResultCache();
    const removed = toolCache.cleanup();
    return { success: true, removed };
  });

  ipcMain.handle('cache:invalidate-path', async (_event, path: string) => {
    const toolCache = getToolResultCache();
    const invalidated = toolCache.invalidatePath(path);
    return { success: true, invalidated };
  });

  // ==========================================================================
  // Provider Model Fetching
  // ==========================================================================

  ipcMain.handle('openrouter:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.openrouter;
      
      if (!apiKey) {
        return { success: false, error: 'OpenRouter API key not configured', models: [] };
      }
      
      const { OpenRouterProvider } = await import('../agent/providers/openrouterProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const provider = new OpenRouterProvider(apiKey);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'openrouter'));
      setCachedModels('openrouter', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenRouter models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  ipcMain.handle('anthropic:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.anthropic;
      
      if (!apiKey) {
        return { success: false, error: 'Anthropic API key not configured', models: [] };
      }
      
      const { AnthropicProvider } = await import('../agent/providers/anthropicProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const provider = new AnthropicProvider(apiKey);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'anthropic'));
      setCachedModels('anthropic', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Anthropic models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  ipcMain.handle('openai:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.openai;
      
      if (!apiKey) {
        return { success: false, error: 'OpenAI API key not configured', models: [] };
      }
      
      const { OpenAIProvider } = await import('../agent/providers/openAIProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const provider = new OpenAIProvider(apiKey);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'openai'));
      setCachedModels('openai', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenAI models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  ipcMain.handle('deepseek:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.deepseek;
      
      if (!apiKey) {
        return { success: false, error: 'DeepSeek API key not configured', models: [] };
      }
      
      const { DeepSeekProvider } = await import('../agent/providers/deepseekProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const provider = new DeepSeekProvider(apiKey);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'deepseek'));
      setCachedModels('deepseek', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch DeepSeek models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  ipcMain.handle('gemini:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.gemini;
      
      if (!apiKey) {
        return { success: false, error: 'Gemini API key not configured', models: [] };
      }
      
      const { GeminiProvider } = await import('../agent/providers/geminiProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const provider = new GeminiProvider(apiKey);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'gemini'));
      setCachedModels('gemini', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Gemini models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  ipcMain.handle('glm:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.glmSubscription?.apiKey || settings.apiKeys.glm;
      
      if (!apiKey) {
        return { success: false, error: 'GLM API key not configured', models: [] };
      }
      
      const { GLMProvider, GLM_CODING_ENDPOINT, GLM_GENERAL_ENDPOINT } = await import('../agent/providers/glmProvider');
      const { normalizeApiModel, setCachedModels } = await import('../agent/providers/modelCache');
      const baseUrl = settings.glmSubscription?.useCodingEndpoint ? GLM_CODING_ENDPOINT : GLM_GENERAL_ENDPOINT;
      const provider = new GLMProvider(apiKey, baseUrl);
      const models = await provider.fetchModels();
      
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'glm'));
      setCachedModels('glm', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch GLM models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // GLM Subscription
  // ==========================================================================

  ipcMain.handle('glm:connect', async (_event, params: { apiKey: string; tier: 'lite' | 'pro'; useCodingEndpoint: boolean }) => {
    try {
      const { apiKey, tier, useCodingEndpoint } = params;
      const { GLM_CODING_ENDPOINT, GLM_GENERAL_ENDPOINT } = await import('../agent/providers/glmProvider');
      const baseUrl = useCodingEndpoint ? GLM_CODING_ENDPOINT : GLM_GENERAL_ENDPOINT;
      
      const testResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en',
        },
        body: JSON.stringify({
          model: 'glm-4.7',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        let errorMessage = 'Invalid API key or connection failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          if (errorText.length < 200) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }
      
      const subscription = {
        apiKey,
        tier,
        useCodingEndpoint,
        connectedAt: Date.now(),
      };
      
      await getSettingsStore().update({ glmSubscription: subscription });
      
      emitToRenderer({
        type: 'glm-subscription',
        eventType: 'connected',
        message: `GLM Coding Plan connected (${tier})`,
        tier,
        subscription,
      });
      
      logger.info('GLM subscription connected', { tier, useCodingEndpoint });
      return { success: true };
    } catch (error) {
      logger.error('Failed to connect GLM subscription', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Invalid API key or connection failed' };
    }
  });

  ipcMain.handle('glm:disconnect', async () => {
    try {
      await getSettingsStore().update({ glmSubscription: undefined });
      
      emitToRenderer({
        type: 'glm-subscription',
        eventType: 'disconnected',
        message: 'GLM Coding Plan disconnected',
      });
      
      logger.info('GLM subscription disconnected');
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect GLM subscription', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('glm:get-subscription-status', async () => {
    const settings = getSettingsStore().get();
    const subscription = settings.glmSubscription;
    
    if (!subscription) {
      return { connected: false, useCodingEndpoint: true };
    }
    
    return {
      connected: true,
      tier: subscription.tier,
      useCodingEndpoint: subscription.useCodingEndpoint,
    };
  });

  ipcMain.handle('glm:update-settings', async (_event, updates: { useCodingEndpoint?: boolean }) => {
    try {
      const settings = getSettingsStore().get();
      const subscription = settings.glmSubscription;
      
      if (!subscription) {
        return { success: false, error: 'No GLM subscription connected' };
      }
      
      const updatedSubscription = {
        ...subscription,
        ...(updates.useCodingEndpoint !== undefined && { useCodingEndpoint: updates.useCodingEndpoint }),
      };
      
      await getSettingsStore().update({ glmSubscription: updatedSubscription });
      
      logger.info('GLM subscription settings updated', { updates });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update GLM subscription settings', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
