/**
 * Z.AI GLM Model Definitions
 * 
 * Models are fetched dynamically via the Z.AI API.
 * This file provides fallback defaults when API is unavailable.
 * 
 * @see https://docs.z.ai
 */

import type { ModelInfo } from '../types';

export const GLM_DEFAULT_MODEL = 'glm-4.7';

export const GLM_MODELS: ModelInfo[] = [
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.6,
    outputCostPer1M: 2.2,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsThinking: true,
    tier: 'flagship',
    description: 'Latest GLM flagship model with thinking mode',
    isDefault: true,
  },
  {
    id: 'glm-4.6',
    name: 'GLM-4.6',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.4,
    outputCostPer1M: 1.6,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsThinking: true,
    tier: 'balanced',
    description: 'GLM-4.6 with thinking mode support',
  },
  {
    id: 'glm-4.5',
    name: 'GLM-4.5',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.3,
    outputCostPer1M: 1.2,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsThinking: false,
    tier: 'balanced',
    description: 'GLM-4.5 balanced model',
  },
  {
    id: 'glm-4-32b-0414-128k',
    name: 'GLM-4-32B-128K',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.8,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsThinking: false,
    tier: 'fast',
    description: 'GLM-4 32B with 128K context',
  },
  {
    id: 'glm-4.6v',
    name: 'GLM-4.6V',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.5,
    outputCostPer1M: 2.0,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsThinking: false,
    tier: 'flagship',
    description: 'GLM-4.6 Vision model',
  },
  {
    id: 'glm-4.5v',
    name: 'GLM-4.5V',
    provider: 'glm',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.4,
    outputCostPer1M: 1.6,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsThinking: false,
    tier: 'balanced',
    description: 'GLM-4.5 Vision model',
  },
];
