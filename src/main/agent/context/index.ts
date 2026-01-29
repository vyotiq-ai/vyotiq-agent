/**
 * Context Management Module
 * 
 * Provides context window management for LLM providers.
 * Prevents context overflow errors by intelligently pruning messages.
 */

export { 
  ContextWindowManager, 
  createContextWindowManager,
  PROVIDER_CONTEXT_CONFIGS,
  type ContextWindowConfig,
  type ContextMetrics,
  type PruningResult,
} from './ContextWindowManager';

export {
  ConversationSummarizer,
  createConversationSummarizer,
  type SummaryConfig,
  type SummaryResult,
  type CompressedToolResult,
} from './ConversationSummarizer';

// Tool context management for dynamic tool selection
export {
  selectToolsForContext,
  detectWorkspaceType,
  clearWorkspaceTypeCache,
  extractRecentToolUsage,
  getToolSelectionSummary,
  // Session tool state management (agent-controlled)
  getSessionToolState,
  addAgentRequestedTools,
  addDiscoveredTools,
  getAgentControlledTools,
  clearSessionToolState,
  clearAllSessionToolStates,
  // Error tracking for error-aware tool selection
  recordToolError,
  recordToolSuccess,
  getRecentToolErrors,
  type ToolSelectionContext,
  type WorkspaceType,
  type TaskIntent,
  type SessionToolState,
} from './ToolContextManager';
