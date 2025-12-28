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
  type ToolSelectionContext,
  type WorkspaceType,
  type TaskIntent,
} from './ToolContextManager';
