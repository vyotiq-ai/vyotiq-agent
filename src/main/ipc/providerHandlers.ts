/**
 * Provider IPC Handlers
 * 
 * Unified IPC handlers for all LLM providers.
 * Handles model fetching for OpenRouter, Anthropic, OpenAI, DeepSeek, Gemini, Mistral, and xAI.
 * 
 * @module main/ipc/providerHandlers
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

// Import provider classes and model types
import { OpenRouterProvider, type OpenRouterModel } from '../agent/providers/openrouterProvider';
import { AnthropicProvider, type AnthropicModel } from '../agent/providers/anthropicProvider';
import { OpenAIProvider, type OpenAIModel } from '../agent/providers/openAIProvider';
import { DeepSeekProvider, type DeepSeekModel } from '../agent/providers/deepseekProvider';
import { GeminiProvider, type GeminiModel } from '../agent/providers/geminiProvider';
import { MistralProvider, type MistralModel } from '../agent/providers/mistralProvider';
import { XAIProvider, type XAIModel } from '../agent/providers/xaiProvider';

const logger = createLogger('IPC:Providers');

// =============================================================================
// Generic provider model fetcher to eliminate duplication
// =============================================================================

interface ProviderConfig<TModel> {
  /** IPC channel name */
  channel: string;
  /** Settings key for the API key */
  apiKeyField: string;
  /** Human-readable provider name */
  providerName: string;
  /** Factory to create the provider instance */
  createProvider: (apiKey: string) => { fetchModels: () => Promise<TModel[]> };
}

function registerProviderModelFetcher<TModel>(
  config: ProviderConfig<TModel>,
  getSettingsStore: IpcContext['getSettingsStore'],
): void {
  ipcMain.handle(config.channel, async (): Promise<{ success: boolean; models: TModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = (settings.apiKeys as Record<string, string | undefined>)?.[config.apiKeyField];

      if (!apiKey) {
        return { success: false, models: [], error: `No ${config.providerName} API key configured` };
      }

      const provider = config.createProvider(apiKey);
      const models = await provider.fetchModels();

      logger.debug(`Fetched ${config.providerName} models`, { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error(`Failed to fetch ${config.providerName} models`, { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });
}

// =============================================================================
// Registration
// =============================================================================

export function registerProviderHandlers(context: IpcContext): void {
  const { getSettingsStore } = context;

  const providers: ProviderConfig<OpenRouterModel | AnthropicModel | OpenAIModel | DeepSeekModel | GeminiModel | MistralModel | XAIModel>[] = [
    {
      channel: 'openrouter:fetch-models',
      apiKeyField: 'openrouter',
      providerName: 'OpenRouter',
      createProvider: (key) => new OpenRouterProvider(key),
    },
    {
      channel: 'anthropic:fetch-models',
      apiKeyField: 'anthropic',
      providerName: 'Anthropic',
      createProvider: (key) => new AnthropicProvider(key),
    },
    {
      channel: 'openai:fetch-models',
      apiKeyField: 'openai',
      providerName: 'OpenAI',
      createProvider: (key) => new OpenAIProvider(key),
    },
    {
      channel: 'deepseek:fetch-models',
      apiKeyField: 'deepseek',
      providerName: 'DeepSeek',
      createProvider: (key) => new DeepSeekProvider(key),
    },
    {
      channel: 'gemini:fetch-models',
      apiKeyField: 'gemini',
      providerName: 'Gemini',
      createProvider: (key) => new GeminiProvider(key),
    },
    {
      channel: 'mistral:fetch-models',
      apiKeyField: 'mistral',
      providerName: 'Mistral',
      createProvider: (key) => new MistralProvider(key),
    },
    {
      channel: 'xai:fetch-models',
      apiKeyField: 'xai',
      providerName: 'xAI',
      createProvider: (key) => new XAIProvider(key),
    },
  ];

  for (const config of providers) {
    registerProviderModelFetcher(config, getSettingsStore);
  }

  logger.info('Provider IPC handlers registered');
}
