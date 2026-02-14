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

export { useAgentStatus } from './useAgentStatus';

// =============================================================================
// Optimized Agent State Selectors
// =============================================================================

export {
  // Session selectors
  useActiveSessionId,
  useActiveSession,
  useSessionIds,
  useSessionCount,
  useSession,
  // Message selectors
  useActiveSessionMessages,
  useSessionMessages,
  useActiveSessionMessageCount,
  useLastMessage,
  // Status selectors
  useActiveSessionStatus,
  useIsActiveSessionRunning,
  useIsActiveSessionIdle,
  // Agent status selectors
  useActiveSessionAgentStatus,
  // Context selectors
  useActiveSessionContextMetrics,
  useContextUsagePercentage,
  // Todo selectors
  useActiveSessionTodos,
  useActiveSessionTodoItems,
  useTodoCompletionPercentage,
  // Streaming selectors
  useIsActiveSessionStreaming,
  // Config selectors
  useActiveSessionConfig,
  // Combined hooks
  useActiveSessionInfo,
} from './useAgentSelectors';

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

export { useAppearanceSettings, applyAppearanceSettings } from './useAppearanceSettings';

// =============================================================================
// UI Utility Hooks
// =============================================================================

export { useClickOutside } from './useClickOutside';
export { useDebounce, useThrottle, useDebouncedValue } from './useDebounce';
export { useKeyboard, useHotkey, useEscapeKey, formatShortcut, isMac } from './useKeyboard';
export { useLocalStorage, useSessionStorage } from './useLocalStorage';


// =============================================================================
// Data Hooks
// =============================================================================

export { useSessionList } from '../features/sessions/hooks/useSessionList';
export { useStreamingBuffer } from './useStreamingBuffer';
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

export {
  useThrottleControl,
  useAdaptiveThrottle,
  useAdaptiveRafThrottle,
  type ThrottleControlState,
} from './useThrottleControl';

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
// Tool Queue Hooks
// =============================================================================

export {
  useQueuedTools,
  useAllQueuedTools,
  useQueuedToolsCount,
  useHasQueuedTools,
  useNextQueuedTool,
} from './useQueuedTools';

// =============================================================================
// Onboarding Hooks
// =============================================================================

export { useFirstRun } from './useFirstRun';

// =============================================================================
// Todo Hooks
// =============================================================================

export { useTodos } from './useTodos';

// =============================================================================
// MCP (Model Context Protocol) Hooks
// =============================================================================

export {
  useMCP,
  useMCPSettings,
  useMCPServers,
  useMCPTools,
  useMCPStore,
  type UseMCPResult,
  type UseMCPSettingsResult,
  type UseMCPServersResult,
  type UseMCPToolsResult,
  type UseMCPStoreResult,
} from './useMCP';

// =============================================================================
// Form and Data Hooks
// =============================================================================

export {
  useAsync,
  useAsyncCallback,
  type AsyncState,
  type UseAsyncOptions,
  type UseAsyncResult,
  type UseAsyncCallbackResult,
} from './useAsync';

export {
  usePagination,
  getVisiblePages,
  type PaginationState,
  type UsePaginationOptions,
  type UsePaginationResult,
  type PaginationControlsProps,
} from './usePagination';

export {
  useFormValidation,
  validators,
  type ValidationRule,
  type FieldConfig,
  type FieldState,
  type UseFormValidationResult,
} from './useFormValidation';

// =============================================================================
// UI Utility Hooks
// =============================================================================

export {
  useResizablePanel,
  useResizeObserver,
  type ResizeDirection,
  type ResizablePanelOptions,
  type ResizablePanelResult,
  type UseResizeObserverOptions,
} from './useResizablePanel';

// =============================================================================
// Loading State Hooks
// =============================================================================

export {
  useLoading,
  useLoadingOperation,
} from '../state/LoadingProvider';

// =============================================================================
// Rust Backend Hooks
// =============================================================================

export {
  useRustBackendConnection,
  useRustBackendEvents,
  useRustSearch,
  useRustGrep,
  useRustWorkspaces,
  useIndexProgress,
  useRustFileWatcher,
  useRustIndexStatus,
  useUnifiedWorkspace,
} from './useRustBackend';
