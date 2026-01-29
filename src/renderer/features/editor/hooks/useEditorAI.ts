/**
 * useEditorAI Hook
 * 
 * Provides AI-powered features for the code editor:
 * - Inline completions (ghost text)
 * - Code actions (explain, refactor, fix, etc.)
 * - Quick fixes for errors
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('EditorAI');

// =============================================================================
// Types
// =============================================================================

export type EditorAIAction =
  | 'explain'
  | 'refactor'
  | 'fix-errors'
  | 'generate-tests'
  | 'add-documentation'
  | 'optimize'
  | 'summarize-file'
  | 'find-issues'
  | 'convert';

export interface EditorAIDiagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  code?: string | number;
}

export interface EditorAIResult {
  text?: string;
  code?: string;
  edits?: Array<{
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    newText: string;
    description?: string;
  }>;
  suggestions?: Array<{
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    line?: number;
    fix?: string;
  }>;
}

export interface InlineCompletionState {
  text: string | null;
  isLoading: boolean;
  provider?: string;
  latencyMs?: number;
  error?: string;
}

export interface ActionState {
  isLoading: boolean;
  result: EditorAIResult | null;
  error?: string;
  action?: EditorAIAction;
  provider?: string;
  latencyMs?: number;
}

// =============================================================================
// Hook
// =============================================================================

interface UseEditorAIOptions {
  /** Debounce delay for inline completions (ms) - defaults to global setting */
  debounceMs?: number;
  /** Enable inline completions - defaults to global setting */
  enableInlineCompletions?: boolean;
  /** Context lines before cursor - defaults to global setting */
  contextLinesBefore?: number;
  /** Context lines after cursor - defaults to global setting */
  contextLinesAfter?: number;
  /** Max tokens for inline completions - defaults to global setting */
  maxTokens?: number;
}

interface UseEditorAIReturn {
  // Inline completion
  inlineCompletion: InlineCompletionState;
  requestInlineCompletion: (params: {
    filePath: string;
    language: string;
    content: string;
    line: number;
    column: number;
    prefix: string;
    suffix: string;
  }) => void;
  acceptInlineCompletion: () => string | null;
  dismissInlineCompletion: () => void;

  // Code actions
  actionState: ActionState;
  executeAction: (params: {
    action: EditorAIAction;
    filePath: string;
    language: string;
    selectedCode?: string;
    fileContent?: string;
    cursorPosition?: { line: number; column: number };
    selectionRange?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    diagnostics?: EditorAIDiagnostic[];
    userInstructions?: string;
  }) => Promise<EditorAIResult | null>;
  clearActionResult: () => void;

  // Quick fixes
  getQuickFixes: (params: {
    filePath: string;
    language: string;
    diagnostic: EditorAIDiagnostic;
    codeContext: string;
    fileContent?: string;
  }) => Promise<Array<{
    title: string;
    description?: string;
    edits: Array<{
      range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      newText: string;
    }>;
    isPreferred?: boolean;
  }>>;

  // Utilities
  cancel: () => void;
  clearCache: () => void;
}

export function useEditorAI(options: UseEditorAIOptions = {}): UseEditorAIReturn {
  // Use provided options or fall back to defaults
  // Note: Global EditorAISettings are synced to EditorSettings in EditorProvider
  // and passed down through MonacoEditor props
  const {
    debounceMs = 300,
    enableInlineCompletions = true,
    contextLinesBefore = 50,
    contextLinesAfter = 10,
    maxTokens = 128,
  } = options;

  // State
  const [inlineCompletion, setInlineCompletion] = useState<InlineCompletionState>({
    text: null,
    isLoading: false,
  });

  const [actionState, setActionState] = useState<ActionState>({
    isLoading: false,
    result: null,
  });

  // Refs
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestRef = useRef<string>('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.vyotiq?.editorAI?.cancel();
    };
  }, []);

  // Request inline completion
  const requestInlineCompletion = useCallback((params: {
    filePath: string;
    language: string;
    content: string;
    line: number;
    column: number;
    prefix: string;
    suffix: string;
  }) => {
    if (!enableInlineCompletions) {
      logger.debug('Inline completions disabled');
      return;
    }
    
    if (!window.vyotiq?.editorAI) {
      logger.warn('EditorAI API not available');
      return;
    }

    // Create request key for deduplication
    const requestKey = `${params.filePath}:${params.line}:${params.column}:${params.prefix.slice(-30)}`;
    
    // Skip if same request
    if (requestKey === lastRequestRef.current) {
      return;
    }
    lastRequestRef.current = requestKey;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(async () => {
      setInlineCompletion(prev => ({ ...prev, isLoading: true, error: undefined }));

      try {
        // Extract context lines
        const lines = params.content.split('\n');
        const currentLineIndex = params.line - 1;
        const contextBefore = lines.slice(
          Math.max(0, currentLineIndex - contextLinesBefore),
          currentLineIndex
        );
        const contextAfter = lines.slice(
          currentLineIndex + 1,
          currentLineIndex + 1 + contextLinesAfter
        );

        const response = await window.vyotiq.editorAI.inlineCompletion({
          ...params,
          contextBefore,
          contextAfter,
          triggerKind: 'automatic',
          maxTokens,
        });

        if (response.error) {
          logger.debug('Inline completion error', { error: response.error });
          setInlineCompletion({
            text: null,
            isLoading: false,
            error: response.error,
          });
        } else {
          setInlineCompletion({
            text: response.text,
            isLoading: false,
            provider: response.provider,
            latencyMs: response.latencyMs,
          });
        }
      } catch (error) {
        logger.error('Inline completion failed', { error });
        setInlineCompletion({
          text: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, debounceMs);
  }, [enableInlineCompletions, debounceMs, contextLinesBefore, contextLinesAfter, maxTokens]);

  // Accept inline completion
  const acceptInlineCompletion = useCallback(() => {
    const text = inlineCompletion.text;
    setInlineCompletion({ text: null, isLoading: false });
    lastRequestRef.current = '';
    return text;
  }, [inlineCompletion.text]);

  // Dismiss inline completion
  const dismissInlineCompletion = useCallback(() => {
    setInlineCompletion({ text: null, isLoading: false });
    lastRequestRef.current = '';
    window.vyotiq?.editorAI?.cancel();
  }, []);

  // Execute AI action
  const executeAction = useCallback(async (params: {
    action: EditorAIAction;
    filePath: string;
    language: string;
    selectedCode?: string;
    fileContent?: string;
    cursorPosition?: { line: number; column: number };
    selectionRange?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    diagnostics?: EditorAIDiagnostic[];
    userInstructions?: string;
  }): Promise<EditorAIResult | null> => {
    if (!window.vyotiq?.editorAI) {
      logger.error('EditorAI API not available - cannot execute action');
      return null;
    }
    
    logger.info('Executing AI action', { action: params.action, filePath: params.filePath });

    setActionState({
      isLoading: true,
      result: null,
      action: params.action,
    });

    try {
      const response = await window.vyotiq.editorAI.executeAction({
        action: params.action,
        filePath: params.filePath,
        language: params.language,
        selectedCode: params.selectedCode,
        fileContent: params.fileContent,
        cursorPosition: params.cursorPosition,
        selectionRange: params.selectionRange,
        context: {
          diagnostics: params.diagnostics,
          userInstructions: params.userInstructions,
        },
      });

      if (response.success && response.result) {
        setActionState({
          isLoading: false,
          result: response.result,
          action: params.action,
          provider: response.provider,
          latencyMs: response.latencyMs,
        });
        return response.result;
      } else {
        setActionState({
          isLoading: false,
          result: null,
          error: response.error || 'Action failed',
          action: params.action,
        });
        return null;
      }
    } catch (error) {
      logger.error('AI action failed', { action: params.action, error });
      setActionState({
        isLoading: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: params.action,
      });
      return null;
    }
  }, []);

  // Clear action result
  const clearActionResult = useCallback(() => {
    setActionState({ isLoading: false, result: null });
  }, []);

  // Get quick fixes
  const getQuickFixes = useCallback(async (params: {
    filePath: string;
    language: string;
    diagnostic: EditorAIDiagnostic;
    codeContext: string;
    fileContent?: string;
  }) => {
    if (!window.vyotiq?.editorAI) {
      return [];
    }

    try {
      const response = await window.vyotiq.editorAI.quickFix(params);
      return response.fixes || [];
    } catch (error) {
      logger.error('Quick fix failed', { error });
      return [];
    }
  }, []);

  // Cancel pending requests
  const cancel = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    window.vyotiq?.editorAI?.cancel();
    setInlineCompletion({ text: null, isLoading: false });
    setActionState(prev => ({ ...prev, isLoading: false }));
  }, []);

  // Clear cache
  const clearCache = useCallback(() => {
    window.vyotiq?.editorAI?.clearCache();
  }, []);

  return {
    inlineCompletion,
    requestInlineCompletion,
    acceptInlineCompletion,
    dismissInlineCompletion,
    actionState,
    executeAction,
    clearActionResult,
    getQuickFixes,
    cancel,
    clearCache,
  };
}
