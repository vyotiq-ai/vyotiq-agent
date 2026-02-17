/**
 * Editor Context Menu Component
 * 
 * VS Code-like right-click context menu for the code editor with:
 * - Go to Definition / Type Definition / Implementation
 * - Find All References
 * - Peek Definition
 * - Rename Symbol
 * - Format Document
 * - Code Actions / Quick Fix
 * - Cut / Copy / Paste
 * - Select All
 * - Command Palette trigger
 */

import React, { useRef, useEffect, useCallback, memo, useState } from 'react';
import {
  ArrowRight,
  Search,
  Text,
  Scissors,
  Copy,
  ClipboardPaste,
  CheckSquare,
  Wand2,
  PenLine,
  FileCode,
  Terminal,
  Command,
  MousePointerClick,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export type EditorContextAction =
  | 'goToDefinition'
  | 'goToTypeDefinition'
  | 'goToImplementation'
  | 'findReferences'
  | 'peekDefinition'
  | 'peekReferences'
  | 'renameSymbol'
  | 'formatDocument'
  | 'formatSelection'
  | 'codeAction'
  | 'quickFix'
  | 'refactor'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'goToLine'
  | 'goToSymbol'
  | 'commandPalette'
  | 'changeLanguage'
  | 'toggleWordWrap'
  | 'revealInExplorer';

interface EditorContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  filePath: string | null;
  hasSelection: boolean;
  onAction: (action: EditorContextAction) => void;
  onClose: () => void;
}

// =============================================================================
// Menu Item Component
// =============================================================================

interface MenuItemProps {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  hasSubmenu?: boolean;
}

const MenuItem = memo<MenuItemProps>(({ label, icon, shortcut, disabled, onClick, hasSubmenu }) => (
  <button
    type="button"
    className={cn(
      'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-75 text-[11px] font-mono',
      disabled
        ? 'text-[var(--color-text-dim)] cursor-not-allowed'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
    )}
    onClick={() => !disabled && onClick()}
    disabled={disabled}
    role="menuitem"
  >
    <span className="shrink-0 text-[var(--color-text-muted)] w-4 flex justify-center">{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    {shortcut && (
      <span className="text-[9px] shrink-0 ml-3 text-[var(--color-text-placeholder)] opacity-50">
        {shortcut}
      </span>
    )}
    {hasSubmenu && (
      <ChevronRight size={10} className="shrink-0 text-[var(--color-text-dim)]" />
    )}
  </button>
));
MenuItem.displayName = 'MenuItem';

// =============================================================================
// Divider
// =============================================================================

const MenuDivider = memo(() => (
  <div className="my-1 mx-2 border-t border-[var(--color-border-subtle)]/40" />
));
MenuDivider.displayName = 'MenuDivider';

// =============================================================================
// Editor Context Menu
// =============================================================================

export const EditorContextMenu: React.FC<EditorContextMenuProps> = memo(({
  isOpen,
  position,
  filePath,
  hasSelection,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handle), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handle);
    };
  }, [isOpen, onClose]);

  // Position adjustment
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }, [isOpen, position]);

  const handleAction = useCallback((action: EditorContextAction) => {
    onAction(action);
    onClose();
  }, [onAction, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[220px] max-w-[300px]',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.25)] font-mono',
        'animate-in fade-in-0 slide-in-from-top-1 duration-100',
      )}
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      <div className="py-1">
        {/* Navigation group */}
        <MenuItem
          label="Go to Definition"
          icon={<ArrowRight size={12} />}
          shortcut="F12"
          onClick={() => handleAction('goToDefinition')}
        />
        <MenuItem
          label="Go to Type Definition"
          icon={<ArrowRight size={12} />}
          onClick={() => handleAction('goToTypeDefinition')}
        />
        <MenuItem
          label="Go to Implementations"
          icon={<ArrowRight size={12} />}
          shortcut="Ctrl+F12"
          onClick={() => handleAction('goToImplementation')}
        />

        <MenuDivider />

        {/* References */}
        <MenuItem
          label="Find All References"
          icon={<Search size={12} />}
          shortcut="Shift+F12"
          onClick={() => handleAction('findReferences')}
        />
        <MenuItem
          label="Peek Definition"
          icon={<MousePointerClick size={12} />}
          shortcut="Alt+F12"
          onClick={() => handleAction('peekDefinition')}
        />
        <MenuItem
          label="Peek References"
          icon={<Search size={12} />}
          onClick={() => handleAction('peekReferences')}
        />

        <MenuDivider />

        {/* Edit actions */}
        <MenuItem
          label="Rename Symbol"
          icon={<PenLine size={12} />}
          shortcut="F2"
          onClick={() => handleAction('renameSymbol')}
        />
        <MenuItem
          label="Quick Fix..."
          icon={<Wand2 size={12} />}
          shortcut="Ctrl+."
          onClick={() => handleAction('quickFix')}
        />
        <MenuItem
          label="Refactor..."
          icon={<Wand2 size={12} />}
          shortcut="Ctrl+Shift+R"
          onClick={() => handleAction('refactor')}
        />

        <MenuDivider />

        {/* Format */}
        <MenuItem
          label="Format Document"
          icon={<FileCode size={12} />}
          shortcut="Shift+Alt+F"
          onClick={() => handleAction('formatDocument')}
        />
        {hasSelection && (
          <MenuItem
            label="Format Selection"
            icon={<FileCode size={12} />}
            shortcut="Ctrl+K Ctrl+F"
            onClick={() => handleAction('formatSelection')}
          />
        )}

        <MenuDivider />

        {/* Clipboard */}
        <MenuItem
          label="Cut"
          icon={<Scissors size={12} />}
          shortcut="Ctrl+X"
          onClick={() => handleAction('cut')}
        />
        <MenuItem
          label="Copy"
          icon={<Copy size={12} />}
          shortcut="Ctrl+C"
          onClick={() => handleAction('copy')}
        />
        <MenuItem
          label="Paste"
          icon={<ClipboardPaste size={12} />}
          shortcut="Ctrl+V"
          onClick={() => handleAction('paste')}
        />

        <MenuDivider />

        {/* Misc */}
        <MenuItem
          label="Go to Line..."
          icon={<Text size={12} />}
          shortcut="Ctrl+G"
          onClick={() => handleAction('goToLine')}
        />
        <MenuItem
          label="Go to Symbol..."
          icon={<Text size={12} />}
          shortcut="Ctrl+Shift+O"
          onClick={() => handleAction('goToSymbol')}
        />
        <MenuItem
          label="Command Palette"
          icon={<Command size={12} />}
          shortcut="Ctrl+Shift+P"
          onClick={() => handleAction('commandPalette')}
        />

        {filePath && (
          <>
            <MenuDivider />
            <MenuItem
              label="Reveal in File Explorer"
              icon={<Terminal size={12} />}
              onClick={() => handleAction('revealInExplorer')}
            />
          </>
        )}
      </div>
    </div>
  );
});

EditorContextMenu.displayName = 'EditorContextMenu';
