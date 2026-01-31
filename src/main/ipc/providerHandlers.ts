/**
 * Provider IPC Handlers
 * 
 * Unified IPC handlers for all LLM providers.
 * Handles model fetching for OpenRouter, Anthropic, OpenAI, DeepSeek, Gemini, and Mistral.
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

export function registerProviderHandlers(context: IpcContext): void {
  const { getSettingsStore } = context;

  // ===========================================================================
  // OpenRouter
  // ===========================================================================

  ipcMain.handle('openrouter:fetch-models', async (): Promise<{ success: boolean; models: OpenRouterModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.openrouter;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No OpenRouter API key configured' };
      }

      const provider = new OpenRouterProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched OpenRouter models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenRouter models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // Anthropic
  // ===========================================================================

  ipcMain.handle('anthropic:fetch-models', async (): Promise<{ success: boolean; models: AnthropicModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.anthropic;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No Anthropic API key configured' };
      }

      const provider = new AnthropicProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched Anthropic models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Anthropic models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // OpenAI
  // ===========================================================================

  ipcMain.handle('openai:fetch-models', async (): Promise<{ success: boolean; models: OpenAIModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.openai;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No OpenAI API key configured' };
      }

      const provider = new OpenAIProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched OpenAI models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenAI models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // DeepSeek
  // ===========================================================================

  ipcMain.handle('deepseek:fetch-models', async (): Promise<{ success: boolean; models: DeepSeekModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.deepseek;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No DeepSeek API key configured' };
      }

      const provider = new DeepSeekProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched DeepSeek models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch DeepSeek models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // Gemini
  // ===========================================================================

  ipcMain.handle('gemini:fetch-models', async (): Promise<{ success: boolean; models: GeminiModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.gemini;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No Gemini API key configured' };
      }

      const provider = new GeminiProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched Gemini models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Gemini models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // Mistral
  // ===========================================================================

  ipcMain.handle('mistral:fetch-models', async (): Promise<{ success: boolean; models: MistralModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.mistral;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No Mistral API key configured' };
      }

      const provider = new MistralProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched Mistral models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Mistral models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  // ===========================================================================
  // xAI (Grok)
  // ===========================================================================

  ipcMain.handle('xai:fetch-models', async (): Promise<{ success: boolean; models: XAIModel[]; error?: string }> => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys?.xai;
      
      if (!apiKey) {
        return { success: false, models: [], error: 'No xAI API key configured' };
      }

      const provider = new XAIProvider(apiKey);
      const models = await provider.fetchModels();
      
      logger.debug('Fetched xAI models', { count: models.length });
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch xAI models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, models: [], error: error instanceof Error ? error.message : 'Failed to fetch models' };
    }
  });

  logger.info('Provider IPC handlers registered');
}
