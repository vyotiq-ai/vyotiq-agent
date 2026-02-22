/**
 * ToolConfirmationPanel Component
 * 
 * Shown when the agent requests permission to execute a tool.
 * Displays the tool name, arguments, and approve/deny/feedback actions.
 * Connected to the agent store's pendingConfirmations state.
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { Shield, Check, X, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ToolCallEvent } from '../../../../shared/types';
import { useAgentActions } from '../../../state/AgentProvider';

interface ToolConfirmationPanelProps {
  /** The pending tool call event requiring confirmation */
  toolCall: ToolCallEvent;
  /** Session ID for the confirmation */
  sessionId: string;
  /** Additional CSS class */
  className?: string;
}

const ToolConfirmationPanelInternal: React.FC<ToolConfirmationPanelProps> = ({
  toolCall,
  sessionId,
  className,
}) => {
  const { confirmTool } = useAgentActions();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showArgs, setShowArgs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toolName = toolCall.toolCall?.name ?? 'unknown';
  const toolArgs = toolCall.toolCall?.arguments ?? {};
  const runId = toolCall.runId ?? '';

  const formattedArgs = useMemo(() => {
    try {
      return JSON.stringify(toolArgs, null, 2);
    } catch {
      return String(toolArgs);
    }
  }, [toolArgs]);

  const handleApprove = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await confirmTool(runId, true, sessionId);
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmTool, runId, sessionId, isSubmitting]);

  const handleDeny = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await confirmTool(runId, false, sessionId);
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmTool, runId, sessionId, isSubmitting]);

  const handleFeedbackSubmit = useCallback(async () => {
    if (isSubmitting || !feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await confirmTool(runId, false, sessionId, feedback.trim());
    } finally {
      setIsSubmitting(false);
      setFeedback('');
      setShowFeedback(false);
    }
  }, [confirmTool, runId, sessionId, feedback, isSubmitting]);

  const handleFeedbackKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleFeedbackSubmit();
    }
    if (e.key === 'Escape') {
      setShowFeedback(false);
    }
  }, [handleFeedbackSubmit]);

  return (
    <div
      className={cn(
        'rounded-sm border font-mono',
        'bg-[var(--color-surface-1)]',
        'border-[var(--color-warning)]/50',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border-subtle)]">
        <Shield size={11} style={{ color: 'var(--color-warning)' }} />
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-warning)]">
          confirmation required
        </span>
      </div>

      {/* Tool info */}
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-primary)]">
          <span style={{ color: 'var(--color-accent-primary)' }}>λ</span>
          <span className="font-semibold">{toolName}</span>
        </div>

        {/* Arguments toggle */}
        {Object.keys(toolArgs).length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowArgs(p => !p)}
              className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              {showArgs ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
              arguments
            </button>
            {showArgs && (
              <pre className="mt-1 p-1.5 rounded bg-[var(--color-surface-2)] text-[9px] text-[var(--color-text-secondary)] overflow-x-auto max-h-[200px]">
                {formattedArgs}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Feedback input */}
      {showFeedback && (
        <div className="px-2 pb-1.5">
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={handleFeedbackKeyDown}
            placeholder="suggest an alternative..."
            className={cn(
              'w-full bg-[var(--color-surface-2)] rounded px-1.5 py-1 text-[10px]',
              'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]',
              'outline-none resize-none min-h-[32px] max-h-[80px]',
            )}
            spellCheck={false}
            autoFocus
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px]',
            'text-[var(--color-success)] hover:bg-[var(--color-success)]/10',
            'transition-colors duration-100',
            isSubmitting && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Check size={10} />
          approve
        </button>
        <button
          type="button"
          onClick={handleDeny}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px]',
            'text-[var(--color-error)] hover:bg-[var(--color-error)]/10',
            'transition-colors duration-100',
            isSubmitting && 'opacity-50 cursor-not-allowed',
          )}
        >
          <X size={10} />
          deny
        </button>
        <button
          type="button"
          onClick={() => setShowFeedback(p => !p)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px]',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)] transition-colors duration-100',
          )}
        >
          <MessageSquare size={10} />
          feedback
        </button>
        {showFeedback && feedback.trim() && (
          <button
            type="button"
            onClick={handleFeedbackSubmit}
            disabled={isSubmitting}
            className={cn(
              'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px]',
              'text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10',
              'transition-colors duration-100',
              isSubmitting && 'opacity-50 cursor-not-allowed',
            )}
          >
            send
          </button>
        )}
      </div>
    </div>
  );
};

export const ToolConfirmationPanel = memo(ToolConfirmationPanelInternal);
ToolConfirmationPanel.displayName = 'ToolConfirmationPanel';
