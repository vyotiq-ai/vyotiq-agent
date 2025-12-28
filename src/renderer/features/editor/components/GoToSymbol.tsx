/**
 * GoToSymbol Component
 * 
 * VS Code-style symbol picker (Ctrl+Shift+O).
 * Shows functions, classes, variables in current file.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, 
  X, 
  Box, 
  Code, 
  Braces, 
  Variable, 
  Hash, 
  Type as TypeIcon,
  Parentheses,
  FileCode,
  AtSign,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

// Re-export Search icon for external use
export { Search as SearchIcon };

export type SymbolKind = 
  | 'function' 
  | 'method' 
  | 'class' 
  | 'interface' 
  | 'variable' 
  | 'constant'
  | 'property'
  | 'enum'
  | 'type'
  | 'namespace'
  | 'module'
  | 'field';

export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  endLine?: number;
  detail?: string;
  containerName?: string;
  children?: DocumentSymbol[];
}

interface GoToSymbolProps {
  isOpen: boolean;
  onClose: () => void;
  symbols: DocumentSymbol[];
  onSymbolSelect: (symbol: DocumentSymbol) => void;
  currentLine?: number;
}

const symbolIcons: Record<SymbolKind, React.ElementType> = {
  function: Parentheses,
  method: Box,
  class: Braces,
  interface: Code,
  variable: Variable,
  constant: Hash,
  property: AtSign,
  enum: TypeIcon,
  type: TypeIcon,
  namespace: FileCode,
  module: FileCode,
  field: Variable,
};

const symbolColors: Record<SymbolKind, string> = {
  function: 'text-[var(--color-accent-secondary)]',
  method: 'text-[var(--color-accent-secondary)]',
  class: 'text-[var(--color-warning)]',
  interface: 'text-[var(--color-info)]',
  variable: 'text-[var(--color-accent-primary)]',
  constant: 'text-[var(--color-warning)]',
  property: 'text-[var(--color-accent-primary)]',
  enum: 'text-[var(--color-success)]',
  type: 'text-[var(--color-success)]',
  namespace: 'text-[var(--color-warning)]',
  module: 'text-[var(--color-warning)]',
  field: 'text-[var(--color-accent-primary)]',
};

/**
 * Flatten nested symbols for display
 */
function flattenSymbols(symbols: DocumentSymbol[], depth = 0): Array<DocumentSymbol & { depth: number }> {
  const result: Array<DocumentSymbol & { depth: number }> = [];
  
  for (const symbol of symbols) {
    result.push({ ...symbol, depth });
    if (symbol.children) {
      result.push(...flattenSymbols(symbol.children, depth + 1));
    }
  }
  
  return result;
}

/**
 * Fuzzy match for symbols
 */
function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  if (textLower === queryLower) return { match: true, score: 100 };
  if (textLower.startsWith(queryLower)) return { match: true, score: 90 };
  if (textLower.includes(queryLower)) return { match: true, score: 70 };
  
  // Fuzzy
  let queryIndex = 0;
  let score = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      score += 2;
      // Bonus for word boundary
      if (i === 0 || !textLower[i - 1].match(/[a-z]/i)) {
        score += 3;
      }
    }
  }
  
  return queryIndex === queryLower.length 
    ? { match: true, score: Math.min(score, 50) }
    : { match: false, score: 0 };
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
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
  
  return text;
}

export const GoToSymbol: React.FC<GoToSymbolProps> = ({
  isOpen,
  onClose,
  symbols,
  onSymbolSelect,
  currentLine,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterKind, setFilterKind] = useState<SymbolKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flatten and filter symbols
  const filteredSymbols = useMemo(() => {
    const flat = flattenSymbols(symbols);
    
    // Parse filter from query (e.g., "@:" for properties, "@f" for functions)
    let effectiveQuery = query;
    let kindFilter = filterKind;
    
    if (query.startsWith(':')) {
      // Filter by kind
      const kindMap: Record<string, SymbolKind> = {
        f: 'function',
        m: 'method',
        c: 'class',
        i: 'interface',
        v: 'variable',
        p: 'property',
        e: 'enum',
        t: 'type',
      };
      const kindChar = query[1]?.toLowerCase();
      if (kindChar && kindMap[kindChar]) {
        kindFilter = kindMap[kindChar];
        effectiveQuery = query.slice(2).trim();
      }
    }
    
    let filtered = flat;
    
    if (kindFilter) {
      filtered = filtered.filter(s => s.kind === kindFilter);
    }
    
    if (!effectiveQuery) {
      return filtered;
    }
    
    const scored = filtered
      .map(symbol => {
        const result = fuzzyMatch(effectiveQuery, symbol.name);
        return { symbol, ...result };
      })
      .filter(({ match }) => match)
      .sort((a, b) => b.score - a.score);
    
    return scored.map(({ symbol }) => symbol);
  }, [symbols, query, filterKind]);

  // Find symbol closest to current line
  useEffect(() => {
    if (isOpen && currentLine && filteredSymbols.length > 0) {
      const closest = filteredSymbols.reduce((prev, curr, index) => {
        const prevDist = Math.abs(prev.symbol.line - currentLine);
        const currDist = Math.abs(curr.line - currentLine);
        return currDist < prevDist ? { symbol: curr, index } : prev;
      }, { symbol: filteredSymbols[0], index: 0 });
      
      setSelectedIndex(closest.index);
    }
  }, [isOpen, currentLine, filteredSymbols]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFilterKind(null);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredSymbols.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredSymbols.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredSymbols[selectedIndex]) {
          onSymbolSelect(filteredSymbols[selectedIndex]);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredSymbols, selectedIndex, onSymbolSelect, onClose]);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-goto-symbol]')) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        data-goto-symbol
        className={cn(
          "relative w-[500px] max-w-[90vw] bg-[var(--color-surface-1)] rounded-lg shadow-2xl",
          "border border-[var(--color-border-subtle)] overflow-hidden",
          "animate-in fade-in slide-in-from-top-4 duration-150"
        )}
      >
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-muted)]">@</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to symbol... (type : to filter by kind)"
            className={cn(
              "flex-1 bg-transparent text-xs text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-placeholder)]",
              "outline-none"
            )}
            spellCheck={false}
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
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {filteredSymbols.length === 0 ? (
            <div className="px-3 py-8 text-center text-[var(--color-text-muted)] text-xs">
              No symbols found
            </div>
          ) : (
            filteredSymbols.map((symbol, index) => {
              const Icon = symbolIcons[symbol.kind] || Code;
              const colorClass = symbolColors[symbol.kind] || 'text-[var(--color-text-muted)]';
              
              return (
                <button
                  key={`${symbol.name}-${symbol.line}`}
                  onClick={() => {
                    onSymbolSelect(symbol);
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left",
                    "transition-colors",
                    index === selectedIndex
                      ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                  )}
                  style={{ paddingLeft: `${12 + symbol.depth * 16}px` }}
                >
                  <Icon size={14} className={cn("flex-shrink-0", colorClass)} />
                  <span className="flex-1 text-xs truncate">
                    {highlightMatch(symbol.name, query.replace(/^:.*?\s*/, ''))}
                  </span>
                  {symbol.detail && (
                    <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[150px]">
                      {symbol.detail}
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    :{symbol.line}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
            <span>:f function</span>
            <span>:c class</span>
            <span>:v variable</span>
            <span>:p property</span>
          </div>
          <div className="text-[9px] text-[var(--color-text-muted)]">
            {filteredSymbols.length} symbols
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoToSymbol;
