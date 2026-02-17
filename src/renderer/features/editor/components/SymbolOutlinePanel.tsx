/**
 * Symbol Outline Panel
 * 
 * VS Code-like document outline/symbol panel.
 * Shows symbols from the current file using LSP document symbols.
 * Supports click-to-navigate and hierarchical display.
 */

import React, { memo, useCallback, useEffect, useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown,
  Box, Hash, Braces, Variable, FunctionSquare,
  FileCode, Code2, Type, Puzzle, ListOrdered,
  Layers, Tag, Minus, Loader2,
} from 'lucide-react';
import * as monaco from 'monaco-editor';
import { cn } from '../../../utils/cn';
import { useEditorStore } from '../store/editorStore';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('SymbolOutline');

// =============================================================================
// Types
// =============================================================================

interface SymbolItem {
  name: string;
  kind: number;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  children?: SymbolItem[];
  detail?: string;
}

interface SymbolOutlinePanelProps {
  /** File path — if omitted, reads from active editor tab */
  filePath?: string | null;
  /** Navigate callback — if omitted, uses Monaco editor directly */
  onNavigate?: (line: number, column: number) => void;
}

// =============================================================================
// Symbol Kind Icons
// =============================================================================

const SYMBOL_KIND_ICONS: Record<number, React.ReactNode> = {
  1: <FileCode size={12} className="text-[var(--color-text-muted)]" />,      // File
  2: <Layers size={12} className="text-[#38bdf8]" />,                         // Module
  3: <Layers size={12} className="text-[#38bdf8]" />,                         // Namespace
  4: <Box size={12} className="text-[#f59e0b]" />,                            // Package
  5: <Braces size={12} className="text-[#38bdf8]" />,                         // Class
  6: <FunctionSquare size={12} className="text-[#c084fc]" />,                 // Method
  7: <Hash size={12} className="text-[#60a5fa]" />,                           // Property
  8: <Variable size={12} className="text-[#34d399]" />,                       // Field
  9: <Code2 size={12} className="text-[#38bdf8]" />,                          // Constructor
  10: <ListOrdered size={12} className="text-[#f59e0b]" />,                   // Enum
  11: <Type size={12} className="text-[#38bdf8]" />,                          // Interface
  12: <FunctionSquare size={12} className="text-[#c084fc]" />,                // Function
  13: <Variable size={12} className="text-[#e2e8f0]" />,                      // Variable
  14: <Hash size={12} className="text-[#94a3b8]" />,                          // Constant
  15: <Tag size={12} className="text-[#34d399]" />,                           // String
  16: <Hash size={12} className="text-[#f59e0b]" />,                          // Number
  17: <Puzzle size={12} className="text-[#60a5fa]" />,                        // Boolean
  18: <Layers size={12} className="text-[#94a3b8]" />,                        // Array
  19: <Braces size={12} className="text-[#94a3b8]" />,                        // Object
  20: <Minus size={12} className="text-[#94a3b8]" />,                         // Key
  21: <Minus size={12} className="text-[#94a3b8]" />,                         // Null
  22: <ListOrdered size={12} className="text-[#f59e0b]" />,                   // EnumMember
  23: <Braces size={12} className="text-[#38bdf8]" />,                        // Struct
  24: <Hash size={12} className="text-[#f87171]" />,                          // Event
  25: <Code2 size={12} className="text-[#94a3b8]" />,                         // Operator
  26: <Type size={12} className="text-[#c084fc]" />,                          // TypeParameter
};

function getSymbolIcon(kind: number): React.ReactNode {
  return SYMBOL_KIND_ICONS[kind] ?? <Code2 size={12} className="text-[var(--color-text-dim)]" />;
}

// =============================================================================
// Symbol Tree Item
// =============================================================================

interface SymbolTreeItemProps {
  symbol: SymbolItem;
  depth: number;
  onNavigate: (line: number, column: number) => void;
  activeLine?: number;
}

const SymbolTreeItem = memo<SymbolTreeItemProps>(({ symbol, depth, onNavigate, activeLine }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = symbol.children && symbol.children.length > 0;

  const isActive = activeLine !== undefined &&
    activeLine >= symbol.range.startLine &&
    activeLine <= symbol.range.endLine;

  const handleClick = useCallback(() => {
    const sel = symbol.selectionRange ?? symbol.range;
    onNavigate(sel.startLine + 1, sel.startColumn + 1);
  }, [symbol, onNavigate]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  }, []);

  return (
    <div>
      <button
        type="button"
        className={cn(
          'w-full flex items-center gap-1 py-0.5 pr-2 text-left transition-colors duration-75',
          'text-[10px] font-mono',
          isActive
            ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            onClick={handleToggle}
            className="shrink-0 p-0.5 rounded hover:bg-[var(--color-surface-3)]"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Icon */}
        <span className="shrink-0">{getSymbolIcon(symbol.kind)}</span>

        {/* Name */}
        <span className="truncate">{symbol.name}</span>

        {/* Detail */}
        {symbol.detail && (
          <span className="text-[var(--color-text-dim)] text-[9px] truncate ml-1">
            {symbol.detail}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {symbol.children!.map((child, i) => (
            <SymbolTreeItem
              key={`${child.name}-${child.kind}-${i}`}
              symbol={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              activeLine={activeLine}
            />
          ))}
        </div>
      )}
    </div>
  );
});
SymbolTreeItem.displayName = 'SymbolTreeItem';

// =============================================================================
// Symbol Outline Panel
// =============================================================================

export const SymbolOutlinePanel: React.FC<SymbolOutlinePanelProps> = memo(({
  filePath: filePathProp,
  onNavigate: onNavigateProp,
}) => {
  // Fall back to active editor tab if no filePath prop
  const { state } = useEditorStore();
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  const filePath = filePathProp ?? activeTab?.filePath ?? null;

  // Default navigate handler: find the right Monaco editor and jump
  const defaultNavigate = useCallback((line: number, column: number) => {
    if (!filePath) return;
    const editors = monaco.editor.getEditors();
    for (const editor of editors) {
      const model = editor.getModel();
      if (model && model.uri.path.includes(filePath.replace(/\\/g, '/'))) {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column });
        editor.focus();
        break;
      }
    }
  }, [filePath]);

  const onNavigate = onNavigateProp ?? defaultNavigate;

  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  // Fetch symbols when file changes
  useEffect(() => {
    if (!filePath) {
      setSymbols([]);
      return;
    }

    let cancelled = false;

    const fetchSymbols = async () => {
      setLoading(true);
      try {
        const result = await window.vyotiq?.lsp?.documentSymbols?.(filePath);
        if (!cancelled && result?.success && result.symbols) {
          // Map from LSP flat format to our SymbolItem tree format
          const mapSymbol = (sym: Record<string, unknown>): SymbolItem => ({
            name: sym.name as string,
            kind: typeof sym.kind === 'number' ? sym.kind : 0,
            range: {
              startLine: (sym.line as number) ?? (sym.startLine as number) ?? 0,
              startColumn: (sym.column as number) ?? (sym.startColumn as number) ?? 0,
              endLine: (sym.endLine as number) ?? (sym.line as number) ?? 0,
              endColumn: (sym.endColumn as number) ?? (sym.column as number) ?? 0,
            },
            selectionRange: sym.selectionRange ? sym.selectionRange as SymbolItem['selectionRange'] : undefined,
            children: Array.isArray(sym.children) ? sym.children.map(c => mapSymbol(c as Record<string, unknown>)) : undefined,
            detail: sym.containerName as string | undefined,
          });
          setSymbols((result.symbols as Record<string, unknown>[]).map(mapSymbol));
        }
      } catch (err) {
        logger.debug('Failed to fetch symbols', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSymbols();
    return () => { cancelled = true; };
  }, [filePath]);

  // Filter symbols
  const filteredSymbols = useMemo(() => {
    if (!filter.trim()) return symbols;
    const lower = filter.toLowerCase();
    const filterTree = (items: SymbolItem[]): SymbolItem[] => {
      return items.reduce<SymbolItem[]>((acc, sym) => {
        const nameMatch = sym.name.toLowerCase().includes(lower);
        const filteredChildren = sym.children ? filterTree(sym.children) : [];
        if (nameMatch || filteredChildren.length > 0) {
          acc.push({
            ...sym,
            children: nameMatch ? sym.children : filteredChildren,
          });
        }
        return acc;
      }, []);
    };
    return filterTree(symbols);
  }, [symbols, filter]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter input */}
      <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)]/30">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter symbols..."
          className={cn(
            'w-full bg-[var(--color-surface-2)] text-[10px] font-mono',
            'px-2 py-1 rounded border border-[var(--color-border-subtle)]/30',
            'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
            'focus:outline-none focus:border-[var(--color-accent-primary)]/50',
          )}
        />
      </div>

      {/* Symbol tree */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-text-dim)]">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[10px] font-mono text-[var(--color-text-dim)]">
            {filePath ? 'no symbols found' : 'no file open'}
          </div>
        ) : (
          filteredSymbols.map((sym, i) => (
            <SymbolTreeItem
              key={`${sym.name}-${sym.kind}-${i}`}
              symbol={sym}
              depth={0}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </div>
  );
});

SymbolOutlinePanel.displayName = 'SymbolOutlinePanel';
