/**
 * Model Routing Types
 * Minimal implementation to satisfy existing code dependencies
 */

export interface ModelCapabilities {
  reasoning: number;
  coding: number;
  analysis: number;
  creativity: number;
  speed: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapabilities;
  contextWindow: number;
  costPerToken: number;
}

export type TaskType = 
  | 'coding'
  | 'reasoning' 
  | 'analysis'
  | 'creative'
  | 'general';

export interface TaskAnalysis {
  intent: {
    type: TaskType;
    confidence: number;
  };
  complexity: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  requiredCapabilities: Partial<ModelCapabilities>;
}

export interface RoutingDecision {
  selectedModel: string;
  selectedProvider: string;
  confidence: number;
  reasoning: string;
  detectedTaskType: TaskType;
}