/**
 * AIResultPanel Component
 * 
 * Displays results from AI actions (explanations, refactored code, etc.)
 * Can be shown as a floating panel or side panel.
 */

import React, { memo, useCallback, useState } from 'react';
import {
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  Info,
  FileCode,
  ClipboardPaste,
} from 'lucide-react';
import { Spinner } from '../../../components/ui/LoadingState';
import { cn } from '../../../utils/cn';
import { RendererLogger } from '../../../utils/logger';
import type { EditorAIAction, EditorAIResult } from '../hooks/useEditorAI';

const logger = new RendererLogger('ai-result-panel');

export interface AIResultPanelProps {
  isOpen: boolean;
  isLoading: boolean;
  action?: EditorAIAction;
  result: EditorAIResult | null;
  error?: string;
  provider?: string;
  latencyMs?: number;
  onClose: () => void;
  onApplyCode?: (code: string) => void;
  onInsertCode?: (code: string) => void;
  className?: string;
}

const actionLabels: Record<EditorAIAction, string> = {
  'explain': 'Explanation',
  'refactor': 'Refactored Code',
  'fix-errors': 'Fixed Code',
  'generate-tests': 'Generated Tests',
  'add-documentation': 'Documented Code',
  'optimize': 'Optimized Code',
  'summarize-file': 'File Summary',
  'find-issues': 'Issues Found',
  'convert': 'Converted Code',
};

export const AIResultPanel: React.FC<AIResultPanelProps> = memo(({
  isOpen,
  isLoading,
  action,
  result,
  error,
  provider,
  latencyMs,
  onClose,
  onApplyCode,
  onInsertCode,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const handleApply = useCallback(() => {
    if (result?.code && onApplyCode) {
      onApplyCode(result.code);
    }
  }, [result?.code, onApplyCode]);

  const handleInsert = useCallback(() => {
    if (result?.code && onInsertCode) {
      onInsertCode(result.code);
    }
  }, [result?.code, onInsertCode]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
        'rounded-lg shadow-xl font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        'max-h-[400px] overflow-hidden flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/50">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-[var(--color-accent-primary)]" />
          <span className="text-[var(--color-text-primary)] font-medium">
            {action ? actionLabels[action] : 'AI Result'}
          </span>
          {isLoading && (
            <Spinner size="sm" className="w-3 h-3 text-[var(--color-accent-primary)]" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {provider && latencyMs && (
            <span className="text-[9px] text-[var(--color-text-placeholder)] mr-2">
              {provider} • {latencyMs}ms
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 overflow-auto">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Spinner size="sm" />
                <span>Analyzing code...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="p-3">
              <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)]/20">
                <AlertTriangle size={14} className="text-[var(--color-error)] shrink-0 mt-0.5" />
                <span className="text-[var(--color-error)]">{error}</span>
              </div>
            </div>
          )}

          {/* Result content */}
          {result && !isLoading && (
            <div className="p-3 space-y-3">
              {/* Text explanation */}
              {result.text && (
                <div className="prose prose-sm prose-invert max-w-none">
                  <div className="text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {result.text}
                  </div>
                </div>
              )}

              {/* Code block */}
              {result.code && (
                <div className="relative group">
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onApplyCode && (
                      <button
                        type="button"
                        onClick={handleApply}
                        className={cn(
                          'p-1.5 rounded text-[9px] flex items-center gap-1',
                          'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]',
                          'hover:bg-[var(--color-accent-primary)]/30 transition-colors'
                        )}
                        title="Replace selection with this code"
                      >
                        <ClipboardPaste size={10} />
                        Apply
                      </button>
                    )}
                    {onInsertCode && (
                      <button
                        type="button"
                        onClick={handleInsert}
                        className={cn(
                          'p-1.5 rounded text-[9px] flex items-center gap-1',
                          'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]',
                          'hover:bg-[var(--color-surface-3)] transition-colors'
                        )}
                        title="Insert at cursor"
                      >
                        <FileCode size={10} />
                        Insert
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(result.code!)}
                      className={cn(
                        'p-1.5 rounded text-[9px] flex items-center gap-1',
                        'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]',
                        'hover:bg-[var(--color-surface-3)] transition-colors'
                      )}
                      title="Copy code"
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-3 rounded bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] overflow-x-auto">
                    <code className="text-[var(--color-text-primary)]">{result.code}</code>
                  </pre>
                </div>
              )}

              {/* Suggestions/Issues */}
              {result.suggestions && result.suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[var(--color-text-muted)] font-medium flex items-center gap-1">
                    <Info size={12} />
                    Issues Found ({result.suggestions.length})
                  </div>
                  {result.suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-2 rounded border',
                        suggestion.severity === 'high' && 'bg-[var(--color-error)]/5 border-[var(--color-error)]/20',
                        suggestion.severity === 'medium' && 'bg-[var(--color-warning)]/5 border-[var(--color-warning)]/20',
                        suggestion.severity === 'low' && 'bg-[var(--color-info)]/5 border-[var(--color-info)]/20'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-medium uppercase',
                          suggestion.severity === 'high' && 'bg-[var(--color-error)]/20 text-[var(--color-error)]',
                          suggestion.severity === 'medium' && 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]',
                          suggestion.severity === 'low' && 'bg-[var(--color-info)]/20 text-[var(--color-info)]'
                        )}>
                          {suggestion.severity}
                        </span>
                        <div className="flex-1">
                          <div className="text-[var(--color-text-primary)] font-medium">
                            {suggestion.title}
                            {suggestion.line && (
                              <span className="text-[var(--color-text-placeholder)] ml-2">
                                Line {suggestion.line}
                              </span>
                            )}
                          </div>
                          <div className="text-[var(--color-text-secondary)] mt-0.5">
                            {suggestion.description}
                          </div>
                          {suggestion.fix && (
                            <pre className="mt-2 p-2 rounded bg-[var(--color-surface-base)] text-[10px] overflow-x-auto">
                              <code>{suggestion.fix}</code>
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

AIResultPanel.displayName = 'AIResultPanel';
