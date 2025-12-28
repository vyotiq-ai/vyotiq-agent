/**
 * OpenRouter Model Filtering Utilities
 * 
 * Client-side filtering for OpenRouter models based on:
 * - Model ID/name search
 * - Context length range
 * - Input/output modalities
 * - Pricing range
 * - Model series (provider organization)
 * - Supported parameters
 * - Categories (text, multimodal, image, audio, video)
 * 
 * @see https://openrouter.ai/docs/models
 */

/** OpenRouter model from API with full schema */
export interface OpenRouterApiModel {
  id: string;
  name: string;
  created: number;
  description?: string;
  context_length: number;
  architecture: {
    modality?: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  supported_parameters?: string[];
}

/** Model category based on modalities */
export type ModelCategory = 'text' | 'multimodal' | 'image' | 'audio' | 'video';

/** Known model series/providers on OpenRouter */
export type ModelSeries = 
  | 'openai' | 'anthropic' | 'google' | 'meta-llama' | 'mistralai' 
  | 'cohere' | 'deepseek' | 'qwen' | 'microsoft' | 'nvidia'
  | 'perplexity' | 'x-ai' | 'amazon' | 'other';

/** Filter criteria for OpenRouter models */
export interface OpenRouterFilterCriteria {
  /** Search query for model ID or name */
  search?: string;
  /** Minimum context length */
  minContextLength?: number;
  /** Maximum context length */
  maxContextLength?: number;
  /** Required input modalities (e.g., ['text', 'image']) */
  inputModalities?: string[];
  /** Required output modalities (e.g., ['text']) */
  outputModalities?: string[];
  /** Maximum prompt price per million tokens */
  maxPromptPrice?: number;
  /** Maximum completion price per million tokens */
  maxCompletionPrice?: number;
  /** Model series/providers to include */
  series?: ModelSeries[];
  /** Model categories to include */
  categories?: ModelCategory[];
  /** Required supported parameters (e.g., ['tools', 'temperature']) */
  supportedParameters?: string[];
  /** Only show tool-capable models */
  toolsOnly?: boolean;
  /** Only show vision-capable models */
  visionOnly?: boolean;
  /** Only show free models */
  freeOnly?: boolean;
}

/**
 * Get the model series (provider) from model ID
 * e.g., 'openai/gpt-4o' -> 'openai'
 */
export function getModelSeries(modelId: string): ModelSeries {
  const provider = modelId.split('/')[0]?.toLowerCase() || '';
  
  const knownSeries: ModelSeries[] = [
    'openai', 'anthropic', 'google', 'meta-llama', 'mistralai',
    'cohere', 'deepseek', 'qwen', 'microsoft', 'nvidia',
    'perplexity', 'x-ai', 'amazon'
  ];
  
  if (knownSeries.includes(provider as ModelSeries)) {
    return provider as ModelSeries;
  }
  return 'other';
}

/**
 * Get the model category based on modalities
 */
export function getModelCategory(model: OpenRouterApiModel): ModelCategory {
  const inputMods = model.architecture?.input_modalities || [];
  const outputMods = model.architecture?.output_modalities || [];
  
  // Check output modalities first (specialized models)
  if (outputMods.includes('image')) return 'image';
  if (outputMods.includes('audio')) return 'audio';
  
  // Check input modalities
  const hasImage = inputMods.includes('image') || inputMods.includes('file');
  const hasAudio = inputMods.includes('audio');
  const hasVideo = inputMods.includes('video');
  
  if (hasVideo) return 'video';
  if (hasImage || hasAudio) return 'multimodal';
  
  return 'text';
}

/**
 * Check if model supports tool/function calling
 */
export function supportsTools(model: OpenRouterApiModel): boolean {
  const params = model.supported_parameters || [];
  return params.includes('tools') || params.includes('tool_choice');
}

/**
 * Check if model supports vision/image input
 */
export function supportsVision(model: OpenRouterApiModel): boolean {
  const inputMods = model.architecture?.input_modalities || [];
  return inputMods.includes('image') || inputMods.includes('file');
}

/**
 * Check if model is free (zero cost)
 */
export function isFreeModel(model: OpenRouterApiModel): boolean {
  const promptPrice = parseFloat(model.pricing?.prompt || '0');
  const completionPrice = parseFloat(model.pricing?.completion || '0');
  return promptPrice === 0 && completionPrice === 0;
}

/**
 * Get prompt price per million tokens
 */
export function getPromptPricePerMillion(model: OpenRouterApiModel): number {
  return parseFloat(model.pricing?.prompt || '0') * 1_000_000;
}

/**
 * Get completion price per million tokens
 */
export function getCompletionPricePerMillion(model: OpenRouterApiModel): number {
  return parseFloat(model.pricing?.completion || '0') * 1_000_000;
}

/**
 * Filter OpenRouter models based on criteria
 */
export function filterOpenRouterModels(
  models: OpenRouterApiModel[],
  criteria: OpenRouterFilterCriteria
): OpenRouterApiModel[] {
  return models.filter(model => {
    // Search filter (ID or name)
    if (criteria.search) {
      const query = criteria.search.toLowerCase();
      const matchesId = model.id.toLowerCase().includes(query);
      const matchesName = model.name.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }
    
    // Context length filters
    if (criteria.minContextLength && model.context_length < criteria.minContextLength) {
      return false;
    }
    if (criteria.maxContextLength && model.context_length > criteria.maxContextLength) {
      return false;
    }
    
    // Input modalities filter
    if (criteria.inputModalities && criteria.inputModalities.length > 0) {
      const modelInputMods = model.architecture?.input_modalities || [];
      const hasAllRequired = criteria.inputModalities.every(mod => modelInputMods.includes(mod));
      if (!hasAllRequired) return false;
    }
    
    // Output modalities filter
    if (criteria.outputModalities && criteria.outputModalities.length > 0) {
      const modelOutputMods = model.architecture?.output_modalities || [];
      const hasAllRequired = criteria.outputModalities.every(mod => modelOutputMods.includes(mod));
      if (!hasAllRequired) return false;
    }
    
    // Pricing filters
    if (criteria.maxPromptPrice !== undefined) {
      const price = getPromptPricePerMillion(model);
      if (price > criteria.maxPromptPrice) return false;
    }
    if (criteria.maxCompletionPrice !== undefined) {
      const price = getCompletionPricePerMillion(model);
      if (price > criteria.maxCompletionPrice) return false;
    }
    
    // Series filter
    if (criteria.series && criteria.series.length > 0) {
      const modelSeries = getModelSeries(model.id);
      if (!criteria.series.includes(modelSeries)) return false;
    }
    
    // Category filter
    if (criteria.categories && criteria.categories.length > 0) {
      const modelCategory = getModelCategory(model);
      if (!criteria.categories.includes(modelCategory)) return false;
    }
    
    // Supported parameters filter
    if (criteria.supportedParameters && criteria.supportedParameters.length > 0) {
      const modelParams = model.supported_parameters || [];
      const hasAllRequired = criteria.supportedParameters.every(param => modelParams.includes(param));
      if (!hasAllRequired) return false;
    }
    
    // Tools only filter
    if (criteria.toolsOnly && !supportsTools(model)) {
      return false;
    }
    
    // Vision only filter
    if (criteria.visionOnly && !supportsVision(model)) {
      return false;
    }
    
    // Free only filter
    if (criteria.freeOnly && !isFreeModel(model)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Sort OpenRouter models by various criteria
 */
export type SortField = 'name' | 'context_length' | 'prompt_price' | 'completion_price' | 'created';
export type SortOrder = 'asc' | 'desc';

export function sortOpenRouterModels(
  models: OpenRouterApiModel[],
  field: SortField,
  order: SortOrder = 'asc'
): OpenRouterApiModel[] {
  const sorted = [...models].sort((a, b) => {
    let comparison = 0;
    
    switch (field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'context_length':
        comparison = a.context_length - b.context_length;
        break;
      case 'prompt_price':
        comparison = getPromptPricePerMillion(a) - getPromptPricePerMillion(b);
        break;
      case 'completion_price':
        comparison = getCompletionPricePerMillion(a) - getCompletionPricePerMillion(b);
        break;
      case 'created':
        comparison = a.created - b.created;
        break;
    }
    
    return order === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
}

/**
 * Get unique values for filter options from models
 */
export function getFilterOptions(models: OpenRouterApiModel[]): {
  series: ModelSeries[];
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  contextLengthRange: { min: number; max: number };
  priceRange: { minPrompt: number; maxPrompt: number; minCompletion: number; maxCompletion: number };
} {
  const seriesSet = new Set<ModelSeries>();
  const inputModsSet = new Set<string>();
  const outputModsSet = new Set<string>();
  const paramsSet = new Set<string>();
  let minContext = Infinity, maxContext = 0;
  let minPrompt = Infinity, maxPrompt = 0;
  let minCompletion = Infinity, maxCompletion = 0;
  
  for (const model of models) {
    seriesSet.add(getModelSeries(model.id));
    
    (model.architecture?.input_modalities || []).forEach(m => inputModsSet.add(m));
    (model.architecture?.output_modalities || []).forEach(m => outputModsSet.add(m));
    (model.supported_parameters || []).forEach(p => paramsSet.add(p));
    
    minContext = Math.min(minContext, model.context_length);
    maxContext = Math.max(maxContext, model.context_length);
    
    const promptPrice = getPromptPricePerMillion(model);
    const completionPrice = getCompletionPricePerMillion(model);
    
    minPrompt = Math.min(minPrompt, promptPrice);
    maxPrompt = Math.max(maxPrompt, promptPrice);
    minCompletion = Math.min(minCompletion, completionPrice);
    maxCompletion = Math.max(maxCompletion, completionPrice);
  }
  
  return {
    series: Array.from(seriesSet).sort(),
    inputModalities: Array.from(inputModsSet).sort(),
    outputModalities: Array.from(outputModsSet).sort(),
    supportedParameters: Array.from(paramsSet).sort(),
    contextLengthRange: { min: minContext === Infinity ? 0 : minContext, max: maxContext },
    priceRange: {
      minPrompt: minPrompt === Infinity ? 0 : minPrompt,
      maxPrompt,
      minCompletion: minCompletion === Infinity ? 0 : minCompletion,
      maxCompletion,
    },
  };
}

/**
 * Group models by series/provider
 */
export function groupModelsBySeries(models: OpenRouterApiModel[]): Map<ModelSeries, OpenRouterApiModel[]> {
  const groups = new Map<ModelSeries, OpenRouterApiModel[]>();
  
  for (const model of models) {
    const series = getModelSeries(model.id);
    const existing = groups.get(series) || [];
    existing.push(model);
    groups.set(series, existing);
  }
  
  return groups;
}

/**
 * Group models by category
 */
export function groupModelsByCategory(models: OpenRouterApiModel[]): Map<ModelCategory, OpenRouterApiModel[]> {
  const groups = new Map<ModelCategory, OpenRouterApiModel[]>();
  
  for (const model of models) {
    const category = getModelCategory(model);
    const existing = groups.get(category) || [];
    existing.push(model);
    groups.set(category, existing);
  }
  
  return groups;
}
