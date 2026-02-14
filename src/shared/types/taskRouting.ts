/**
 * Task-Based Model Routing Types
 *
 * Types for task detection, model routing configuration,
 * and routing decisions. Enables routing different task types
 * to different AI provider/model combinations.
 *
 * @module types/taskRouting
 */

/**
 * LLM Provider name (mirrors canonical definition in types.ts)
 * Duplicated here to avoid circular dependency with parent module.
 */
type LLMProviderName = 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'openrouter' | 'xai' | 'mistral' | 'glm';

// =============================================================================
// Task-Based Model Routing Types
// =============================================================================

/**
 * Task types that the agent can detect and route to different models.
 * Each task type can be configured to use a specific provider/model combination.
 */
export type RoutingTaskType =
  | 'frontend'       // React, Vue, CSS, HTML, UI components
  | 'backend'        // Node.js, APIs, databases, server logic
  | 'debugging'      // Bug fixing, error analysis
  | 'analysis'       // Code review, refactoring suggestions
  | 'planning'       // Architecture, system design, planning
  | 'documentation'  // READMEs, comments, docs
  | 'testing'        // Test writing, test analysis
  | 'devops'         // CI/CD, Docker, deployment
  | 'general';       // Default fallback

/**
 * Human-readable info for each task type
 */
export const ROUTING_TASK_INFO: Record<RoutingTaskType, { name: string; description: string; icon: string; keywords: string[] }> = {
  frontend: {
    name: 'Frontend Development',
    description: 'React, Vue, CSS, HTML, UI components, styling',
    icon: 'Layout',
    keywords: ['react', 'vue', 'angular', 'css', 'html', 'component', 'ui', 'ux', 'tailwind', 'style', 'dom', 'browser', 'responsive', 'animation'],
  },
  backend: {
    name: 'Backend Development',
    description: 'Node.js, APIs, databases, server logic, authentication',
    icon: 'Server',
    keywords: ['api', 'database', 'server', 'node', 'express', 'fastify', 'mongodb', 'postgres', 'sql', 'rest', 'graphql', 'auth', 'middleware', 'endpoint'],
  },
  debugging: {
    name: 'Debugging',
    description: 'Bug fixing, error analysis, troubleshooting',
    icon: 'Bug',
    keywords: ['bug', 'error', 'fix', 'crash', 'issue', 'debug', 'broken', 'fail', 'exception', 'stack', 'trace', 'undefined', 'null', 'TypeError'],
  },
  analysis: {
    name: 'Code Analysis',
    description: 'Code review, refactoring, optimization suggestions',
    icon: 'Search',
    keywords: ['review', 'analyze', 'refactor', 'optimize', 'improve', 'performance', 'clean', 'smell', 'pattern', 'best practice', 'audit'],
  },
  planning: {
    name: 'Planning & Architecture',
    description: 'System design, architecture decisions, project planning',
    icon: 'Map',
    keywords: ['design', 'architect', 'plan', 'structure', 'organize', 'strategy', 'roadmap', 'diagram', 'flow', 'system', 'scale', 'microservice'],
  },
  documentation: {
    name: 'Documentation',
    description: 'READMEs, comments, API docs, guides',
    icon: 'FileText',
    keywords: ['document', 'readme', 'comment', 'jsdoc', 'describe', 'explain', 'guide', 'tutorial', 'api doc', 'changelog'],
  },
  testing: {
    name: 'Testing',
    description: 'Unit tests, integration tests, test analysis',
    icon: 'TestTube',
    keywords: ['test', 'jest', 'vitest', 'mocha', 'spec', 'unit', 'integration', 'e2e', 'coverage', 'mock', 'assert', 'expect'],
  },
  devops: {
    name: 'DevOps & Deployment',
    description: 'CI/CD, Docker, deployment, infrastructure',
    icon: 'Cloud',
    keywords: ['deploy', 'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'github actions', 'aws', 'azure', 'vercel', 'nginx', 'container'],
  },
  general: {
    name: 'General',
    description: 'Default for unclassified tasks',
    icon: 'MessageSquare',
    keywords: [],
  },
};

/**
 * Configuration for a single task-to-model mapping
 */
export interface TaskModelMapping {
  /** The task type this mapping applies to */
  taskType: RoutingTaskType;
  /** Provider to use for this task ('auto' uses the default provider selection) */
  provider: LLMProviderName | 'auto';
  /** Specific model ID to use (optional - uses provider default if not set) */
  modelId?: string;
  /** Whether this mapping is enabled */
  enabled: boolean;
  /** Custom temperature for this task type (optional) */
  temperature?: number;
  /** Custom max tokens for this task type (optional) */
  maxOutputTokens?: number;
  /** Priority when multiple mappings could apply (lower = higher priority) */
  priority: number;
  /** Fallback provider if primary is unavailable */
  fallbackProvider?: LLMProviderName;
  /** Fallback model if primary model fails */
  fallbackModelId?: string;
  /** Custom label for display in UI (for custom tasks) */
  label?: string;
  /** Description for this mapping */
  description?: string;
  /** Color for UI display (hex color or CSS variable) */
  color?: string;
}

/**
 * Custom user-defined task type for routing
 */
export interface CustomTaskType {
  /** Unique identifier for this custom task */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this task handles */
  description: string;
  /** Icon name (from lucide-react) */
  icon: string;
  /** Keywords that trigger this task detection */
  keywords: string[];
  /** File patterns that indicate this task (glob-like) */
  filePatterns?: string[];
  /** Context patterns to match in user messages */
  contextPatterns?: string[];
  /** Priority relative to built-in tasks (lower = higher priority) */
  priority: number;
  /** Whether this custom task is active */
  enabled: boolean;
}

/**
 * Complete task-based routing configuration
 */
export interface TaskRoutingSettings {
  /** Enable task-based model routing */
  enabled: boolean;
  /** Default mapping when no specific task is detected */
  defaultMapping: TaskModelMapping;
  /** Task-specific mappings */
  taskMappings: TaskModelMapping[];
  /** Custom user-defined task types */
  customTaskTypes?: CustomTaskType[];
  /** Show routing decisions in the UI (for transparency) */
  showRoutingDecisions: boolean;
  /** Show routing badge on assistant messages */
  showRoutingBadge: boolean;
  /** Allow agent to override routing in complex scenarios */
  allowAgentOverride: boolean;
  /** Minimum confidence required to apply task-specific routing (0-1) */
  confidenceThreshold: number;
  /** Enable logging of routing decisions for debugging */
  logRoutingDecisions: boolean;
  /** Use conversation context for better task detection */
  useConversationContext: boolean;
  /** Number of recent messages to consider for context (1-20) */
  contextWindowSize: number;
  /** Enable fallback to default when routed provider fails */
  enableFallback: boolean;
}

/**
 * Default task routing settings
 */
export const DEFAULT_TASK_ROUTING_SETTINGS: TaskRoutingSettings = {
  enabled: false,
  defaultMapping: {
    taskType: 'general',
    provider: 'auto',
    enabled: true,
    priority: 100,
  },
  taskMappings: [
    { taskType: 'frontend', provider: 'auto', enabled: false, priority: 1, label: 'Frontend Development', description: 'React, Vue, CSS, HTML, UI components' },
    { taskType: 'backend', provider: 'auto', enabled: false, priority: 2, label: 'Backend Development', description: 'Node.js, APIs, databases' },
    { taskType: 'debugging', provider: 'auto', enabled: false, priority: 3, label: 'Debugging', description: 'Bug fixing, error analysis' },
    { taskType: 'analysis', provider: 'auto', enabled: false, priority: 4, label: 'Code Analysis', description: 'Code review, optimization' },
    { taskType: 'planning', provider: 'auto', enabled: false, priority: 5, label: 'Planning', description: 'Architecture, design' },
    { taskType: 'documentation', provider: 'auto', enabled: false, priority: 6, label: 'Documentation', description: 'READMEs, docs' },
    { taskType: 'testing', provider: 'auto', enabled: false, priority: 7, label: 'Testing', description: 'Tests, assertions' },
    { taskType: 'devops', provider: 'auto', enabled: false, priority: 8, label: 'DevOps', description: 'CI/CD, Docker' },
  ],
  customTaskTypes: [],
  showRoutingDecisions: true,
  showRoutingBadge: true,
  allowAgentOverride: true,
  confidenceThreshold: 0.6,
  logRoutingDecisions: false,
  useConversationContext: true,
  contextWindowSize: 10,
  enableFallback: true,
};

/**
 * Result of task detection
 */
export interface TaskDetectionResult {
  /** Detected task type (built-in or custom) */
  taskType: RoutingTaskType | string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Signals that triggered this detection */
  signals: string[];
  /** Alternative task types considered */
  alternatives?: Array<{ taskType: RoutingTaskType | string; confidence: number }>;
  /** Whether this is a custom task type */
  isCustomTask?: boolean;
}

/**
 * Routing decision made by the task router
 */
export interface RoutingDecision {
  /** Detected task type (built-in or custom) */
  detectedTaskType: RoutingTaskType | string;
  /** Confidence of detection */
  confidence: number;
  /** Selected provider */
  selectedProvider: LLMProviderName;
  /** Selected model ID */
  selectedModel: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether the default was used (no matching task mapping) */
  usedDefault: boolean;
  /** The mapping that was applied */
  appliedMapping?: TaskModelMapping;
  /** Signals that triggered the task detection */
  signals?: string[];
  /** Alternative task types that were considered */
  alternatives?: Array<{ taskType: RoutingTaskType | string; confidence: number }>;
  /** Whether fallback was used due to primary provider failure */
  usedFallback?: boolean;
  /** Original provider before fallback (if fallback was used) */
  originalProvider?: LLMProviderName;
  /** Whether this was a custom task type */
  isCustomTask?: boolean;
}
