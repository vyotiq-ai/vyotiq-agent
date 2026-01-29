/**
 * Hooks Index
 * 
 * Centralized exports for all React hooks.
 * Organized by category for easier navigation.
 * 
 * @module hooks
 */

// =============================================================================
// Core Hooks
// =============================================================================

export { useActiveWorkspace } from './useActiveWorkspace';
export { useAgentStatus } from './useAgentStatus';

// =============================================================================
// Chat Hooks
// =============================================================================

export { useChatInput } from '../features/chat/hooks/useChatInput';
export { useChatScroll } from './useChatScroll';

// Chat-specific composable hooks
export {
  useMessageState,
  useProviderSelection,
  useChatSubmit,
  useClipboardPaste,
  type MessageState,
  type ProviderSelectionState,
  type ChatSubmitState,
  type UseClipboardPasteOptions,
  type UseClipboardPasteReturn,
} from '../features/chat/hooks';

// =============================================================================
// Settings Hooks
// =============================================================================

export { useSettings } from './useSettings';

// =============================================================================
// UI Utility Hooks
// =============================================================================

export { useClickOutside } from './useClickOutside';
export { useDebounce, useThrottle } from './useDebounce';
export { useKeyboard, useHotkey, useEscapeKey, formatShortcut, isMac } from './useKeyboard';
export { useLocalStorage, useSessionStorage } from './useLocalStorage';


// =============================================================================
// Data Hooks
// =============================================================================

export { useSessionList } from '../features/sessions/hooks/useSessionList';
export { useStreamingBuffer } from './useStreamingBuffer';
export { useWorkspaceList } from './useWorkspaceList';
export { useAvailableProviders, type ProviderCooldownInfo } from './useAvailableProviders';

// =============================================================================
// Cost Hooks
// =============================================================================

export { useSessionCost, useMessageCost } from '../features/sessions/hooks/useSessionCost';

// =============================================================================
// Performance Hooks
// =============================================================================

export {
  useVirtualizedList,
  useVirtualItemMeasure,
  type VirtualizedListOptions,
  type VirtualizedListResult,
  type VirtualItem,
} from './useVirtualizedList';

// =============================================================================
// Search Hooks
// =============================================================================

export {
  useConversationSearch,
  type ConversationSearchResult,
  type MessageMatch,
  type UseConversationSearchOptions,
} from './useConversationSearch';

// =============================================================================
// Terminal Hooks
// =============================================================================

export {
  useTerminalStream,
  useAllTerminalStreams,
  useIsTerminalRunning,
  useTerminalOutput,
} from './useTerminalStream';

// =============================================================================
// Onboarding Hooks
// =============================================================================

export { useFirstRun } from './useFirstRun';

// =============================================================================
// Todo Hooks
// =============================================================================

export { useTodos } from './useTodos';

// =============================================================================
// Semantic Indexing Hooks
// =============================================================================

export {
  useSemanticIndex,
  type IndexingProgress,
  type IndexerStats,
  type SearchOptions,
  type SearchResult,
  type SemanticSearchResult,
  type UseSemanticIndexReturn,
} from './useSemanticIndex';

// =============================================================================
// MCP Hooks
// =============================================================================

export { useMCP } from './useMCP';
