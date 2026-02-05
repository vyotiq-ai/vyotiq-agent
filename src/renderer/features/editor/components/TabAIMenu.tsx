/**
 * TabAIMenu Component
 * 
 * Dropdown menu for AI actions on the entire file.
 * Appears as a small AI icon button on each tab.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Sparkles,
  FileText,
  Search,
  TestTube,
  Bug,
  Wand2,
  X,
} from 'lucide-react';
import { Spinner } from '../../../components/ui/LoadingState';
import { cn } from '../../../utils/cn';
import type { EditorAIAction } from '../hooks/useEditorAI';

export interface TabAIMenuProps {
  filePath: string;
  language: string;
  onAction: (action: EditorAIAction) => void;
  isLoading?: boolean;
  className?: string;
}

interface TabAIMenuItem {
  action: EditorAIAction;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const tabAIMenuItems: TabAIMenuItem[] = [
  {
    action: 'summarize-file',
    label: 'Summarize File',
    icon: <FileText size={12} />,
    description: 'Get an overview of what this file does',
  },
  {
    action: 'find-issues',
    label: 'Find Issues',
    icon: <Search size={12} />,
    description: 'Scan for potential bugs and improvements',
  },
  {
    action: 'generate-tests',
    label: 'Generate Tests',
    icon: <TestTube size={12} />,
    description: 'Create unit tests for this file',
  },
  {
    action: 'fix-errors',
    label: 'Fix All Errors',
    icon: <Bug size={12} />,
    description: 'Attempt to fix all errors in the file',
  },
  {
    action: 'add-documentation',
    label: 'Document File',
    icon: <Wand2 size={12} />,
    description: 'Add documentation to all functions',
  },
];

export const TabAIMenu: React.FC<TabAIMenuProps> = memo(({
  filePath,
  language,
  onAction,
  isLoading = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  const handleAction = useCallback((action: EditorAIAction) => {
    onAction(action);
    setIsOpen(false);
  }, [onAction]);

  return (
    <div className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          'p-0.5 rounded transition-all duration-150',
          'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)]',
          'hover:bg-[var(--color-accent-primary)]/10',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
          isOpen && 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10',
          isLoading && 'pointer-events-none'
        )}
        title="AI Actions"
        aria-label="AI Actions"
        aria-expanded={isOpen}
      >
        {isLoading ? (
          <Spinner size="sm" className="w-3 h-3" />
        ) : (
          <Sparkles size={12} />
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'min-w-[180px] py-1',
            'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
            'rounded-md shadow-lg font-mono text-[10px]',
            'animate-in fade-in-0 slide-in-from-top-1 duration-100'
          )}
          role="menu"
          aria-label="Tab AI actions"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-1.5">
              <Sparkles size={10} className="text-[var(--color-accent-primary)]" />
              <span className="text-[var(--color-text-secondary)] font-medium">AI Actions</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-0.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
            >
              <X size={10} />
            </button>
          </div>

          {/* Menu items */}
          {tabAIMenuItems.map((item) => (
            <button
              key={item.action}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-left',
                'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
                'hover:text-[var(--color-text-primary)] transition-colors',
                'focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]'
              )}
              onClick={() => handleAction(item.action)}
              role="menuitem"
              title={item.description}
            >
              <span className="text-[var(--color-text-dim)] shrink-0">
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          ))}

          {/* File info */}
          <div className="px-2 py-1 border-t border-[var(--color-border-subtle)]">
            <span className="text-[8px] text-[var(--color-text-placeholder)] truncate block">
              {filePath.split('/').pop()} • {language}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

TabAIMenu.displayName = 'TabAIMenu';
