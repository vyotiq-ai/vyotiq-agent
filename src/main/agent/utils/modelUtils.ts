
import type { LLMProviderName } from '../../../shared/types';
import { getProviderForModel } from '../../../shared/providers/models';

/**
 * Check if a model ID belongs to a specific provider
 */
export function modelBelongsToProvider(modelId: string, provider: LLMProviderName): boolean {
  const registryProvider = getProviderForModel(modelId);
  if (registryProvider) {
    return registryProvider === provider;
  }

  // Heuristic fallback for manually-entered model IDs not present in the registry.
  switch (provider) {
    case 'openai':
      return /^gpt-/.test(modelId) || /^o\d+/.test(modelId) || /^chatgpt-/.test(modelId) || /^text-/.test(modelId) || /^davinci/.test(modelId);
    case 'gemini':
      return /^gemini-/.test(modelId) || /^models\//.test(modelId);
    case 'anthropic':
      return /^claude-/.test(modelId) || /^anthropic\./.test(modelId);
    case 'deepseek':
      return /^deepseek-/.test(modelId);
    case 'openrouter':
      // OpenRouter models use format: provider/model-name (e.g., "deepseek/deepseek-r1-0528:free")
      // Any model with a "/" is likely an OpenRouter model ID
      return modelId.includes('/');
    default:
      return false;
  }
}

