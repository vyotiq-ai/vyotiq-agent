/**
 * Chat Input Hook (Refactored)
 * 
 * Primary hook for chat input functionality using composition pattern.
 * Composes smaller, focused hooks for better separation of concerns.
 * 
 * Benefits over the legacy hook:
 * - Each concern (messages, providers, submission) is isolated
 * - Easier to test individual pieces
 * - More reusable across different UI components
 * - Reduced cognitive load when debugging
 * 
 * Composed hooks:
 * - `useMessageState` - Message text, attachments, textarea ref
 * - `useProviderSelection` - AI provider and model selection
 * - `useChatSubmit` - Send message logic and validation
 * - `useMentions` - @ mention detection and autocomplete
 * - `useDraftMessage` - Draft auto-save and restore
 * - `useWorkspaceFiles` - Workspace file list for mentions
 * 
 * @example
 * ```tsx
 * const {
 *   message,
 *   setMessage,
 *   attachments,
 *   selectedProvider,
 *   selectedModelId,
 *   canSend,
 *   handleSendMessage,
 *   handleKeyDown,
 *   mentions,
 *   draft,
 * } = useChatInput();
 * ```
 */

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { useActiveWorkspace } from '../../../hooks/useActiveWorkspace';
import type { ChatMessage } from '../../../../shared/types';

// Import composable hooks
import { useMessageState } from './useMessageState';
import { useProviderSelection } from './useProviderSelection';
import { useChatSubmit } from './useChatSubmit';
import { useMessageHistory } from './useMessageHistory';
import { useMentions } from './useMentions';
import { useDraftMessage } from './useDraftMessage';
import { useWorkspaceFiles } from './useWorkspaceFiles';

/**
 * Refactored chat input hook using composition
 * 
 * Benefits:
 * - Each concern (messages, providers, submission) is isolated
 * - Easier to test individual pieces
 * - More reusable across different UI components
 * - Reduced cognitive load when debugging
 */
export const useChatInput = () => {
  const actions = useAgentActions();
  const activeWorkspace = useActiveWorkspace();

  const sessionSnapshot = useAgentSelector(
    (state) => {
      const activeSession = state.activeSessionId
        ? state.sessions.find((session) => session.id === state.activeSessionId)
        : undefined;

      const recentUserMessagesForHistory: ChatMessage[] = [];
      const messages = activeSession?.messages ?? [];
      for (let i = messages.length - 1; i >= 0 && recentUserMessagesForHistory.length < 50; i--) {
        const message = messages[i];
        if (!message) continue;
        if (message.role !== 'user') continue;
        if (!message.content || message.content.trim().length === 0) continue;
        recentUserMessagesForHistory.unshift(message);
      }

      const recentUserMessageContents = recentUserMessagesForHistory
        .slice(-10)
        .map((m) => m.content);

      let sessionTopic: string | undefined;
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (!message) continue;
        if (message.role !== 'user') continue;
        if (!message.content || message.content.trim().length === 0) continue;
        sessionTopic = message.content.slice(0, 100);
        break;
      }

      return {
        activeSessionId: state.activeSessionId,
        activeSessionStatus: activeSession?.status,
        activeSessionWorkspaceId: activeSession?.workspaceId,
        activeSessionConfig: {
          yoloMode: activeSession?.config?.yoloMode ?? false,
          preferredProvider: activeSession?.config?.preferredProvider ?? 'auto',
          selectedModelId: activeSession?.config?.selectedModelId,
          manualOverrideModel: activeSession?.config?.manualOverrideModel,
        },
        recentUserMessageContents,
        recentUserMessagesForHistory,
        sessionTopic,
      };
    },
    (a, b) => {
      if (a.activeSessionId !== b.activeSessionId) return false;
      if (a.activeSessionStatus !== b.activeSessionStatus) return false;
      if (a.activeSessionWorkspaceId !== b.activeSessionWorkspaceId) return false;
      if (a.activeSessionConfig.yoloMode !== b.activeSessionConfig.yoloMode) return false;
      if (a.activeSessionConfig.preferredProvider !== b.activeSessionConfig.preferredProvider) return false;
      if (a.activeSessionConfig.selectedModelId !== b.activeSessionConfig.selectedModelId) return false;
      if (a.activeSessionConfig.manualOverrideModel !== b.activeSessionConfig.manualOverrideModel) return false;
      if (a.recentUserMessageContents.length !== b.recentUserMessageContents.length) return false;
      for (let i = 0; i < a.recentUserMessageContents.length; i++) {
        if (a.recentUserMessageContents[i] !== b.recentUserMessageContents[i]) return false;
      }
      if (a.sessionTopic !== b.sessionTopic) return false;
      if (a.recentUserMessagesForHistory.length !== b.recentUserMessagesForHistory.length) return false;
      for (let i = 0; i < a.recentUserMessagesForHistory.length; i++) {
        const am = a.recentUserMessagesForHistory[i];
        const bm = b.recentUserMessagesForHistory[i];
        if (am?.id !== bm?.id) return false;
        if (am?.content !== bm?.content) return false;
      }
      return true;
    },
  );
  
  // Derived state
  const activeSession = useMemo(() => {
    if (!sessionSnapshot.activeSessionId) return undefined;
    return {
      id: sessionSnapshot.activeSessionId,
      status: sessionSnapshot.activeSessionStatus,
      workspaceId: sessionSnapshot.activeSessionWorkspaceId,
      config: {
        yoloMode: sessionSnapshot.activeSessionConfig.yoloMode,
        preferredProvider: sessionSnapshot.activeSessionConfig.preferredProvider,
        selectedModelId: sessionSnapshot.activeSessionConfig.selectedModelId,
        manualOverrideModel: sessionSnapshot.activeSessionConfig.manualOverrideModel,
      },
    };
  }, [
    sessionSnapshot.activeSessionId,
    sessionSnapshot.activeSessionStatus,
    sessionSnapshot.activeSessionWorkspaceId,
    sessionSnapshot.activeSessionConfig.yoloMode,
    sessionSnapshot.activeSessionConfig.preferredProvider,
    sessionSnapshot.activeSessionConfig.selectedModelId,
    sessionSnapshot.activeSessionConfig.manualOverrideModel,
  ]);

  const agentBusy = sessionSnapshot.activeSessionStatus === 'running' || sessionSnapshot.activeSessionStatus === 'awaiting-confirmation';
  
  // Check if session workspace matches active workspace
  const sessionWorkspaceValid = useMemo(() => {
    if (!activeWorkspace) return false;
    if (!activeSession) return true; // No session is valid - will create new one with correct workspace
    return activeSession.workspaceId === activeWorkspace.id;
  }, [activeSession, activeWorkspace]);

  // === Compose the focused hooks ===
  
  // Message state management
  const messageState = useMessageState();

  // Track cursor position for mentions
  const [cursorPosition, setCursorPosition] = useState(0);

  // Workspace files for @ mentions
  const workspaceFiles = useWorkspaceFiles({
    workspacePath: activeWorkspace?.path,
    autoLoad: true,
  });

  // @ Mentions system (file mentions only)
  const mentions = useMentions({
    message: messageState.message,
    cursorPosition,
    workspaceFiles: workspaceFiles.filesWithType,
    workspacePath: activeWorkspace?.path ?? undefined,
    enabled: true,
    isLoading: workspaceFiles.isLoading,
  });

  // Draft auto-save
  const draft = useDraftMessage({
    sessionId: activeSession?.id,
    workspaceId: activeWorkspace?.id,
    enabled: true,
  });

  // Track if draft was restored this session
  const draftRestoredRef = useRef(false);

  // Restore draft on mount or session change
  useEffect(() => {
    // Only restore if message is empty and we haven't restored yet
    if (messageState.message.length === 0 && !draftRestoredRef.current) {
      const savedDraft = draft.loadDraft();
      if (savedDraft && savedDraft.message) {
        messageState.setMessage(savedDraft.message);
        draftRestoredRef.current = true;
      }
    }
  }, [activeSession?.id, activeWorkspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset draft restored flag when session changes
  useEffect(() => {
    draftRestoredRef.current = false;
  }, [activeSession?.id]);

  // Auto-save draft on message change
  useEffect(() => {
    if (messageState.message.length > 0) {
      draft.handleAutoSave(messageState.message, messageState.attachments);
    }
  }, [messageState.message, messageState.attachments, draft]);

  // Clear draft when message is sent
  const clearMessageAndDraft = useCallback(() => {
    messageState.clearMessage();
    draft.clearDraft();
    draftRestoredRef.current = false;
  }, [messageState, draft]);

  // Handle mention selection
  const handleMentionSelect = useCallback((item: ReturnType<typeof mentions.handleMentionSelect> extends { newMessage: string } ? Parameters<typeof mentions.handleMentionSelect>[0] : never) => {
    const result = mentions.handleMentionSelect(item);
    messageState.setMessage(result.newMessage);
    setCursorPosition(result.newCursorPos);
    
    // Focus textarea and set cursor position
    if (messageState.textareaRef.current) {
      messageState.textareaRef.current.focus();
      // Use setTimeout to ensure the DOM has updated
      setTimeout(() => {
        if (messageState.textareaRef.current) {
          messageState.textareaRef.current.selectionStart = result.newCursorPos;
          messageState.textareaRef.current.selectionEnd = result.newCursorPos;
        }
      }, 0);
    }
  }, [mentions, messageState]);

  // Wrapped setMessage that tracks cursor
  // Note: Cursor position is updated via onSelectionChange callback from InputTextarea
  const setMessageWithCursor = useCallback((value: string) => {
    messageState.setMessage(value);
  }, [messageState]);
  
  // Provider selection management
  const providerSelection = useProviderSelection({
    activeSession,
    updateSessionConfig: actions.updateSessionConfig,
  });
  
  // Chat submission management
  const chatSubmit = useChatSubmit({
    message: messageState.message,
    attachments: messageState.attachments,
    clearMessage: clearMessageAndDraft,
    activeSession,
    agentBusy: agentBusy ?? false,
    activeWorkspace,
    sessionWorkspaceValid,
    selectedProvider: providerSelection.selectedProvider,
    selectedModelId: providerSelection.selectedModelId,
    manualModel: providerSelection.manualModel,
    sendMessage: actions.sendMessage,
    updateSessionConfig: actions.updateSessionConfig,
  });

  // Message history navigation (up/down arrow keys)
  const messageHistory = useMessageHistory({
    messages: sessionSnapshot.recentUserMessagesForHistory,
    currentMessage: messageState.message,
    setMessage: messageState.setMessage,
    isInputEmpty: messageState.message.length === 0,
  });
  
  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle mention keyboard navigation first
    if (mentions.activeMention && mentions.suggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentions.navigateUp();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentions.navigateDown();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedItem = mentions.suggestions[mentions.selectedIndex];
        if (selectedItem) {
          handleMentionSelect(selectedItem);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Just dismiss mentions by updating cursor
        setCursorPosition(-1);
        setTimeout(() => setCursorPosition(messageState.textareaRef.current?.selectionStart ?? 0), 0);
        return;
      }
    }

    // Handle Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      messageHistory.resetHistory(); // Reset history navigation
      chatSubmit.handleSendMessage();
      return;
    }

    // Handle history navigation with arrow keys
    if (messageHistory.handleHistoryNavigation(e)) {
      return; // Event was handled
    }

    // Escape to stop running agent or clear input
    if (e.key === 'Escape') {
      e.preventDefault();
      if (agentBusy && activeSession) {
        actions.cancelRun(activeSession.id);
      } else if (messageState.message.length > 0 || messageState.attachments.length > 0) {
        messageState.clearMessage();
        messageHistory.resetHistory();
      }
    }
  }, [chatSubmit, agentBusy, activeSession, actions, messageState, messageHistory, mentions, handleMentionSelect, setCursorPosition]);

  // Return a unified API compatible with the original hook
  return {
    // Message state
    message: messageState.message,
    setMessage: setMessageWithCursor,
    clearMessage: clearMessageAndDraft,
    attachments: messageState.attachments,
    textareaRef: messageState.textareaRef,
    
    // Provider selection
    selectedProvider: providerSelection.selectedProvider,
    selectedModelId: providerSelection.selectedModelId,
    manualModel: providerSelection.manualModel,
    setManualModel: providerSelection.setManualModel,
    
    // Submit state
    isSending: chatSubmit.isSending,
    canSend: chatSubmit.canSend,
    
    // Context state
    agentBusy,
    activeSession,
    activeWorkspace,
    sessionWorkspaceValid,
    
    // Handlers - message
    handleAddAttachments: messageState.handleAddAttachments,
    handleRemoveAttachment: messageState.handleRemoveAttachment,
    handleFileDrop: messageState.handleFileDrop,
    handlePaste: messageState.handlePaste,
    
    // Paste error state
    pasteError: messageState.pasteError,
    clearPasteError: messageState.clearPasteError,
    
    // Handlers - provider
    handleProviderSelect: providerSelection.handleProviderSelect,
    handleManualModelCommit: providerSelection.handleManualModelCommit,
    handleManualModelClear: providerSelection.handleManualModelClear,
    handleManualModelKeyDown: providerSelection.handleManualModelKeyDown,
    
    // Handlers - submit
    handleToggleYolo: chatSubmit.handleToggleYolo,
    handleSendMessage: chatSubmit.handleSendMessage,
    handleKeyDown,

    // History navigation
    isBrowsingHistory: messageHistory.isBrowsingHistory,
    historyIndex: messageHistory.currentHistoryIndex,
    historyLength: messageHistory.historyLength,

    // @ Mentions
    mentions: {
      activeMention: mentions.activeMention,
      suggestions: mentions.suggestions,
      selectedIndex: mentions.selectedIndex,
      setSelectedIndex: mentions.setSelectedIndex,
      handleSelect: handleMentionSelect,
      parseMentions: mentions.parseMentions,
      isLoading: mentions.isLoading,
      noResults: mentions.noResults,
      searchQuery: mentions.searchQuery,
      totalFiles: mentions.totalFiles,
    },
    cursorPosition,
    setCursorPosition,

    // Draft auto-save
    draft: {
      status: draft.draftStatus,
      hasDraft: draft.hasDraft,
      lastSavedAt: draft.lastSavedAt,
      clearDraft: draft.clearDraft,
    },

    // Workspace files for mentions
    workspaceFiles: workspaceFiles.files,
  };
};
