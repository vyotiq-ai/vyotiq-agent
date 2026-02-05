/**
 * Command Palette Component
 * 
 * Quick access to all actions via Ctrl+K.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  FileText,
  FolderOpen,
  Globe,
  History,
  Keyboard,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { cn } from '../../utils/cn';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

const CATEGORY_ORDER = ['Session', 'Navigation', 'Panels', 'Actions', 'Settings'];

export const CommandPalette: React.FC<CommandPaletteProps> = memo(({
  isOpen,
  onClose,
  commands,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and group commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands.filter(c => !c.disabled);
    const q = query.toLowerCase();
    return commands.filter(c => 
      !c.disabled && (
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      )
    );
  }, [commands, query]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return CATEGORY_ORDER
      .filter(cat => groups[cat]?.length > 0)
      .map(cat => ({ category: cat, items: groups[cat] }));
  }, [filteredCommands]);

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => 
    groupedCommands.flatMap(g => g.items),
    [groupedCommands]
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    onClose();
    setTimeout(() => cmd.action(), 50);
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          executeCommand(flatCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatCommands, selectedIndex, executeCommand, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      
      {/* Palette */}
      <div 
        className={cn(
          'relative w-[560px] max-h-[60vh] flex flex-col',
          'bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]',
          'rounded-xl shadow-2xl overflow-hidden',
          'animate-scale-in'
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <Search size={18} className="text-[var(--color-text-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className={cn(
              'flex-1 bg-transparent text-xs',
              'text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)]',
              'outline-none'
            )}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            role="combobox"
            aria-expanded="true"
            aria-activedescendant={flatCommands[selectedIndex] ? `cmd-${flatCommands[selectedIndex].id}` : undefined}
          />
          <kbd className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]" aria-hidden="true">
            ESC
          </kbd>
        </div>

        {/* Commands list */}
        <div 
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Available commands"
          className="flex-1 overflow-y-auto py-2 scrollbar-thin"
        >
          {groupedCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-[11px] text-[var(--color-text-muted)]" role="status">
              No commands found
            </div>
          ) : (
            groupedCommands.map(group => (
              <div key={group.category} role="group" aria-labelledby={`group-${group.category}`}>
                <div 
                  id={`group-${group.category}`}
                  className="px-4 py-1.5 text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-wider"
                >
                  {group.category}
                </div>
                {group.items.map((cmd) => {
                  const globalIdx = flatCommands.indexOf(cmd);
                  const isSelected = globalIdx === selectedIndex;
                  
                  return (
                    <button
                      key={cmd.id}
                      id={`cmd-${cmd.id}`}
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      onClick={() => executeCommand(cmd)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2 text-left',
                        'transition-colors',
                        isSelected 
                          ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]'
                      )}
                    >
                      <span className={cn(
                        'flex-shrink-0',
                        isSelected ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]'
                      )} aria-hidden="true">
                        {cmd.icon || <Command size={16} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className={cn(
                          'px-1.5 py-0.5 text-[10px] rounded',
                          'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
                          isSelected ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                        )}>
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-surface-2)]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-surface-2)]">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-[var(--color-surface-2)]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

CommandPalette.displayName = 'CommandPalette';

// Default command icons
export const CommandIcons = {
  newSession: <Plus size={16} />,
  settings: <Settings size={16} />,
  terminal: <Terminal size={16} />,
  browser: <Globe size={16} />,
  history: <History size={16} />,
  shortcuts: <Keyboard size={16} />,
  undo: <RotateCcw size={16} />,
  clear: <Trash2 size={16} />,
  search: <Search size={16} />,
  file: <FileText size={16} />,
  folder: <FolderOpen size={16} />,
  chat: <MessageSquare size={16} />,
  yolo: <Zap size={16} />,
};

export default CommandPalette;
