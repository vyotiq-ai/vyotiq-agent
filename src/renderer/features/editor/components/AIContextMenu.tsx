/**
 * AIContextMenu Component
 * 
 * AI-powered actions submenu for the editor context menu with terminal-style aesthetics.
 */

import React, { memo, useCallback, useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  MessageSquare,
  Wand2,
  Bug,
  TestTube,
  FileText,
  Zap,
  Search,
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
    label: 'explain code',
    icon: <MessageSquare size={12} />,
    description: 'Get a clear explanation of what this code does',
    requiresSelection: true,
  },
  {
    action: 'refactor',
    label: 'refactor',
    icon: <Wand2 size={12} />,
    description: 'Improve code quality and readability',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'fix-errors',
    label: 'fix errors',
    icon: <Bug size={12} />,
    description: 'Identify and fix bugs in the code',
    requiresSelection: true,
  },
  {
    action: 'optimize',
    label: 'optimize',
    icon: <Zap size={12} />,
    description: 'Improve performance and efficiency',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'generate-tests',
    label: 'generate tests',
    icon: <TestTube size={12} />,
    description: 'Create unit tests for this code',
    requiresSelection: true,
  },
  {
    action: 'add-documentation',
    label: 'add documentation',
    icon: <FileText size={12} />,
    description: 'Generate JSDoc/TSDoc comments',
    requiresSelection: true,
    divider: true,
  },
  {
    action: 'find-issues',
    label: 'find issues',
    icon: <Search size={12} />,
    description: 'Scan for potential bugs and improvements',
    requiresSelection: false,
  },
  {
    action: 'summarize-file',
    label: 'summarize file',
    icon: <FileText size={12} />,
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    if (position.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    if (position.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menu.style.left = `${Math.max(8, adjustedX)}px`;
    menu.style.top = `${Math.max(8, adjustedY)}px`;
  }, [isOpen, position]);

  const handleItemClick = useCallback((action: EditorAIAction, disabled: boolean) => {
    if (disabled || isLoading) return;
    onAction(action);
    onClose();
  }, [onAction, onClose, isLoading]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[60] min-w-[160px] max-w-[220px] max-h-[60vh] overflow-y-auto',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.25)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-100',
        'scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent'
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="AI actions menu"
    >
      {/* Header */}
      <div className="sticky top-0 px-2.5 py-1.5 bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)]/30 rounded-t-lg">
        <div className="flex items-center gap-1.5">
          <Sparkles size={10} className="text-[var(--color-accent-primary)]" />
          <span className="text-[var(--color-text-muted)] text-[9px] uppercase tracking-wide">
            ai actions
          </span>
          {isLoading && (
            <Loader2 size={10} className="ml-auto animate-spin text-[var(--color-accent-primary)]" />
          )}
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {aiMenuItems.map((item, index) => {
          const isDisabled = item.requiresSelection && !hasSelection;
          const isHovered = hoveredIndex === index;

          return (
            <React.Fragment key={item.action}>
              <button
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-75',
                  'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]',
                  isDisabled 
                    ? 'text-[var(--color-text-dim)] cursor-not-allowed' 
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                  isHovered && !isDisabled && 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]',
                  isLoading && 'pointer-events-none opacity-50'
                )}
                onClick={() => handleItemClick(item.action, isDisabled)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                disabled={isDisabled || isLoading}
                role="menuitem"
                title={item.description}
              >
                <span className={cn(
                  'shrink-0 transition-colors duration-75',
                  isDisabled 
                    ? 'text-[var(--color-text-dim)]' 
                    : isHovered
                      ? 'text-[var(--color-accent-primary)]'
                      : 'text-[var(--color-text-muted)]'
                )}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
              {item.divider && (
                <div className="my-1 mx-2 border-t border-[var(--color-border-subtle)]/40" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Footer hint */}
      {!hasSelection && (
        <div className="sticky bottom-0 px-2.5 py-1.5 bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)]/30 rounded-b-lg">
          <span className="text-[9px] text-[var(--color-text-placeholder)]">
            select code for more actions
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
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left',
        'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
        'hover:text-[var(--color-text-primary)] transition-colors',
        'focus-visible:outline-none'
      )}
      onMouseEnter={handleMouseEnter}
      role="menuitem"
    >
      <Sparkles size={12} className="text-[var(--color-accent-primary)] shrink-0" />
      <span className="flex-1">ai actions</span>
      {isLoading ? (
        <Loader2 size={10} className="animate-spin text-[var(--color-accent-primary)]" />
      ) : (
        <ChevronRight size={10} className="text-[var(--color-text-placeholder)]" />
      )}
    </button>
  );
});

AISubmenuTrigger.displayName = 'AISubmenuTrigger';
