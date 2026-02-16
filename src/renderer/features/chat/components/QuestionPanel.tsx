/**
 * QuestionPanel Component
 * 
 * Renders pending questions from the agent that require user input.
 * Supports multiple question types: yes-no, multiple-choice, text,
 * confirmation. Connected to the communication state via useCommunication.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { HelpCircle, Send, SkipForward, Check, X, Clock } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { AgentUIState } from '../../../state/types';

// =============================================================================
// Types
// =============================================================================

type PendingQuestion = AgentUIState['pendingQuestions'][0];

interface QuestionPanelProps {
  /** The pending question to render */
  question: PendingQuestion;
  /** Callback to answer the question */
  onAnswer: (questionId: string, answer: unknown) => Promise<void>;
  /** Callback to skip the question */
  onSkip: (questionId: string) => Promise<void>;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'clarification': return 'CLARIFICATION';
    case 'confirmation': return 'CONFIRM';
    case 'permission': return 'PERMISSION';
    case 'input': return 'INPUT';
    default: return 'QUESTION';
  }
}

function getTimeRemaining(createdAt: number, timeoutMs?: number): string | null {
  if (!timeoutMs || timeoutMs <= 0) return null;
  const elapsed = Date.now() - createdAt;
  const remaining = timeoutMs - elapsed;
  if (remaining <= 0) return 'expired';
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}

// =============================================================================
// Sub-components
// =============================================================================

const OptionButton: React.FC<{
  option: { id: string; label: string; value: unknown };
  isSelected: boolean;
  onSelect: (id: string) => void;
}> = memo(({ option, isSelected, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(option.id)}
    className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono',
      'border transition-colors duration-100',
      isSelected
        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
        : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]',
    )}
  >
    <span className={cn(
      'h-3 w-3 rounded-full border flex items-center justify-center shrink-0',
      isSelected
        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]'
        : 'border-[var(--color-border-default)]',
    )}>
      {isSelected && <Check size={7} style={{ color: 'var(--color-surface-base)' }} />}
    </span>
    {option.label}
  </button>
));
OptionButton.displayName = 'OptionButton';

// =============================================================================
// Main Component
// =============================================================================

const QuestionPanelInternal: React.FC<QuestionPanelProps> = ({
  question,
  onAnswer,
  onSkip,
  className,
}) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    question.defaultValue != null ? String(question.defaultValue) : null
  );
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  // Track timeout countdown
  useEffect(() => {
    const update = () => {
      const remaining = getTimeRemaining(question.createdAt, (question as PendingQuestion & { timeoutMs?: number }).timeoutMs);
      setTimeRemaining(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [question.createdAt, question]);

  const typeLabel = useMemo(() => getQuestionTypeLabel(question.type), [question.type]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (question.options && question.options.length > 0) {
        if (!selectedOptionId) return;
        const selectedOption = question.options.find(o => o.id === selectedOptionId);
        await onAnswer(question.id, selectedOption?.value ?? selectedOptionId);
      } else {
        await onAnswer(question.id, textInput.trim() || question.defaultValue);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, question, selectedOptionId, textInput, onAnswer]);

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSkip(question.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, question.id, onSkip]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const canSubmit = question.options && question.options.length > 0
    ? selectedOptionId !== null
    : textInput.trim().length > 0 || question.defaultValue != null;

  return (
    <div
      className={cn(
        'rounded border font-mono',
        'bg-[var(--color-surface-1)]',
        'border-[var(--color-info)]/50',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border-subtle)]">
        <HelpCircle size={11} style={{ color: 'var(--color-info)' }} />
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-info)]">
          {typeLabel}
        </span>
        {question.isRequired && (
          <span className="text-[8px] uppercase tracking-wider text-[var(--color-error)]">required</span>
        )}
        {timeRemaining && timeRemaining !== 'expired' && (
          <span className="ml-auto flex items-center gap-0.5 text-[8px] tabular-nums text-[var(--color-text-dim)]">
            <Clock size={8} />
            {timeRemaining}
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="px-2 py-1.5">
        <div className="text-[10px] text-[var(--color-text-primary)] leading-relaxed">
          <span style={{ color: 'var(--color-accent-primary)' }}>λ</span>{' '}
          {question.question}
        </div>

        {/* Options (multiple-choice) */}
        {question.options && question.options.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {question.options.map(opt => (
              <OptionButton
                key={opt.id}
                option={opt}
                isSelected={selectedOptionId === opt.id}
                onSelect={setSelectedOptionId}
              />
            ))}
          </div>
        )}

        {/* Text input (freeform) */}
        {(!question.options || question.options.length === 0) && (
          <div className="mt-2">
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={String(question.defaultValue ?? 'type your response...')}
              className={cn(
                'w-full bg-[var(--color-surface-2)] rounded px-1.5 py-1 text-[10px]',
                'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]',
                'outline-none resize-none min-h-[32px] max-h-[80px]',
                'border border-[var(--color-border-subtle)] focus:border-[var(--color-info)]/50',
              )}
              spellCheck={false}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[9px]',
            'text-[var(--color-info)] hover:bg-[var(--color-info)]/10',
            'transition-colors duration-100',
            (isSubmitting || !canSubmit) && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Send size={10} />
          respond
        </button>
        {!question.isRequired && (
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
        )}
      </div>
    </div>
  );
};

export const QuestionPanel = memo(QuestionPanelInternal);
QuestionPanel.displayName = 'QuestionPanel';
