/**
 * SelectionToolbar Component
 * 
 * Floating toolbar that appears when text is selected in the editor.
 * Provides quick access to AI actions for the selected code.
 */

import React, { memo, useCallback, useState, useEffect } from 'react';
import {
  Sparkles,
  MessageSquare,
  Wand2,
  Bug,
  TestTube,
  FileText,
  Zap,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { EditorAIAction } from '../hooks/useEditorAI';

export interface SelectionToolbarProps {
  isVisible: boolean;
  position: { x: number; y: number };
  selectedText: string;
  onAction: (action: EditorAIAction) => void;
  onClose: () => void;
  isLoading?: boolean;
}

interface ToolbarAction {
  action: EditorAIAction;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}

const toolbarActions: ToolbarAction[] = [
  {
    action: 'explain',
    icon: <MessageSquare size={12} />,
    label: 'Explain',
    tooltip: 'Explain this code',
  },
  {
    action: 'refactor',
    icon: <Wand2 size={12} />,
    label: 'Refactor',
    tooltip: 'Refactor this code',
  },
  {
    action: 'fix-errors',
    icon: <Bug size={12} />,
    label: 'Fix',
    tooltip: 'Fix errors in this code',
  },
  {
    action: 'optimize',
    icon: <Zap size={12} />,
    label: 'Optimize',
    tooltip: 'Optimize this code',
  },
  {
    action: 'generate-tests',
    icon: <TestTube size={12} />,
    label: 'Tests',
    tooltip: 'Generate tests',
  },
  {
    action: 'add-documentation',
    icon: <FileText size={12} />,
    label: 'Docs',
    tooltip: 'Add documentation',
  },
];

export const SelectionToolbar: React.FC<SelectionToolbarProps> = memo(({
  isVisible,
  position,
  selectedText,
  onAction,
  onClose,
  isLoading = false,
}) => {
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isVisible) return;

    const toolbarWidth = 320;
    const toolbarHeight = 36;
    const padding = 8;

    let x = position.x - toolbarWidth / 2;
    let y = position.y - toolbarHeight - 8;

    // Keep within horizontal bounds
    if (x < padding) x = padding;
    if (x + toolbarWidth > window.innerWidth - padding) {
      x = window.innerWidth - toolbarWidth - padding;
    }

    // If would go above viewport, show below selection
    if (y < padding) {
      y = position.y + 20;
    }

    setAdjustedPosition({ x, y });
  }, [isVisible, position]);

  const handleAction = useCallback((action: EditorAIAction) => {
    if (isLoading) return;
    onAction(action);
  }, [onAction, isLoading]);

  if (!isVisible || !selectedText || selectedText.trim().length < 3) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed z-[100] flex items-center gap-0.5 px-1.5 py-1',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
        'rounded-lg shadow-xl font-mono',
        'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150'
      )}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      role="toolbar"
      aria-label="Selection AI actions"
    >
      {/* AI indicator */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 mr-1 rounded bg-[var(--color-accent-primary)]/10">
        {isLoading ? (
          <Loader2 size={10} className="animate-spin text-[var(--color-accent-primary)]" />
        ) : (
          <Sparkles size={10} className="text-[var(--color-accent-primary)]" />
        )}
        <span className="text-[9px] text-[var(--color-accent-primary)] font-medium">AI</span>
      </div>

      {/* Action buttons */}
      {toolbarActions.map((item) => (
        <button
          key={item.action}
          type="button"
          onClick={() => handleAction(item.action)}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded transition-colors',
            'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            'hover:bg-[var(--color-surface-2)]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
          title={item.tooltip}
        >
          <span className="text-[var(--color-text-dim)]">{item.icon}</span>
          <span className="text-[9px] font-medium">{item.label}</span>
        </button>
      ))}

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'ml-1 p-1 rounded transition-colors',
          'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
          'hover:bg-[var(--color-surface-2)]'
        )}
        title="Close"
      >
        <X size={10} />
      </button>
    </div>
  );
});

SelectionToolbar.displayName = 'SelectionToolbar';
