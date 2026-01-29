/**
 * Mistral AI Model Definitions
 * 
 * Models are fetched dynamically via the Mistral API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://docs.mistral.ai/getting-started/models/models_overview/
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for Mistral when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const MISTRAL_DEFAULT_MODEL = 'mistral-large-latest';

/**
 * Fallback models for Mistral when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const MISTRAL_MODELS: ModelInfo[] = [];
