/**
 * Model Routing System
 * 
 * Provides intelligent model selection based on user query analysis.
 * Uses dynamically fetched model capabilities from provider APIs.
 */

import type { LLMProviderName, RoutingDecision } from '../../../shared/types';
import type { ModelInfo } from '../../../shared/providers/types';
import { getCachedModels } from '../providers/modelCache';
import type { 
  TaskAnalysis, 
  TaskType,
  RequiredCapabilities 
} from './types';

export * from './types';

// =============================================================================
// Core routing functions
// =============================================================================

/**
 * Analyze user message to detect task type and required capabilities
 */
export function analyzeUserQuery(userMessage: string): TaskAnalysis {
  const message = userMessage.toLowerCase();
  
  let taskType: TaskType = 'general';
  let complexity: 'low' | 'medium' | 'high' = 'medium';
  const requiredCapabilities: RequiredCapabilities = {};
  
  // Image generation detection
  if (
    message.includes('generate image') ||
    message.includes('create image') ||
    message.includes('draw') ||
    message.includes('make a picture') ||
    message.includes('create a picture') ||
    message.includes('generate a picture') ||
    message.includes('image of') ||
    message.includes('picture of') ||
    message.includes('illustration of') ||
    message.includes('artwork') ||
    message.includes('visualize') ||
    message.includes('render image')
  ) {
    taskType = 'image-generation';
    requiredCapabilities.imageGeneration = true;
  }
  // Vision/image analysis detection
  else if (
    message.includes('analyze this image') ||
    message.includes('what is in this image') ||
    message.includes('describe this image') ||
    message.includes('look at this') ||
    message.includes('what do you see') ||
    message.includes('analyze the screenshot') ||
    message.includes('read this image')
  ) {
    taskType = 'vision';
    requiredCapabilities.vision = true;
  }
  // Reasoning/thinking detection
  else if (
    message.includes('think through') ||
    message.includes('reason about') ||
    message.includes('step by step') ||
    message.includes('explain your reasoning') ||
    message.includes('complex problem') ||
    message.includes('mathematical proof') ||
    message.includes('logic puzzle') ||
    message.includes('deep analysis')
  ) {
    taskType = 'reasoning';
    requiredCapabilities.thinking = true;
    complexity = 'high';
  }
  // Coding detection
  else if (
    message.includes('code') ||
    message.includes('function') ||
    message.includes('bug') ||
    message.includes('implement') ||
    message.includes('refactor') ||
    message.includes('debug') ||
    message.includes('typescript') ||
    message.includes('javascript') ||
    message.includes('python') ||
    message.includes('programming') ||
    message.includes('algorithm')
  ) {
    taskType = 'coding';
    requiredCapabilities.tools = true;
  }
  // Analysis detection
  else if (
    message.includes('analyze') ||
    message.includes('explain') ||
    message.includes('understand') ||
    message.includes('review') ||
    message.includes('evaluate')
  ) {
    taskType = 'analysis';
    requiredCapabilities.tools = true;
  }
  // Creative detection
  else if (
    message.includes('create') ||
    message.includes('design') ||
    message.includes('write a story') ||
    message.includes('compose') ||
    message.includes('brainstorm')
  ) {
    taskType = 'creative';
  }
  
  // Estimate complexity based on message length and keywords
  if (message.length > 500 || message.includes('complex') || message.includes('advanced') || message.includes('detailed')) {
    complexity = 'high';
  } else if (message.length < 100 || message.includes('simple') || message.includes('quick') || message.includes('brief')) {
    complexity = 'low';
  }

  const estimatedTokens = Math.ceil(message.length / 4);

  return {
    taskType,
    complexity,
    estimatedTokens,
    requiredCapabilities,
    confidence: taskType === 'general' ? 0.5 : 0.8,
  };
}

/**
 * Score a model based on how well it matches the required capabilities
 */
function scoreModel(model: ModelInfo, requirements: RequiredCapabilities, taskType: TaskType): number {
  let score = 0;
  
  // Must-have requirements (return -1 if not met)
  if (requirements.imageGeneration && !model.supportsImageGeneration) {
    return -1;
  }
  if (requirements.vision && !model.supportsVision) {
    return -1;
  }
  if (requirements.tools && !model.supportsTools) {
    return -1;
  }
  
  // Bonus points for matching capabilities
  if (requirements.thinking && model.supportsThinking) {
    score += 30;
  }
  if (requirements.vision && model.supportsVision) {
    score += 20;
  }
  if (requirements.imageGeneration && model.supportsImageGeneration) {
    score += 50; // High priority for image generation
  }
  if (requirements.tools && model.supportsTools) {
    score += 15;
  }
  
  // Tier-based scoring
  switch (model.tier) {
    case 'flagship':
      score += taskType === 'reasoning' ? 25 : 15;
      break;
    case 'balanced':
      score += 20; // Good default choice
      break;
    case 'fast':
      score += taskType === 'general' ? 25 : 10;
      break;
    case 'legacy':
      score += 5;
      break;
  }
  
  // Context window bonus for complex tasks
  if (model.contextWindow >= 128000) {
    score += 10;
  }
  
  // Default model bonus
  if (model.isDefault) {
    score += 5;
  }
  
  return score;
}

/**
 * Select the best model from available cached models based on task analysis
 */
export function selectBestModel(
  taskAnalysis: TaskAnalysis,
  availableProviders: LLMProviderName[]
): RoutingDecision | null {
  const { taskType, requiredCapabilities, confidence } = taskAnalysis;
  
  // Get all cached models from available providers
  const candidateModels: ModelInfo[] = [];
  for (const provider of availableProviders) {
    const models = getCachedModels(provider);
    if (models) {
      // Filter to chat-capable models only
      const chatModels = models.filter(m => m.supportsMultiturnChat !== false);
      candidateModels.push(...chatModels);
    }
  }
  
  if (candidateModels.length === 0) {
    return null;
  }
  
  // Score all models
  const scoredModels = candidateModels
    .map(model => ({
      model,
      score: scoreModel(model, requiredCapabilities, taskType),
    }))
    .filter(({ score }) => score >= 0) // Remove models that don't meet requirements
    .sort((a, b) => b.score - a.score);
  
  if (scoredModels.length === 0) {
    // No model meets requirements, return first available as fallback
    const fallback = candidateModels[0];
    return {
      detectedTaskType: taskType,
      confidence: 0.3,
      selectedProvider: fallback.provider,
      selectedModel: fallback.id,
      reason: `No model fully matches requirements for ${taskType}, using ${fallback.name} as fallback`,
      usedDefault: true,
    };
  }
  
  const best = scoredModels[0];
  return {
    detectedTaskType: taskType,
    confidence: Math.min(0.95, confidence + (best.score / 200)),
    selectedProvider: best.model.provider,
    selectedModel: best.model.id,
    reason: `Selected ${best.model.name} (${best.model.provider}) for ${taskType} task based on capabilities`,
    usedDefault: false,
  };
}

/**
 * Check if any available provider supports the required capabilities
 */
export function hasCapableProvider(
  requiredCapabilities: RequiredCapabilities,
  availableProviders: LLMProviderName[]
): boolean {
  for (const provider of availableProviders) {
    const models = getCachedModels(provider);
    if (!models) continue;
    
    for (const model of models) {
      if (requiredCapabilities.imageGeneration && !model.supportsImageGeneration) continue;
      if (requiredCapabilities.vision && !model.supportsVision) continue;
      if (requiredCapabilities.tools && !model.supportsTools) continue;
      if (requiredCapabilities.thinking && !model.supportsThinking) continue;
      return true;
    }
  }
  return false;
}