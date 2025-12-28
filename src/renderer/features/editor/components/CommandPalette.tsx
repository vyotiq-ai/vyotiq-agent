/**
 * CommandPalette Component
 * 
 * VS Code-style command palette with fuzzy search.
 * Activated with Ctrl+Shift+P or F1.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, 
  File, 
  Settings, 
  Save, 
  FolderOpen,
  Palette,
  Terminal,
  GitBranch,
  Code,
  Keyboard,
  Moon,
  Sun,
  Type,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Copy,
  Scissors,
  Clipboard,
  FileText,
  Zap,
  Layout,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ElementType;
  shortcut?: string;
  category?: string;
  action: () => void;
  when?: () => boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
  /** Mode: 'commands' for command palette, 'files' for quick open */
  mode?: 'commands' | 'files';
}

/**
 * Simple fuzzy match scoring
 */
function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match gets highest score
  if (textLower === queryLower) return { match: true, score: 100 };
  
  // Starts with gets high score
  if (textLower.startsWith(queryLower)) return { match: true, score: 90 };
  
  // Contains gets medium score
  if (textLower.includes(queryLower)) return { match: true, score: 70 };
  
  // Fuzzy match - characters appear in order
  let queryIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      consecutiveMatches++;
      score += consecutiveMatches * 2; // Reward consecutive matches
    } else {
      consecutiveMatches = 0;
    }
  }
  
  if (queryIndex === queryLower.length) {
    return { match: true, score: Math.min(score, 60) };
  }
  
  return { match: false, score: 0 };
}

/**
 * Highlight matched characters in text
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Simple contains match highlight
  const index = textLower.indexOf(queryLower);
  if (index !== -1) {
    return (
      <>
        {text.slice(0, index)}
        <span className="text-[var(--color-accent-primary)] font-semibold">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  }
  
  // Fuzzy highlight
  const result: React.ReactNode[] = [];
  let queryIndex = 0;
  
  for (let i = 0; i < text.length; i++) {
    if (queryIndex < queryLower.length && textLower[i] === queryLower[queryIndex]) {
      result.push(
        <span key={i} className="text-[var(--color-accent-primary)] font-semibold">
          {text[i]}
        </span>
      );
      queryIndex++;
    } else {
      result.push(text[i]);
    }
  }
  
  return result;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  placeholder = 'Type a command...',
  mode = 'commands',
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    // Filter by visibility condition
    const visibleCommands = commands.filter(cmd => !cmd.when || cmd.when());
    
    if (!query) {
      return visibleCommands;
    }

    // Score and filter
    const scored = visibleCommands
      .map(cmd => {
        const labelMatch = fuzzyMatch(query, cmd.label);
        const categoryMatch = cmd.category ? fuzzyMatch(query, cmd.category) : { match: false, score: 0 };
        const descMatch = cmd.description ? fuzzyMatch(query, cmd.description) : { match: false, score: 0 };
        
        const match = labelMatch.match || categoryMatch.match || descMatch.match;
        const score = Math.max(labelMatch.score, categoryMatch.score * 0.5, descMatch.score * 0.3);
        
        return { cmd, match, score };
      })
      .filter(({ match }) => match)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ cmd }) => cmd);
  }, [commands, query]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Delay focus to ensure the element is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        // Tab cycles through like arrow down
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        break;
    }
  }, [filteredCommands, selectedIndex, onClose]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-command-palette]')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Group commands by category - must be before early return to follow hooks rules
  const groupedCommands = useMemo(() => {
    if (mode === 'files') return null;
    
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(cmd => {
      const category = cmd.category || 'General';
      if (!groups[category]) groups[category] = [];
      groups[category].push(cmd);
    });
    return groups;
  }, [filteredCommands, mode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Palette */}
      <div 
        data-command-palette
        className={cn(
          "relative w-[600px] max-w-[90vw] bg-[var(--color-surface-1)] rounded-lg shadow-2xl",
          "border border-[var(--color-border-subtle)] overflow-hidden",
          "animate-in fade-in slide-in-from-top-4 duration-150"
        )}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]">
          <Search size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "flex-1 bg-transparent text-xs text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-placeholder)]",
              "outline-none"
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div 
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-8 text-center text-[var(--color-text-muted)] text-xs">
              No commands found
            </div>
          ) : mode === 'commands' && groupedCommands ? (
            // Grouped view for commands
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-3 py-1 text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const Icon = cmd.icon || ChevronRight;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-left",
                        "transition-colors",
                        globalIndex === selectedIndex
                          ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                      )}
                    >
                      <Icon size={14} className="flex-shrink-0 text-[var(--color-text-muted)]" />
                      <span className="flex-1 text-xs truncate">
                        {highlightMatch(cmd.label, query)}
                      </span>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-muted)]">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            // Flat view for files
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon || File;
              return (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left",
                    "transition-colors",
                    index === selectedIndex
                      ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                  )}
                >
                  <Icon size={14} className="flex-shrink-0 text-[var(--color-text-muted)]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">
                      {highlightMatch(cmd.label, query)}
                    </div>
                    {cmd.description && (
                      <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-muted)]">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)]">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)]">esc</kbd>
              close
            </span>
          </div>
          <div className="text-[9px] text-[var(--color-text-muted)]">
            {filteredCommands.length} commands
          </div>
        </div>
      </div>
    </div>
  );
};

// Export common command icons for use in command definitions
export const CommandIcons = {
  Search,
  File,
  Settings,
  Save,
  FolderOpen,
  Palette,
  Terminal,
  GitBranch,
  Code,
  Keyboard,
  Moon,
  Sun,
  Type,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Copy,
  Scissors,
  Clipboard,
  FileText,
  Zap,
  Layout,
};

export default CommandPalette;
