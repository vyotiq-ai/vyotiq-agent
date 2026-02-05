/**
 * Agent Module
 * 
 * Centralized exports for the agent system including:
 * - Session management
 * - Run execution
 * - Model routing
 * - Providers
 * - Safety validation
 * - Debugging and tracing
 * - Cache management
 * - Metrics collection
 * - Context window management
 * - System prompt building
 */

// Core agent components
export { SessionManager } from './sessionManager';
export { RunExecutor } from './runExecutor';
export type { InternalSession, AgenticContext } from './types';

// System prompt building
export {
  buildSystemPrompt,
  buildCoreContext,
  buildCoreTools,
  buildTerminalContext,
  buildPersonaSection,
  buildCustomPromptSection,
  buildCommunicationStyle,
  /** @deprecated Use AGENTS.md instead */
  buildAdditionalInstructions,
  buildInjectedContext,
  evaluateContextInjectionCondition,
  processContextRuleTemplate,
  buildTaskAnalysisContext,
  buildWorkspaceStructureContext,
  CORE_IDENTITY,
  CRITICAL_RULES,
  TOOL_CHAINING,
  DEFAULT_PROMPT_SETTINGS,
} from './systemPrompt';
export type { 
  SystemPromptContext, 
  ToolDefForPrompt, 
  TerminalContextInfo, 
  TerminalProcessInfo,
  TaskAnalysisContext,
  WorkspaceStructureContext,
} from './systemPrompt';

// Session storage - persistent storage system
export { SessionStorage } from './storage';
export type { SessionStorageConfig } from './storage';

// Storage system
export {
  StorageManager,
  getStorageManager,
  resetStorageManager,
  DynamicToolStorage,
  getDynamicToolStorage,
  BackupManager,
  getBackupManager,
  MigrationManager,
  getMigrationManager,
  CacheStorage,
  getCacheStorage,
} from './storage';
export { 
  ContextWindowManager, 
  createContextWindowManager,
  PROVIDER_CONTEXT_CONFIGS,
  ConversationSummarizer,
  createConversationSummarizer,
} from './context';
export type { 
  ContextWindowConfig, 
  ContextMetrics, 
  PruningResult,
  SummaryConfig,
  SummaryResult,
  CompressedToolResult,
} from './context';

// Model routing - explicit exports
export { ModelRouter, MODEL_CONFIGS, analyzeUserQuery, selectBestModel, selectBestProvider, hasCapableProvider } from './routing';
export type { 
  ModelCapabilities, 
  ModelConfig, 
  TaskAnalysis as RoutingTaskAnalysis, 
  TaskType, 
  RoutingDecision,
  RequiredCapabilities,
} from './routing';

// Safety module - validation and protection
export { SafetyManager } from './safety';
export type {
  SafetyConfig,
  SafetyCheckResult,
  SafetyIssue,
  SafetyOperation,
  BackupInfo,
} from './safety';

// Debugging module - tracing and analysis
export { AgentDebugger } from './debugging';
export type {
  DebugConfig,
  AgentTrace,
  AgentStep,
  TraceMetrics,
  BreakpointCondition,
  TraceExportOptions,
} from './debugging';

// Cache module - response and tool result caching
export {
  CacheManager,
  getCacheManager,
  DEFAULT_CACHE_CONFIG,
  AGGRESSIVE_CACHE_CONFIG,
  CONSERVATIVE_CACHE_CONFIG,
  shouldCache,
  createCacheControl,
} from './cache';
export type {
  CacheStats,
  ProviderCacheStats,
  CacheConfig,
  CacheControl,
} from './cache';

// Compliance module - runtime rule enforcement and prompt optimization
export {
  ComplianceValidator,
  PromptOptimizer,
  DEFAULT_COMPLIANCE_CONFIG,
  MODEL_PROMPT_CONFIGS,
  CORRECTIVE_MESSAGES,
} from './compliance';
export type {
  ComplianceConfig,
  ComplianceCheckResult,
  ComplianceViolation,
  ComplianceViolationType,
  ComplianceRunState,
  ModelPromptConfig,
  OptimizedPromptResult,
} from './compliance';

// Providers
export { buildProviderMap } from './providers';
export type { LLMProvider, ProviderRequest, ProviderMessage } from './providers/baseProvider';

// Phase 2: Security module - rate limiting, auditing, anomaly detection
export {
  RateLimiter,
  getRateLimiter,
  SecurityAuditLog,
  getSecurityAuditLog,
  AnomalyDetector,
  getAnomalyDetector,
} from './security';

// Phase 4: Resource Allocation
export {
  ResourceAllocator,
  getResourceAllocator,
  initResourceAllocator,
  resetResourceAllocator,
  ResourceMonitor,
  getResourceMonitor,
  initResourceMonitor,
  resetResourceMonitor,
} from './resources';

// Phase 5: Recovery
export {
  initRecovery,
  getRecoveryManager,
  getSelfHealingAgent,
  getUserCommunication,
  startSelfHealing,
  stopSelfHealing,
  recoverFromError,
  resetRecovery,
  isRecoveryInitialized,
  getRecoveryStats,
  RecoveryManager,
  SelfHealingAgent,
  UserCommunication,
  ErrorClassifier,
  DiagnosticEngine,
  ALL_STRATEGIES,
  RetryExecutor,
  FallbackExecutor,
  RollbackExecutor,
  ScaleDownExecutor,
  EscalateExecutor,
} from './recovery';

// Phase 5: Performance
export {
  initPerformance,
  getPerformanceMonitor,
  getCachingLayer,
  getLazyLoader,
  getResourceManager,
  resetPerformance,
  isPerformanceInitialized,
  getPerformanceStats,
  timeOperation,
  hasResources,
  tryConsumeTokens,
  tryConsumeApiCall,
  cacheLLMResponse,
  getCachedLLMResponse,
  PerformanceMonitor,
  CachingLayer,
  BatchProcessor,
  createAPIBatchProcessor,
  createFileBatchProcessor,
  LazyLoader,
  ResourceManager,
} from './performance';

// Streaming types - re-export from shared types
export type { ProgressGroup, ProgressItem } from '../../shared/types';

// Loop Detection - prevents infinite loops in agent execution
export {
  LoopDetector,
  getLoopDetector,
  initLoopDetector,
  DEFAULT_LOOP_DETECTION_CONFIG,
} from './loopDetection';
export type {
  LoopDetectionConfig,
  LoopDetectionResult,
  LoopDetectionState,
  ToolCallPattern,
} from './loopDetection';

// Model Quality Tracking - scores model performance
export {
  ModelQualityTracker,
  getModelQualityTracker,
  initModelQualityTracker,
  DEFAULT_MODEL_QUALITY_CONFIG,
} from './modelQuality';
export type {
  ModelQualityMetrics,
  ModelQualityConfig,
  ModelPerformanceRecord,
} from './modelQuality';

// Session Health Monitoring - real-time session health tracking
export {
  SessionHealthMonitor,
  getSessionHealthMonitor,
  initSessionHealthMonitor,
  DEFAULT_SESSION_HEALTH_CONFIG,
} from './sessionHealth';
export type {
  SessionHealthStatus,
  SessionHealthIssue,
  SessionHealthConfig,
  WorkspaceHealthStatus,
} from './sessionHealth';
