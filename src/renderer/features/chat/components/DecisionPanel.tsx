/**
 * DecisionPanel Component
 * 
 * Renders pending decisions from the agent that require user selection.
 * Supports urgency levels, option descriptions with pros/cons, and
 * deadline countdowns. Connected to the communication state.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { GitBranch, Check, SkipForward, Clock, AlertTriangle, Star } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { AgentUIState } from '../../../state/types';

// =============================================================================
// Types
// =============================================================================

type PendingDecision = AgentUIState['pendingDecisions'][0];

interface DecisionPanelProps {
  /** The pending decision to render */
  decision: PendingDecision;
  /** Callback to make a decision */
  onDecide: (decisionId: string, selectedOptionId: string) => Promise<void>;
  /** Callback to skip the decision */
  onSkip: (decisionId: string) => Promise<void>;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const urgencyConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'var(--color-text-dim)', label: 'LOW' },
  medium: { color: 'var(--color-info)', label: 'MEDIUM' },
  high: { color: 'var(--color-warning)', label: 'HIGH' },
  critical: { color: 'var(--color-error)', label: 'CRITICAL' },
};

function getDeadlineRemaining(deadline?: number): string | null {
  if (!deadline) return null;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'expired';
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
}

// =============================================================================
// Main Component
// =============================================================================

const DecisionPanelInternal: React.FC<DecisionPanelProps> = ({
  decision,
  onDecide,
  onSkip,
  className,
}) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deadlineText, setDeadlineText] = useState<string | null>(null);

  const urgency = useMemo(
    () => urgencyConfig[decision.urgency] ?? urgencyConfig.medium,
    [decision.urgency],
  );

  // Deadline countdown
  useEffect(() => {
    const update = () => setDeadlineText(getDeadlineRemaining(decision.deadline));
    update();
    if (!decision.deadline) return;
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [decision.deadline]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || !selectedOptionId) return;
    setIsSubmitting(true);
    try {
      await onDecide(decision.id, selectedOptionId);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, selectedOptionId, decision.id, onDecide]);

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSkip(decision.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, decision.id, onSkip]);

  const borderColor = decision.urgency === 'critical' || decision.urgency === 'high'
    ? 'border-[var(--color-warning)]/50'
    : 'border-[var(--color-accent-secondary)]/50';

  return (
    <div
      className={cn(
        'rounded border font-mono',
        'bg-[var(--color-surface-1)]',
        borderColor,
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border-subtle)]">
        <GitBranch size={11} style={{ color: 'var(--color-accent-secondary)' }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-accent-secondary)' }}>
          decision required
        </span>
        <span
          className="text-[8px] uppercase tracking-wider px-1 py-px rounded"
          style={{
            color: urgency.color,
            backgroundColor: `color-mix(in srgb, ${urgency.color} 10%, transparent)`,
          }}
        >
          {urgency.label}
        </span>
        {deadlineText && deadlineText !== 'expired' && (
          <span className="ml-auto flex items-center gap-0.5 text-[8px] tabular-nums text-[var(--color-text-dim)]">
            <Clock size={8} />
            {deadlineText}
          </span>
        )}
        {deadlineText === 'expired' && (
          <span className="ml-auto flex items-center gap-0.5 text-[8px] text-[var(--color-error)]">
            <AlertTriangle size={8} />
            expired
          </span>
        )}
      </div>

      {/* Decision prompt */}
      <div className="px-2 py-1.5">
        <div className="text-[10px] text-[var(--color-text-primary)] leading-relaxed">
          <span style={{ color: 'var(--color-accent-primary)' }}>λ</span>{' '}
          {decision.prompt}
        </div>

        {/* Context */}
        {decision.context && (
          <div className="mt-1 text-[9px] text-[var(--color-text-muted)] leading-relaxed">
            {decision.context}
          </div>
        )}

        {/* Options */}
        <div className="flex flex-col gap-1.5 mt-2">
          {decision.options.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedOptionId(opt.id)}
              className={cn(
                'flex flex-col gap-0.5 px-2 py-1.5 rounded text-left',
                'border transition-colors duration-100',
                selectedOptionId === opt.id
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5'
                  : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'h-3 w-3 rounded-full border flex items-center justify-center shrink-0',
                  selectedOptionId === opt.id
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]'
                    : 'border-[var(--color-border-default)]',
                )}>
                  {selectedOptionId === opt.id && <Check size={7} style={{ color: 'var(--color-surface-base)' }} />}
                </span>
                <span className="text-[10px] text-[var(--color-text-primary)]">
                  {opt.label}
                </span>
                {opt.isRecommended && (
                  <Star size={8} className="shrink-0" style={{ color: 'var(--color-warning)' }} />
                )}
              </div>
              {opt.description && (
                <span className="text-[9px] text-[var(--color-text-muted)] ml-[18px]">
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedOptionId}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px]',
            'text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10',
            'transition-colors duration-100',
            (isSubmitting || !selectedOptionId) && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Check size={10} />
          confirm
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px]',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)] transition-colors duration-100',
            isSubmitting && 'opacity-50 cursor-not-allowed',
          )}
        >
          <SkipForward size={10} />
          skip
        </button>
      </div>
    </div>
  );
};

export const DecisionPanel = memo(DecisionPanelInternal);
DecisionPanel.displayName = 'DecisionPanel';
