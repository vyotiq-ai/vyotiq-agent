/**
 * xAI (Grok) Model Definitions
 * 
 * Models are fetched dynamically via the xAI API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://docs.x.ai/docs/models
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for xAI when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const XAI_DEFAULT_MODEL = 'grok-3';

/**
 * Fallback models for xAI when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const XAI_MODELS: ModelInfo[] = [];
