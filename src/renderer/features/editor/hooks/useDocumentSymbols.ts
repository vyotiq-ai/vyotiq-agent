/**
 * useDocumentSymbols Hook
 * 
 * Extracts symbols (functions, classes, variables) from Monaco editor
 * using the TypeScript language service.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as monaco from 'monaco-editor';
import type { DocumentSymbol, SymbolKind } from '../components/GoToSymbol';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('DocumentSymbols');

interface UseDocumentSymbolsOptions {
  /** The Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor | null;
  /** Update interval in ms */
  updateInterval?: number;
}

interface UseDocumentSymbolsReturn {
  symbols: DocumentSymbol[];
  currentSymbol: DocumentSymbol | null;
  symbolPath: DocumentSymbol[];
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Convert Monaco SymbolKind to our SymbolKind
 */
function convertSymbolKind(kind: monaco.languages.SymbolKind): SymbolKind {
  switch (kind) {
    case monaco.languages.SymbolKind.Function:
      return 'function';
    case monaco.languages.SymbolKind.Method:
      return 'method';
    case monaco.languages.SymbolKind.Class:
      return 'class';
    case monaco.languages.SymbolKind.Interface:
      return 'interface';
    case monaco.languages.SymbolKind.Variable:
      return 'variable';
    case monaco.languages.SymbolKind.Constant:
      return 'constant';
    case monaco.languages.SymbolKind.Property:
      return 'property';
    case monaco.languages.SymbolKind.Enum:
      return 'enum';
    case monaco.languages.SymbolKind.TypeParameter:
      return 'type';
    case monaco.languages.SymbolKind.Namespace:
      return 'namespace';
    case monaco.languages.SymbolKind.Module:
      return 'module';
    case monaco.languages.SymbolKind.Field:
      return 'field';
    default:
      return 'variable';
  }
}

/**
 * Convert Monaco DocumentSymbol to our DocumentSymbol
 * Reserved for future use when Monaco's DocumentSymbolProvider API is properly integrated
 */
function _convertSymbol(symbol: monaco.languages.DocumentSymbol): DocumentSymbol {
  return {
    name: symbol.name,
    kind: convertSymbolKind(symbol.kind),
    line: symbol.range.startLineNumber,
    column: symbol.range.startColumn,
    endLine: symbol.range.endLineNumber,
    detail: symbol.detail,
    children: symbol.children?.map(_convertSymbol),
  };
}

/**
 * Find symbol at a specific line
 */
function findSymbolAtLine(symbols: DocumentSymbol[], line: number): DocumentSymbol | null {
  for (const symbol of symbols) {
    const endLine = symbol.endLine || symbol.line;
    
    if (line >= symbol.line && line <= endLine) {
      // Check children first for more specific match
      if (symbol.children) {
        const childMatch = findSymbolAtLine(symbol.children, line);
        if (childMatch) return childMatch;
      }
      return symbol;
    }
  }
  return null;
}

/**
 * Get the symbol path (hierarchy) for a specific line
 */
function getSymbolPath(symbols: DocumentSymbol[], line: number, path: DocumentSymbol[] = []): DocumentSymbol[] {
  for (const symbol of symbols) {
    const endLine = symbol.endLine || symbol.line;
    
    if (line >= symbol.line && line <= endLine) {
      const newPath = [...path, symbol];
      
      if (symbol.children) {
        const childPath = getSymbolPath(symbol.children, line, newPath);
        if (childPath.length > newPath.length) return childPath;
      }
      
      return newPath;
    }
  }
  return path;
}

export function useDocumentSymbols(options: UseDocumentSymbolsOptions): UseDocumentSymbolsReturn {
  const { editor, updateInterval = 1000 } = options;
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([]);
  const [currentSymbol, setCurrentSymbol] = useState<DocumentSymbol | null>(null);
  const [symbolPath, setSymbolPath] = useState<DocumentSymbol[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  // Fetch symbols from Monaco
  const fetchSymbols = useCallback(async () => {
    if (!editor) return;
    
    const model = editor.getModel();
    if (!model) return;

    setIsLoading(true);
    
    try {
      // Use the outline provider to get document symbols
      // Note: Monaco doesn't directly expose getDocumentSymbols on monaco.languages
      // We need to use the DocumentSymbolProvider through commands
      const allProviders = monaco.languages.getLanguages();
      const currentLanguageId = model.getLanguageId();
      
      // Check if we have language support for this file
      const hasLanguageSupport = allProviders.some(p => p.id === currentLanguageId);
      
      // Try to get symbols via Monaco's built-in outline model
      const symbols: DocumentSymbol[] = [];
      
      // Use Monaco's document symbol provider if available
      if (hasLanguageSupport) {
        // Monaco's DocumentSymbolProvider is accessed through editor commands
        // Note: Direct API isn't available, using regex fallback
        // Future: Integrate with Monaco's outline model when API is available
      }
      
      // Extract symbols from text using regex patterns
      const content = model.getValue();
      const lines = content.split('\n');
      
      const patterns = [
        { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, kind: 'function' as const },
        { regex: /^(?:export\s+)?class\s+(\w+)/m, kind: 'class' as const },
        { regex: /^(?:export\s+)?interface\s+(\w+)/m, kind: 'interface' as const },
        { regex: /^(?:export\s+)?type\s+(\w+)\s*=/m, kind: 'type' as const },
        { regex: /^(?:export\s+)?const\s+(\w+)\s*[:=]/m, kind: 'constant' as const },
        { regex: /^(?:export\s+)?(?:let|var)\s+(\w+)/m, kind: 'variable' as const },
        { regex: /^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(/m, kind: 'method' as const },
      ];

      lines.forEach((line, index) => {
        for (const { regex, kind } of patterns) {
          const match = line.match(regex);
          if (match) {
            symbols.push({
              name: match[1],
              kind,
              line: index + 1,
              column: line.indexOf(match[1]) + 1,
            });
            break;
          }
        }
      });
      
      setSymbols(symbols);
      
      // Update current symbol based on cursor position
      const position = editor.getPosition();
      if (position) {
        const current = findSymbolAtLine(symbols, position.lineNumber);
        setCurrentSymbol(current);
        setSymbolPath(getSymbolPath(symbols, position.lineNumber));
      }
    } catch (error) {
      logger.error('Failed to get document symbols', { error });
    } finally {
      setIsLoading(false);
    }
  }, [editor]);

  // Initial fetch and interval updates
  useEffect(() => {
    if (!editor) return;

    fetchSymbols();

    const interval = setInterval(fetchSymbols, updateInterval);
    
    return () => clearInterval(interval);
  }, [editor, fetchSymbols, updateInterval]);

  // Update current symbol on cursor change
  useEffect(() => {
    if (!editor) return;

    const disposable = editor.onDidChangeCursorPosition((e) => {
      const line = e.position.lineNumber;
      const current = findSymbolAtLine(symbolsRef.current, line);
      setCurrentSymbol(current);
      setSymbolPath(getSymbolPath(symbolsRef.current, line));
    });

    return () => disposable.dispose();
  }, [editor]);

  // Refresh on content change (debounced by interval)
  useEffect(() => {
    if (!editor) return;

    const disposable = editor.onDidChangeModelContent(() => {
      // The interval will handle refreshing
    });

    return () => disposable.dispose();
  }, [editor]);

  return {
    symbols,
    currentSymbol,
    symbolPath,
    isLoading,
    refresh: fetchSymbols,
  };
}

export default useDocumentSymbols;
