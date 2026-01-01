/**
 * Chat Hooks Module
 * 
 * Composable hooks for chat functionality.
 */

export { useMessageState, type MessageState } from './useMessageState';
export { useProviderSelection, type ProviderSelectionState } from './useProviderSelection';
export { useChatSubmit, type ChatSubmitState } from './useChatSubmit';
export { useClipboardPaste, type UseClipboardPasteOptions, type UseClipboardPasteReturn } from './useClipboardPaste';
export { useMessageHistory, type UseMessageHistoryOptions, type UseMessageHistoryReturn } from './useMessageHistory';
export { 
  useMentions, 
  type UseMentionsOptions, 
  type UseMentionsReturn,
  type MentionItem,
  type MentionType,
  type ParsedMention,
  type ActiveMention,
} from './useMentions';
export { 
  useDraftMessage, 
  type UseDraftMessageOptions, 
  type UseDraftMessageReturn,
  type DraftStatus,
  type DraftData,
} from './useDraftMessage';
export {
  useWorkspaceFiles,
  type UseWorkspaceFilesOptions,
  type UseWorkspaceFilesReturn,
} from './useWorkspaceFiles';
