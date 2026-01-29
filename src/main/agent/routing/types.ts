/**
 * Model Routing Types
 * 
 * Type definitions for intelligent model selection based on task analysis.
 * Uses the shared RoutingDecision type for compatibility.
 */

import type { RoutingDecision } from '../../../shared/types';

// Re-export RoutingDecision from shared types
export type { RoutingDecision };

/** Task types that can be detected from user queries */
export type TaskType = 
  | 'coding'
  | 'reasoning' 
  | 'analysis'
  | 'creative'
  | 'vision'
  | 'image-generation'
  | 'general';

/** Required model capabilities based on task analysis */
export interface RequiredCapabilities {
  /** Requires tool/function calling support */
  tools?: boolean;
  /** Requires vision/image input support */
  vision?: boolean;
  /** Requires image generation output support */
  imageGeneration?: boolean;
  /** Requires thinking/reasoning mode support */
  thinking?: boolean;
  /** Requires audio input support */
  audioInput?: boolean;
  /** Requires large context window */
  largeContext?: boolean;
}

/** Result of analyzing a user query */
export interface TaskAnalysis {
  /** Detected task type */
  taskType: TaskType;
  /** Estimated complexity */
  complexity: 'low' | 'medium' | 'high';
  /** Estimated token count */
  estimatedTokens: number;
  /** Required model capabilities */
  requiredCapabilities: RequiredCapabilities;
  /** Confidence in the analysis (0-1) */
  confidence: number;
}