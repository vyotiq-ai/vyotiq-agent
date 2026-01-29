/**
 * OpenAI Model Definitions
 * 
 * Models are fetched dynamically via the OpenAI API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://platform.openai.com/docs/api-reference/models/list
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for OpenAI when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o';

/**
 * Fallback models for OpenAI when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const OPENAI_MODELS: ModelInfo[] = [];