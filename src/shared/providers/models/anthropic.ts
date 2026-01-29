/**
 * Anthropic (Claude) Model Definitions
 * 
 * Models are fetched dynamically via the Anthropic API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://docs.anthropic.com/en/api/models-list
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for Anthropic when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Fallback models for Anthropic when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const ANTHROPIC_MODELS: ModelInfo[] = [];
