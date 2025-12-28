/**
 * Model Routing System - Minimal Implementation
 * Provides basic functionality to satisfy existing code dependencies
 */

import type { 
  ModelConfig, 
  TaskAnalysis, 
  RoutingDecision, 
  TaskType,
  ModelCapabilities 
} from './types';

export * from './types';

// Default model configurations
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    capabilities: {
      reasoning: 0.95,
      coding: 0.90,
      analysis: 0.85,
      creativity: 0.80,
      speed: 0.75,
    },
    contextWindow: 200000,
    costPerToken: 0.000003,
  },
  'gpt-4': {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    capabilities: {
      reasoning: 0.90,
      coding: 0.85,
      analysis: 0.90,
      creativity: 0.85,
      speed: 0.70,
    },
    contextWindow: 128000,
    costPerToken: 0.00003,
  },
};

export class ModelRouter {
  private models: Record<string, ModelConfig>;

  constructor(models: Record<string, ModelConfig> = MODEL_CONFIGS) {
    this.models = models;
  }

  analyzeTask(userMessage: string): TaskAnalysis {
    // Simple heuristic-based task analysis
    const message = userMessage.toLowerCase();
    
    let taskType: TaskType = 'general';
    let complexity: 'low' | 'medium' | 'high' = 'medium';
    
    // Basic keyword detection
    if (message.includes('code') || message.includes('function') || message.includes('bug')) {
      taskType = 'coding';
    } else if (message.includes('analyze') || message.includes('explain') || message.includes('understand')) {
      taskType = 'analysis';
    } else if (message.includes('create') || message.includes('design') || message.includes('generate')) {
      taskType = 'creative';
    } else if (message.includes('solve') || message.includes('logic') || message.includes('problem')) {
      taskType = 'reasoning';
    }

    // Estimate complexity based on message length and keywords
    if (message.length > 500 || message.includes('complex') || message.includes('advanced')) {
      complexity = 'high';
    } else if (message.length < 100 || message.includes('simple') || message.includes('quick')) {
      complexity = 'low';
    }

    const estimatedTokens = Math.ceil(message.length / 4); // Rough estimate

    return {
      intent: {
        type: taskType,
        confidence: 0.7, // Default confidence
      },
      complexity,
      estimatedTokens,
      requiredCapabilities: this.getRequiredCapabilities(taskType),
    };
  }

  selectModel(taskAnalysis: TaskAnalysis, availableProviders: string[]): RoutingDecision {
    // Simple model selection based on task type
    const { intent } = taskAnalysis;
    
    // Default to first available model
    const availableModels = Object.values(this.models).filter(
      model => availableProviders.includes(model.provider)
    );
    
    if (availableModels.length === 0) {
      throw new Error('No available models for routing');
    }

    // For now, just return the first available model
    const selectedModel = availableModels[0];
    
    return {
      selectedModel: selectedModel.id,
      selectedProvider: selectedModel.provider,
      confidence: 0.8,
      reasoning: `Selected ${selectedModel.name} for ${intent.type} task`,
      detectedTaskType: intent.type,
    };
  }

  private getRequiredCapabilities(taskType: TaskType): Partial<ModelCapabilities> {
    switch (taskType) {
      case 'coding':
        return { coding: 0.8, reasoning: 0.7 };
      case 'reasoning':
        return { reasoning: 0.9, analysis: 0.7 };
      case 'analysis':
        return { analysis: 0.8, reasoning: 0.6 };
      case 'creative':
        return { creativity: 0.8, reasoning: 0.6 };
      default:
        return { reasoning: 0.6, analysis: 0.6 };
    }
  }
}