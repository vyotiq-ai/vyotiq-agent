/**
 * Chat Input Component
 * 
 * Modular, terminal-styled chat input with advanced features for message composition.
 * Composes smaller, focused components for better maintainability.
 * 
 * #### Architecture
 * - InputHeader: Status indicator and controls
 * - InputTextarea: Message input with prompt symbol and cursor
 * - InputActions: Run/Kill button (inline with textarea)
 * - InputToolbar: File attach, model selector, yolo mode (now under textarea)
 * - InputDropZone: Drag-and-drop overlay
 * 
 * #### Features
 * - Multi-line message input with terminal aesthetic
 * - File attachment support (drag-drop, paste, file picker)
 * - Model/provider selection dropdown
 * - YOLO mode (skip safety confirmations)
 * - Real-time status and cost display
 * - Keyboard shortcuts (Enter to send, Shift+Enter for newline)
 * 
 * @example
 * <ChatInput />
 */
import React, { useState, useCallback, useEffect, memo, useRef, useMemo } from 'react';
import { X, History } from 'lucide-react';
import { useChatInput, useAgentStatus, useSessionCost, useAvailableProviders } from '../../../../hooks';
import { useAgentActions } from '../../../../state/AgentProvider';
import { useUIActions } from '../../../../state/UIProvider';
import { useRenderProfiler } from '../../../../utils/profiler';
import { cn } from '../../../../utils/cn';

// Modular input components
import { InputHeader } from './InputHeader';
import { InputTextarea } from './InputTextarea';
import { InputActions } from './InputActions';
import { InputToolbar } from './InputToolbar';
import { InputDropZone } from './InputDropZone';
import { MentionAutocomplete } from './MentionAutocomplete';
import { DraftIndicator } from './DraftIndicator';
import { ChatAttachmentList } from '../ChatAttachmentList';
import { useTodos } from '../../../../hooks/useTodos';

// =============================================================================
// Paste Error Banner Component
// =============================================================================

interface PasteErrorBannerProps {
  error: string | null;
  onClear: () => void;
}

const PasteErrorBanner: React.FC<PasteErrorBannerProps> = memo(({ error, onClear }) => {
  if (!error) return null;
  
  return (
    <div className="px-3 py-2 bg-[var(--color-error)]/10 border-b border-[var(--color-error)]/20">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-[var(--color-error)]">{error}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-[var(--color-error)] hover:text-[var(--color-error)]/80 transition-colors ml-2"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      </div>
    </div>
  );
});
PasteErrorBanner.displayName = 'PasteErrorBanner';

// =============================================================================
// No Providers Warning Banner
// =============================================================================

interface NoProvidersWarningProps {
  hasProviders: boolean;
  onOpenSettings: () => void;
}

const NoProvidersWarning: React.FC<NoProvidersWarningProps> = memo(({ hasProviders, onOpenSettings }) => {
  if (hasProviders) return null;
  
  return (
    <div className="px-3 py-2 bg-[var(--color-warning)]/10 border-b border-[var(--color-warning)]/20">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-[var(--color-warning)] flex items-center gap-1.5">
          <span className="text-[var(--color-warning)]">[WARN]</span>
          no API keys configured - add provider via :config --providers
        </span>
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-2 py-0.5 text-[9px] bg-[var(--color-warning)]/20 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/30 transition-colors ml-2"
          aria-label="Open settings"
        >
          :config
        </button>
      </div>
    </div>
  );
});
NoProvidersWarning.displayName = 'NoProvidersWarning';

// =============================================================================
// Clear Input Button
// =============================================================================

interface ClearButtonProps {
  onClick: () => void;
  visible: boolean;
  disabled: boolean;
}

const ClearButton: React.FC<ClearButtonProps> = memo(({ onClick, visible, disabled }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      onClick();
    }
  }, [onClick, disabled]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm',
        'text-[9px] text-[var(--color-text-muted)]',
        'transition-all duration-200 ease-out',
        visible 
          ? 'opacity-100 translate-x-0' 
          : 'opacity-0 translate-x-1 pointer-events-none',
        'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
        'active:scale-95',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
      title="Clear input (Escape)"
      aria-label="Clear message input"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <X size={10} aria-hidden="true" />
    </button>
  );
});
ClearButton.displayName = 'ClearButton';

// =============================================================================
// Smart Placeholder Helper
// =============================================================================

/** Contextual placeholder suggestions based on conversation state */
const PLACEHOLDER_HINTS = [
  'describe what to do...',
  'what would you like to build?',
  'ask me to fix, refactor, or add features...',
  'paste code or drop files to analyze...',
  'explain the problem you are facing...',
  'give me instructions to follow...',
  'tell me what you need help with...',
] as const;

const FOLLOW_UP_HINTS = [
  'continue, or ask for changes...',
  'provide feedback or ask questions...',
  'tell me what to do next...',
  'request modifications...',
  'ask for clarification...',
  'give additional instructions...',
  'let me know if you need anything else...',
  'what should we do next...',
] as const;

const ATTACHMENT_HINTS = [
  'describe what to do with the attached files...',
  'explain what you need help with...',
  'ask me to analyze or modify these files...',
] as const;

/** Hints when YOLO mode is enabled (auto-confirm all actions) */
const YOLO_HINTS = [
  'auto-confirm is ON - actions will execute immediately...',
  'YOLO mode active - no confirmation prompts...',
  'running in auto-confirm mode...',
  'caution: all actions will execute without prompts...',
] as const;

/**
 * Get a contextual placeholder based on conversation state
 * Uses deterministic selection based on message count to avoid flicker
 */
function getSmartPlaceholder(
  messageCount: number,
  attachmentCount: number,
  yoloEnabled: boolean,
  _isAgentBusy: boolean
): string {
  // Show YOLO warning when enabled (deterministic based on message count)
  if (yoloEnabled && messageCount % 4 === 0) {
    const idx = (messageCount >> 2) % YOLO_HINTS.length;
    return YOLO_HINTS[idx];
  }

  // If there are attachments, suggest what to do with them
  if (attachmentCount > 0) {
    const idx = attachmentCount % ATTACHMENT_HINTS.length;
    return ATTACHMENT_HINTS[idx];
  }
  
  // If it's a follow-up message, use follow-up hints
  if (messageCount > 0) {
    const idx = messageCount % FOLLOW_UP_HINTS.length;
    return FOLLOW_UP_HINTS[idx];
  }
  
  // Initial message hints - deterministic
  return PLACEHOLDER_HINTS[0];
}

// =============================================================================
// Main ChatInput Component
// =============================================================================

export const ChatInput: React.FC = memo(() => {
  useRenderProfiler('ChatInput');
  
  // === Hooks ===
  const {
    message,
    setMessage,
    clearMessage,
    attachments,
    isSending,
    selectedProvider,
    selectedModelId,
    textareaRef,
    agentBusy,
    activeSession,
    canSend,
    sessionWorkspaceValid,
    handleAddAttachments,
    handleRemoveAttachment,
    handleProviderSelect,
    handleToggleYolo,
    handleSendMessage,
    handleKeyDown,
    handleFileDrop,
    handlePaste,
    pasteError,
    clearPasteError,
    isBrowsingHistory,
    historyIndex,
    historyLength,
    // New: Mentions
    mentions,
    cursorPosition: _cursorPosition, // Used internally by mentions
    setCursorPosition,
    // New: Draft
    draft,
  } = useChatInput();
  
  const actions = useAgentActions();
  const { openSettings } = useUIActions();
  const { 
    isWorking, 
    statusMessage, 
    statusPhase, 
    formattedElapsedTime,
    isPaused,
    messageCount,
    contextMetrics,
    activeProvider,
    activeModelId,
    currentIteration,
    maxIterations,
  } = useAgentStatus();
  const { formattedCost, formattedTotalTokens, hasUsage, breakdownTitle } = useSessionCost();
  const { availableProviders, providersCooldown } = useAvailableProviders();
  
  // Todo progress for inline display in header
  const { todos, stats: todoStats } = useTodos({ sessionId: activeSession?.id ?? null });
  
  // === Local State ===
  const [isDragging, setIsDragging] = useState(false);
  
  // === Derived State ===
  const hasProviders = availableProviders.length > 0;
  const hasWorkspace = true; // No workspace concept
  const yoloEnabled = Boolean(activeSession?.config.yoloMode);
  const hasContent = message.length > 0;
  
  // Workspace validation warning
  const workspaceWarning = !sessionWorkspaceValid && activeSession && hasWorkspace 
    ? 'Session bound to different workspace' 
    : null;
  
  // PERF: Memoize cost info object to prevent child re-renders
  const costInfo = useMemo(() => ({
    formattedCost,
    formattedTokens: formattedTotalTokens,
    hasUsage,
    detailsTitle: breakdownTitle,
  }), [formattedCost, formattedTotalTokens, hasUsage, breakdownTitle]);

  // PERF: Memoize context info object
  const contextInfo = useMemo(() => {
    const metrics = contextMetrics?.metrics;
    if (!metrics) return undefined;
    return {
      utilization: metrics.utilization,
      totalTokens: metrics.totalTokens,
      maxInputTokens: metrics.maxInputTokens,
      availableTokens: metrics.availableTokens,
      isWarning: metrics.isWarning,
      needsPruning: metrics.needsPruning,
      tokensByRole: metrics.tokensByRole,
    };
  }, [contextMetrics?.metrics]);
  
  // === Handlers ===
  // Use refs to avoid stale closures in event handlers
  const agentBusyRef = useRef(agentBusy);
  const activeSessionRef = useRef(activeSession);
  const actionsRef = useRef(actions);
  const isPausedRef = useRef(isPaused);
  
  useEffect(() => {
    agentBusyRef.current = agentBusy;
    activeSessionRef.current = activeSession;
    actionsRef.current = actions;
    isPausedRef.current = isPaused;
  }, [agentBusy, activeSession, actions, isPaused]);
  
  const handleStop = useCallback(() => {
    if (activeSessionRef.current) {
      actionsRef.current.cancelRun(activeSessionRef.current.id);
    }
  }, []);

  const handlePauseResume = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return;
    if (isPausedRef.current) {
      actionsRef.current.resumeRun(session.id);
    } else {
      actionsRef.current.pauseRun(session.id);
    }
  }, []);

  // Handle realtime maxIterations changes during agent run
  const handleMaxIterationsChange = useCallback((value: number) => {
    const session = activeSessionRef.current;
    if (!session) return;
    actionsRef.current.updateSessionConfig(session.id, { maxIterations: value });
  }, []);
  
  // Global ESC key to stop running agent
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      const currentBusy = agentBusyRef.current;
      const currentSession = activeSessionRef.current;
      if (e.key === 'Escape' && currentBusy && currentSession) {
        e.preventDefault();
        actionsRef.current.cancelRun(currentSession.id);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, []); // No dependencies - uses refs
  
  // Drag-and-drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const onDrop = useCallback((e: React.DragEvent) => {
    setIsDragging(false);
    handleFileDrop(e);
  }, [handleFileDrop]);
  
  return (
    <div className="w-full min-w-0 overflow-visible">
      {/* Terminal container - edge to edge full width */}
      <div 
        className={cn(
          'terminal-container relative w-full overflow-visible',
          'bg-[var(--color-surface-editor)]',
          'border-t border-[var(--color-border-subtle)]/60',
          'font-mono',
          'transition-all duration-200'
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="region"
        aria-label="Chat input terminal"
      >
        {/* Header - includes status, iteration, and task progress all in one line */}
        <InputHeader
          isWorking={isWorking}
          statusMessage={statusMessage}
          statusPhase={statusPhase ?? 'idle'}
          workspaceWarning={workspaceWarning}
          elapsedTime={formattedElapsedTime}
          isPaused={isPaused}
          onTogglePause={handlePauseResume}
          currentIteration={currentIteration}
          maxIterations={maxIterations}
          onMaxIterationsChange={handleMaxIterationsChange}
          todos={todos}
          todoStats={todoStats}
        />
        
        {/* Drop overlay */}
        <InputDropZone isActive={isDragging} />
        
        {/* No providers warning */}
        <NoProvidersWarning hasProviders={hasProviders} onOpenSettings={openSettings} />
        
        {/* Paste error */}
        <PasteErrorBanner error={pasteError} onClear={clearPasteError} />
        
        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-2 py-0.5 border-b border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-editor)]">
            <ChatAttachmentList 
              attachments={attachments} 
              onRemove={handleRemoveAttachment} 
              variant="strip"
            />
          </div>
        )}

        {/* Composer */}
        <div className="px-2 py-1">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 relative">
              <InputTextarea
                ref={textareaRef}
                value={message}
                onChange={setMessage}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelectionChange={setCursorPosition}
                onFocus={() => {
                  // Update cursor position on focus
                  if (textareaRef.current) {
                    setCursorPosition(textareaRef.current.selectionStart ?? 0);
                  }
                }}
                onBlur={() => {
                  // Keep cursor position on blur for mention detection
                }}
                disabled={agentBusy}
                hasWorkspace={hasWorkspace}
                placeholder={getSmartPlaceholder(messageCount, attachments.length, yoloEnabled, agentBusy ?? false)}
                className="w-full"
                maxHeight={220}
                ariaDescribedBy="chat-input-hints"
              />

              {/* @ Mention Autocomplete - positioned above textarea */}
              <MentionAutocomplete
                suggestions={mentions.suggestions}
                selectedIndex={mentions.selectedIndex}
                onSelect={mentions.handleSelect}
                onSelectionChange={mentions.setSelectedIndex}
                visible={!!mentions.activeMention}
                isLoading={mentions.isLoading}
                noResults={mentions.noResults}
                searchQuery={mentions.searchQuery}
                totalFiles={mentions.totalFiles}
              />
            </div>

            <InputActions
              isRunning={agentBusy ?? false}
              canSend={canSend}
              isSending={isSending}
              onSend={handleSendMessage}
              onStop={handleStop}
              className="self-center mt-0.5"
            />
          </div>
        </div>

        {/* Footer - clean and minimal */}
        <div 
          id="chat-input-hints"
          className="flex items-center gap-3 text-[9px] font-mono text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)]/40 px-2 py-1 min-w-0"
          aria-label="Message options and shortcuts"
        >
          {/* Toolbar */}
          <InputToolbar
            onAddAttachments={handleAddAttachments}
            provider={selectedProvider}
            modelId={selectedModelId}
            onProviderSelect={handleProviderSelect}
            availableProviders={availableProviders}
            providersCooldown={providersCooldown}
            yoloEnabled={yoloEnabled}
            onToggleYolo={handleToggleYolo}
            disabled={agentBusy ?? false}
            hasSession={!!activeSession}
            hasWorkspace={hasWorkspace}
            messageCount={messageCount}
            costInfo={costInfo}
            contextInfo={contextInfo}
            className="flex-1 min-w-0"
            activeProvider={activeProvider}
            activeModelId={activeModelId}
            isWorking={isWorking}
          />

          {/* Right: Minimal status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* History indicator */}
            {isBrowsingHistory && (
              <span 
                className="flex items-center gap-0.5 text-[var(--color-info)]"
                title="Use ↑↓ to navigate history"
              >
                <History size={8} />
                <span className="text-[8px] tabular-nums">{historyIndex + 1}/{historyLength}</span>
              </span>
            )}

            {/* Draft indicator */}
            <DraftIndicator
              status={draft.status}
              lastSavedAt={draft.lastSavedAt}
              visible={draft.hasDraft || draft.status !== 'idle'}
            />

            {/* Keyboard hints - very compact */}
            <span className="hidden lg:inline text-[8px] text-[var(--color-text-dim)]">⏎ run</span>

            {/* Clear button */}
            <ClearButton
              onClick={clearMessage}
              visible={hasContent || attachments.length > 0}
              disabled={agentBusy ?? false}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
