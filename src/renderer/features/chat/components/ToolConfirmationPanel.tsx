/**
 * Tool Confirmation Panel
 * 
 * Shows pending tool confirmations when yolo mode is disabled.
 * Allows users to approve, deny, or provide alternative instructions.
 * 
 * Features:
 * - Expandable tool arguments with copy functionality
 * - Quick suggestion templates for common actions
 * - Keyboard shortcuts (Enter to send, Esc to cancel)
 * - Visual feedback for all interactions
 */
import React, { memo, useCallback, useState, useMemo } from 'react';
import { 
  Check, 
  X, 
  AlertTriangle, 
  MessageSquare, 
  Send, 
  ChevronDown, 
  ChevronRight,
  Copy,
  Zap,
  SkipForward,
  RefreshCw,
  FileEdit,
} from 'lucide-react';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { cn } from '../../../utils/cn';
import type { ToolCallEvent } from '../../../../shared/types';
import { getToolIconComponent, getToolTarget } from '../utils/toolDisplay';
import { Button } from '../../../components/ui/Button';

function shortRunId(runId: string | undefined): string | undefined {
  if (!runId) return undefined;
  return runId.length > 8 ? runId.slice(0, 8) : runId;
}

function safeJsonStringify(obj: unknown, indent = 2): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch {
    return String(obj);
  }
}

// Quick suggestion templates based on tool type
const QUICK_SUGGESTIONS: Record<string, Array<{ label: string; text: string; icon: React.ElementType }>> = {
  default: [
    { label: 'skip', text: 'Skip this step and continue with the next action', icon: SkipForward },
    { label: 'retry', text: 'Try a different approach to accomplish this', icon: RefreshCw },
  ],
  write_file: [
    { label: 'different path', text: 'Use a different file path instead', icon: FileEdit },
    { label: 'skip', text: 'Skip this file and continue', icon: SkipForward },
  ],
  run_command: [
    { label: 'modify', text: 'Modify the command before running', icon: FileEdit },
    { label: 'skip', text: 'Skip this command and continue', icon: SkipForward },
  ],
  delete_file: [
    { label: 'keep file', text: 'Do not delete this file, keep it', icon: X },
    { label: 'backup first', text: 'Create a backup before deleting', icon: Copy },
  ],
};

function getQuickSuggestions(toolName: string) {
  // Match tool name patterns
  if (toolName.includes('write') || toolName.includes('create')) {
    return QUICK_SUGGESTIONS.write_file;
  }
  if (toolName.includes('command') || toolName.includes('run') || toolName.includes('exec')) {
    return QUICK_SUGGESTIONS.run_command;
  }
  if (toolName.includes('delete') || toolName.includes('remove')) {
    return QUICK_SUGGESTIONS.delete_file;
  }
  return QUICK_SUGGESTIONS.default;
}

interface ToolConfirmationItemProps {
  confirmation: ToolCallEvent;
  onApprove: () => void;
  onDeny: () => void;
  onFeedback: (feedback: string) => void;
}

const ToolConfirmationItem: React.FC<ToolConfirmationItemProps> = memo(({
  confirmation,
  onApprove,
  onDeny,
  onFeedback,
}) => {
  const { toolCall } = confirmation;
  const Icon = getToolIconComponent(toolCall.name);
  const target = getToolTarget(toolCall.arguments, toolCall.name) ?? '';
  const run = shortRunId(confirmation.runId);
  
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);

  const quickSuggestions = useMemo(() => getQuickSuggestions(toolCall.name), [toolCall.name]);
  const hasArgs = toolCall.arguments && Object.keys(toolCall.arguments).length > 0;
  const argsString = useMemo(() => safeJsonStringify(toolCall.arguments, 2), [toolCall.arguments]);

  const handleFeedbackSubmit = useCallback(() => {
    if (!feedbackText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onFeedback(feedbackText.trim());
  }, [feedbackText, isSubmitting, onFeedback]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFeedbackSubmit();
    }
    if (e.key === 'Escape') {
      setShowFeedback(false);
      setFeedbackText('');
    }
  }, [handleFeedbackSubmit]);

  const handleQuickSuggestion = useCallback((text: string) => {
    setFeedbackText(text);
    setShowFeedback(true);
  }, []);

  const handleCopyArgs = useCallback(async () => {
    await navigator.clipboard.writeText(argsString);
    setCopiedArgs(true);
    setTimeout(() => setCopiedArgs(false), 1500);
  }, [argsString]);

  return (
    <div className={cn(
      'group/confirm rounded-sm overflow-hidden font-mono',
      'border border-[var(--color-warning)]/25',
      'bg-[var(--color-surface-1)]',
      'transition-all duration-150'
    )}>
      {/* Header row */}
      <div className={cn(
        'px-3 py-2 flex items-center justify-between gap-3',
        'bg-[var(--color-surface-header)]',
        'border-b border-[var(--color-border-subtle)]'
      )}>
        <div className="min-w-0 flex items-center gap-2">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            'bg-[var(--color-warning)]',
            'shadow-[0_0_6px_var(--color-warning)]',
            'animate-pulse'
          )} />
          <span className="text-[10px] text-[var(--color-warning)] font-medium">
            confirm
          </span>
          {run && (
            <span className="text-[9px] text-[var(--color-text-dim)]">
              #{run}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowFeedback(!showFeedback)}
            className={cn(
              'gap-1',
              showFeedback && 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]'
            )}
            aria-label="Provide alternative instructions"
            title="Tell the agent to do something different"
          >
            <MessageSquare size={10} />
            suggest
          </Button>
          <Button
            variant="success"
            size="xs"
            onClick={onApprove}
            aria-label="Approve tool execution"
            leftIcon={<Check size={10} />}
          >
            approve
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={onDeny}
            aria-label="Deny and stop execution"
            leftIcon={<X size={10} />}
          >
            deny
          </Button>
        </div>
      </div>

      {/* Tool info */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">{toolCall.name}</span>
          {target && (
            <>
              <span className="text-[var(--color-text-dim)] opacity-40">→</span>
              <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[300px]" title={target}>
                {target}
              </span>
            </>
          )}
        </div>

        {/* Expandable arguments */}
        {hasArgs && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsArgsExpanded(!isArgsExpanded)}
              className={cn(
                'flex items-center gap-1.5 py-0.5 cursor-pointer',
                'hover:bg-[var(--color-surface-1)]/50 rounded-sm px-1 -mx-1',
                'transition-colors duration-100',
                'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25'
              )}
            >
              <span className="text-[var(--color-text-dim)] opacity-50 w-2.5">
                {isArgsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)]">arguments</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">
                • {Object.keys(toolCall.arguments).length} {Object.keys(toolCall.arguments).length === 1 ? 'param' : 'params'}
              </span>
            </button>

            {isArgsExpanded && (
              <div className={cn(
                'mt-1.5 ml-4',
                'bg-[var(--color-surface-base)] rounded-sm',
                'border border-[var(--color-border-subtle)]',
                'overflow-hidden'
              )}>
                <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/30">
                  <span className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">json</span>
                  <button
                    onClick={handleCopyArgs}
                    className={cn(
                      'p-0.5 rounded transition-colors',
                      'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                      'hover:bg-[var(--color-surface-2)]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
                    )}
                    title="Copy arguments"
                  >
                    {copiedArgs ? (
                      <Check size={10} className="text-[var(--color-success)]" />
                    ) : (
                      <Copy size={10} />
                    )}
                  </button>
                </div>
                <div className="max-h-[120px] overflow-y-auto scrollbar-thin p-2">
                  <pre className="whitespace-pre-wrap break-all text-[9px] text-[var(--color-text-muted)]">
                    {argsString}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback section */}
      {showFeedback && (
        <div className={cn(
          'px-3 py-2.5 border-t border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-base)]'
        )}>
          {/* Quick suggestions */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <Zap size={10} className="text-[var(--color-accent-primary)]" />
            <span className="text-[9px] text-[var(--color-text-muted)]">quick:</span>
            {quickSuggestions.map((suggestion, idx) => {
              const SugIcon = suggestion.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickSuggestion(suggestion.text)}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm',
                    'text-[9px] text-[var(--color-text-secondary)]',
                    'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                    'hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]',
                    'hover:text-[var(--color-text-primary)]',
                    'transition-all duration-100',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
                  )}
                  title={suggestion.text}
                >
                  <SugIcon size={9} />
                  {suggestion.label}
                </button>
              );
            })}
          </div>

          {/* Custom feedback input */}
          <div className="flex gap-2">
            <div className="flex-1 relative group">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="tell the agent what to do instead..."
                className={cn(
                  'w-full min-h-[48px] max-h-[100px] px-2 py-1.5 text-[10px] resize-none',
                  'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)] font-mono',
                  'placeholder:text-[var(--color-text-placeholder)]',
                  'focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]/50',
                  'focus-visible:bg-[var(--color-surface-header)]',
                  'hover:border-[var(--color-border-default)]',
                  'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]',
                  'transition-all duration-150'
                )}
                disabled={isSubmitting}
                autoFocus
              />
              {/* Focus indicator line */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-accent-primary)] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-200 origin-left" />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackText.trim() || isSubmitting}
              isLoading={isSubmitting}
              className="self-end"
              aria-label="Send feedback to agent"
              leftIcon={<Send size={10} />}
            >
              send
            </Button>
          </div>
          
          {/* Keyboard hints */}
          <div className="flex items-center gap-3 mt-1.5 text-[8px] text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">⏎</kbd>
              send
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">⇧⏎</kbd>
              newline
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">esc</kbd>
              cancel
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

ToolConfirmationItem.displayName = 'ToolConfirmationItem';

// =============================================================================
// Main Panel Component
// =============================================================================

export const ToolConfirmationPanel: React.FC = memo(() => {
  const actions = useAgentActions();
  const pendingConfirmationsMap = useAgentSelector(
    (s) => s.pendingConfirmations,
    (a, b) => a === b,
  );
  const pendingConfirmations = useMemo(() => Object.values(pendingConfirmationsMap), [pendingConfirmationsMap]);
  
  const handleApprove = useCallback((confirmation: ToolCallEvent) => {
    actions.confirmTool(confirmation.runId, true, confirmation.sessionId);
  }, [actions]);
  
  const handleDeny = useCallback((confirmation: ToolCallEvent) => {
    actions.confirmTool(confirmation.runId, false, confirmation.sessionId);
  }, [actions]);

  const handleFeedback = useCallback((confirmation: ToolCallEvent, feedback: string) => {
    actions.confirmTool(confirmation.runId, false, confirmation.sessionId, feedback);
  }, [actions]);

  // Batch actions
  const handleApproveAll = useCallback(() => {
    pendingConfirmations.forEach(c => {
      actions.confirmTool(c.runId, true, c.sessionId);
    });
  }, [actions, pendingConfirmations]);

  const handleDenyAll = useCallback(() => {
    pendingConfirmations.forEach(c => {
      actions.confirmTool(c.runId, false, c.sessionId);
    });
  }, [actions, pendingConfirmations]);
  
  if (pendingConfirmations.length === 0) {
    return null;
  }

  const showBatchActions = pendingConfirmations.length > 1;
  
  return (
    <div className="pt-3 space-y-2 animate-slide-in-bottom">
      <div className={cn(
        'rounded-sm overflow-hidden',
        'border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-editor)]',
        'shadow-[0_2px_8px_-4px_rgba(0,0,0,0.3)]'
      )}>
        {/* Panel header */}
        <div className={cn(
          'px-3 py-1.5',
          'border-b border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-header)]'
        )}>
          <div className="flex items-center justify-between gap-2 font-mono">
            <div className="flex items-center gap-2">
              <AlertTriangle size={11} className="text-[var(--color-warning)]" />
              <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">
                pending confirmation{pendingConfirmations.length > 1 ? 's' : ''}
              </span>
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-sm',
                'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
                'border border-[var(--color-warning)]/20'
              )}>
                {pendingConfirmations.length}
              </span>
            </div>

            {/* Batch actions */}
            {showBatchActions && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleApproveAll}
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded-sm',
                    'text-[var(--color-success)]',
                    'bg-[var(--color-success)]/5 hover:bg-[var(--color-success)]/15',
                    'border border-[var(--color-success)]/20 hover:border-[var(--color-success)]/40',
                    'transition-colors duration-100'
                  )}
                >
                  approve all
                </button>
                <button
                  onClick={handleDenyAll}
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded-sm',
                    'text-[var(--color-error)]',
                    'bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/15',
                    'border border-[var(--color-error)]/20 hover:border-[var(--color-error)]/40',
                    'transition-colors duration-100'
                  )}
                >
                  deny all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation items */}
        <div className="p-2 space-y-2">
          {pendingConfirmations.map((confirmation) => (
            <ToolConfirmationItem
              key={confirmation.runId}
              confirmation={confirmation}
              onApprove={() => handleApprove(confirmation)}
              onDeny={() => handleDeny(confirmation)}
              onFeedback={(feedback) => handleFeedback(confirmation, feedback)}
            />
          ))}
        </div>

        {/* Footer hint */}
        <div className={cn(
          'px-3 py-1.5',
          'border-t border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-header)]'
        )}>
          <div className="flex items-center justify-between text-[8px] text-[var(--color-text-dim)]">
            <span>review tool actions before execution</span>
            <span className="flex items-center gap-1">
              <span className="text-[var(--color-accent-primary)]">tip:</span>
              use suggest to guide the agent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

ToolConfirmationPanel.displayName = 'ToolConfirmationPanel';
