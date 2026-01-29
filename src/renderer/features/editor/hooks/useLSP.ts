/**
 * useLSP Hook
 * 
 * Integrates Monaco Editor with the backend LSP manager.
 * Provides real-time diagnostics, hover, go-to-definition, and completions
 * from language servers for multi-language support.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as monaco from 'monaco-editor';

export interface LSPDiagnostic {
  filePath: string;
  fileName?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

export interface LSPHover {
  contents: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface LSPLocation {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface LSPSymbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  containerName?: string;
  children?: LSPSymbol[] | unknown[];
}

interface UseLSPOptions {
  /** File path for the current document */
  filePath: string;
  /** Language ID */
  language: string;
  /** Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor | null;
  /** Whether LSP is enabled */
  enabled?: boolean;
}

interface UseLSPReturn {
  /** Whether LSP is available for this language */
  isAvailable: boolean;
  /** Whether LSP server is running */
  isRunning: boolean;
  /** Current diagnostics for the file */
  diagnostics: LSPDiagnostic[];
  /** Get hover info at position */
  getHover: (line: number, column: number) => Promise<LSPHover | null>;
  /** Get definition locations */
  getDefinition: (line: number, column: number) => Promise<LSPLocation[]>;
  /** Get references */
  getReferences: (line: number, column: number) => Promise<LSPLocation[]>;
  /** Get document symbols */
  getSymbols: () => Promise<LSPSymbol[]>;
  /** Open document in LSP */
  openDocument: (content: string) => Promise<void>;
  /** Update document in LSP */
  updateDocument: (content: string) => void;
  /** Close document in LSP */
  closeDocument: () => void;
}

// Map LSP severity to Monaco severity
function toMonacoSeverity(severity: string): monaco.MarkerSeverity {
  switch (severity) {
    case 'error': return monaco.MarkerSeverity.Error;
    case 'warning': return monaco.MarkerSeverity.Warning;
    case 'info': return monaco.MarkerSeverity.Info;
    case 'hint': return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Info;
  }
}

export function useLSP(options: UseLSPOptions): UseLSPReturn {
  const { filePath, language, editor, enabled = true } = options;
  
  const [isAvailable, setIsAvailable] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<LSPDiagnostic[]>([]);
  
  const documentOpenRef = useRef(false);
  const lastContentRef = useRef<string>('');

  // Check if LSP is available for this language
  useEffect(() => {
    if (!enabled) {
      setIsAvailable(false);
      return;
    }

    const checkAvailability = async () => {
      try {
        const result = await window.vyotiq?.lsp?.getAvailableServers?.();
        if (result?.success && result.servers) {
          setIsAvailable(result.servers.includes(language));
        }
      } catch {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, [language, enabled]);

  // Start LSP server and open document when available
  useEffect(() => {
    if (!enabled || !isAvailable || !filePath) return;

    const startServer = async () => {
      try {
        const result = await window.vyotiq?.lsp?.startServer?.(language);
        if (result?.success) {
          setIsRunning(true);
        }
      } catch {
        setIsRunning(false);
      }
    };

    startServer();
  }, [language, isAvailable, filePath, enabled]);

  // Open document when editor content is available
  const openDocument = useCallback(async (content: string) => {
    if (!isRunning || !filePath || documentOpenRef.current) return;
    
    try {
      await window.vyotiq?.lsp?.openDocument?.(filePath, content);
      documentOpenRef.current = true;
      lastContentRef.current = content;
    } catch {
      // Ignore errors
    }
  }, [isRunning, filePath]);

  // Update document content
  const updateDocument = useCallback((content: string) => {
    if (!isRunning || !filePath || !documentOpenRef.current) return;
    if (content === lastContentRef.current) return;
    
    lastContentRef.current = content;
    window.vyotiq?.lsp?.updateDocument?.(filePath, content);
  }, [isRunning, filePath]);

  // Close document
  const closeDocument = useCallback(() => {
    if (!filePath || !documentOpenRef.current) return;
    
    window.vyotiq?.lsp?.closeDocument?.(filePath);
    documentOpenRef.current = false;
    lastContentRef.current = '';
  }, [filePath]);

  // Cleanup on unmount or file change
  useEffect(() => {
    return () => {
      if (documentOpenRef.current) {
        window.vyotiq?.lsp?.closeDocument?.(filePath);
        documentOpenRef.current = false;
      }
    };
  }, [filePath]);

  // Fetch diagnostics periodically
  useEffect(() => {
    if (!isRunning || !filePath || !enabled) return;

    const fetchDiagnostics = async () => {
      try {
        const result = await window.vyotiq?.lsp?.diagnostics?.(filePath);
        if (result?.success && result.diagnostics) {
          setDiagnostics(result.diagnostics);
          
          // Update Monaco markers
          if (editor) {
            const model = editor.getModel();
            if (model) {
              const markers = result.diagnostics.map((d: LSPDiagnostic) => ({
                severity: toMonacoSeverity(d.severity),
                message: d.message,
                startLineNumber: d.line,
                startColumn: d.column,
                endLineNumber: d.endLine || d.line,
                endColumn: d.endColumn || d.column + 1,
                source: d.source,
                code: d.code?.toString(),
              }));
              monaco.editor.setModelMarkers(model, 'lsp', markers);
            }
          }
        }
      } catch {
        // Ignore errors
      }
    };

    // Initial fetch
    fetchDiagnostics();

    // Poll every 2 seconds
    const interval = setInterval(fetchDiagnostics, 2000);
    return () => clearInterval(interval);
  }, [isRunning, filePath, editor, enabled]);

  // Get hover information
  const getHover = useCallback(async (line: number, column: number): Promise<LSPHover | null> => {
    if (!isRunning || !filePath) return null;
    
    try {
      const result = await window.vyotiq?.lsp?.hover?.(filePath, line, column);
      if (result?.success && result.hover) {
        return result.hover;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }, [isRunning, filePath]);

  // Get definition locations
  const getDefinition = useCallback(async (line: number, column: number): Promise<LSPLocation[]> => {
    if (!isRunning || !filePath) return [];
    
    try {
      const result = await window.vyotiq?.lsp?.definition?.(filePath, line, column);
      if (result?.success && result.locations) {
        return result.locations;
      }
    } catch {
      // Ignore errors
    }
    return [];
  }, [isRunning, filePath]);

  // Get references
  const getReferences = useCallback(async (line: number, column: number): Promise<LSPLocation[]> => {
    if (!isRunning || !filePath) return [];
    
    try {
      const result = await window.vyotiq?.lsp?.references?.(filePath, line, column, true);
      if (result?.success && result.locations) {
        return result.locations;
      }
    } catch {
      // Ignore errors
    }
    return [];
  }, [isRunning, filePath]);

  // Get document symbols
  const getSymbols = useCallback(async (): Promise<LSPSymbol[]> => {
    if (!isRunning || !filePath) return [];
    
    try {
      const result = await window.vyotiq?.lsp?.documentSymbols?.(filePath);
      if (result?.success && result.symbols) {
        return result.symbols;
      }
    } catch {
      // Ignore errors
    }
    return [];
  }, [isRunning, filePath]);

  return {
    isAvailable,
    isRunning,
    diagnostics,
    getHover,
    getDefinition,
    getReferences,
    getSymbols,
    openDocument,
    updateDocument,
    closeDocument,
  };
}

export default useLSP;
