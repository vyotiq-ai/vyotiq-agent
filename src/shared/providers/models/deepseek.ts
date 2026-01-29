/**
 * DeepSeek Model Definitions
 * 
 * Models are fetched dynamically via the DeepSeek API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://api-docs.deepseek.com/api/list-models
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for DeepSeek when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/**
 * Fallback models for DeepSeek when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const DEEPSEEK_MODELS: ModelInfo[] = [];