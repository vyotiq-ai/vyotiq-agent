/**
 * AIContextMenu Component
 * 
 * AI-powered actions submenu for the editor context menu.
 * Provides quick access to AI features like explain, refactor, fix, etc.
 */

import React, { memo, useCallback, useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  Wand2,
  Bug,
  TestTube,
  FileText,
  Zap,
  Search,
  ArrowRight,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { EditorAIAction } from '../hooks/useEditorAI';

export interface AIContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  hasSelection: boolean;
  onAction: (action: EditorAIAction) => void;
  onClose: () => void;
  isLoading?: boolean;
}

interface AIMenuItem {
  action: EditorAIAction;
  label: string;
  icon: React.ReactNode;
  description: string;
  requiresSelection?: boolean;
  divider?: boolean;
}

const aiMenuItems: AIMenuItem[] = [
  {
    action: 'explain',
    label: 'Explain Code',
    icon: <MessageSquare size={14} />,
    description: 'Get a clear explanation of what this code does',
    requiresSelection: true,
  },
  {
    action: 'refactor',
    label: 'Refactor',
    icon: <Wand2 size={14} />,
    description: 'Improve code quality and readability',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'fix-errors',
    label: 'Fix Errors',
    icon: <Bug size={14} />,
    description: 'Identify and fix bugs in the code',
    requiresSelection: true,
  },
  {
    action: 'optimize',
    label: 'Optimize',
    icon: <Zap size={14} />,
    description: 'Improve performance and efficiency',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'generate-tests',
    label: 'Generate Tests',
    icon: <TestTube size={14} />,
    description: 'Create unit tests for this code',
    requiresSelection: true,
  },
  {
    action: 'add-documentation',
    label: 'Add Documentation',
    icon: <FileText size={14} />,
    description: 'Generate JSDoc/TSDoc comments',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'find-issues',
    label: 'Find Issues',
    icon: <Search size={14} />,
    description: 'Scan for potential bugs and improvements',
    requiresSelection: false,
  },
  {
    action: 'summarize-file',
    label: 'Summarize File',
    icon: <FileText size={14} />,
    description: 'Get an overview of what this file does',
    requiresSelection: false,
  },
];

export const AIContextMenu: React.FC<AIContextMenuProps> = memo(({
  isOpen,
  position,
  hasSelection,
  onAction,
  onClose,
  isLoading = false,
}) => {
  const [hoveredItem, setHoveredItem] = useState<EditorAIAction | null>(null);

  const handleItemClick = useCallback((action: EditorAIAction, disabled: boolean) => {
    if (disabled || isLoading) return;
    onAction(action);
    onClose();
  }, [onAction, onClose, isLoading]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed z-[60] min-w-[220px] py-1',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
        'rounded-md shadow-xl font-mono text-[11px]',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="AI actions menu"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-subtle)]">
        <Sparkles size={12} className="text-[var(--color-accent-primary)]" />
        <span className="text-[var(--color-text-primary)] font-medium">AI Actions</span>
        {isLoading && (
          <Loader2 size={12} className="ml-auto animate-spin text-[var(--color-accent-primary)]" />
        )}
      </div>

      {/* Menu items */}
      <div className="py-1">
        {aiMenuItems.map((item) => {
          const isDisabled = item.requiresSelection && !hasSelection;
          const isHovered = hoveredItem === item.action;

          return (
            <React.Fragment key={item.action}>
              <button
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left',
                  'text-[var(--color-text-secondary)] transition-colors',
                  !isDisabled && 'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                  'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
                  isDisabled && 'opacity-40 cursor-not-allowed',
                  isLoading && 'pointer-events-none'
                )}
                onClick={() => handleItemClick(item.action, isDisabled)}
                onMouseEnter={() => setHoveredItem(item.action)}
                onMouseLeave={() => setHoveredItem(null)}
                disabled={isDisabled || isLoading}
                role="menuitem"
                title={item.description}
              >
                <span className={cn(
                  'shrink-0',
                  isHovered && !isDisabled ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                )}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {isHovered && !isDisabled && (
                  <ArrowRight size={10} className="text-[var(--color-text-placeholder)]" />
                )}
              </button>
              {item.divider && (
                <div className="my-1 border-t border-[var(--color-border-subtle)]" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Footer hint */}
      {!hasSelection && (
        <div className="px-3 py-1.5 border-t border-[var(--color-border-subtle)]">
          <span className="text-[9px] text-[var(--color-text-placeholder)]">
            Select code for more actions
          </span>
        </div>
      )}
    </div>
  );
});

AIContextMenu.displayName = 'AIContextMenu';

/**
 * AI Submenu Trigger for the main context menu
 */
export interface AISubmenuTriggerProps {
  onOpenSubmenu: (position: { x: number; y: number }) => void;
  isLoading?: boolean;
}

export const AISubmenuTrigger: React.FC<AISubmenuTriggerProps> = memo(({
  onOpenSubmenu,
  isLoading = false,
}) => {
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onOpenSubmenu({ x: rect.right + 4, y: rect.top });
  }, [onOpenSubmenu]);

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left',
        'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
        'hover:text-[var(--color-text-primary)] transition-colors',
        'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]'
      )}
      onMouseEnter={handleMouseEnter}
      role="menuitem"
    >
      <Sparkles size={14} className="text-[var(--color-accent-primary)] shrink-0" />
      <span className="flex-1">AI Actions</span>
      {isLoading ? (
        <Loader2 size={12} className="animate-spin text-[var(--color-accent-primary)]" />
      ) : (
        <ChevronRight size={12} className="text-[var(--color-text-placeholder)]" />
      )}
    </button>
  );
});

AISubmenuTrigger.displayName = 'AISubmenuTrigger';
