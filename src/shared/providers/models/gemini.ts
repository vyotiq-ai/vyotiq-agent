/**
 * Google Gemini Model Definitions
 * 
 * Models are fetched dynamically via the Gemini API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://ai.google.dev/api/models#method:-models.list
 */

import type { ModelInfo } from '../types';

/**
 * Default model ID for Gemini when no models are fetched yet.
 * This is used as a fallback before the API returns available models.
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Fallback models for Gemini when API is unavailable.
 * These are minimal definitions - full model info comes from API.
 */
export const GEMINI_MODELS: ModelInfo[] = [];
