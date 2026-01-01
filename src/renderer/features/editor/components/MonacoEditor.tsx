/**
 * MonacoEditor Component
 * 
 * Direct Monaco Editor integration without CDN dependency.
 * Uses local monaco-editor package with web workers.
 * Features:
 * - Custom context menu consistent with the app's design system
 * - AI-powered inline completions (ghost text)
 * - AI context menu actions (explain, refactor, fix, etc.)
 * - LSP integration for multi-language code intelligence
 */

import React, { useRef, useEffect, useCallback, memo, useState, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { cn } from '../../../utils/cn';
import { RendererLogger } from '../../../utils/logger';
import { registerCustomThemes } from '../utils/themeUtils';
import { registerAIInlineCompletionProvider, registerAICodeActionProvider, registerAICodeLensProvider, setAIActionCallback } from '../utils/monacoAIProvider';
import { registerMonacoLSPProviders } from '../utils/monacoLSPProvider';
import type { EditorSettings, EditorTab } from '../types';
import { Loader2 } from 'lucide-react';
import { EditorContextMenu, type EditorContextMenuAction } from './EditorContextMenu';
import { AIContextMenu } from './AIContextMenu';
import { AIResultPanel } from './AIResultPanel';
import { SelectionToolbar } from './SelectionToolbar';
import { useEditorAI, type EditorAIAction } from '../hooks/useEditorAI';

const logger = new RendererLogger('monaco-editor');

// Import workers for different language services
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Configure Monaco environment with local workers
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// TypeScript language service types - use type assertion to avoid deprecated marker issue
// The monaco.languages.typescript module is functional but types are marked deprecated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTypescriptLanguages = () => (monaco.languages as any).typescript;

// Configure TypeScript/JavaScript diagnostics once
let diagnosticsConfigured = false;
function ensureDiagnosticsConfigured() {
  if (diagnosticsConfigured) return;
  
  const ts = getTypescriptLanguages();
  if (!ts) return;
  
  try {
    // Enable TypeScript diagnostics - this makes Monaco generate markers for errors
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });
    
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });

    // Set compiler options for better error detection
    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: true,
      strict: false, // Don't be too strict - let the project's tsconfig control this
      noEmit: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    });

    ts.javascriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    });

    diagnosticsConfigured = true;
    logger.debug('TypeScript/JavaScript diagnostics configured');
  } catch (err) {
    logger.warn('Failed to configure TypeScript diagnostics:', err);
  }
}

// Register custom themes once
let themesRegistered = false;
function ensureThemesRegistered() {
  if (!themesRegistered) {
    registerCustomThemes(monaco);
    themesRegistered = true;
  }
}

// Register AI providers once
let aiProvidersRegistered = false;
const aiProviderDisposables: monaco.IDisposable[] = [];

function ensureAIProvidersRegistered() {
  if (!aiProvidersRegistered) {
    try {
      logger.debug('Registering AI providers...');
      
      // Register inline completion provider
      const inlineDisposable = registerAIInlineCompletionProvider();
      aiProviderDisposables.push(inlineDisposable);
      logger.debug('Inline completion provider registered');
      
      // Register code action providers for common languages
      const supportedLanguages = [
        'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
        'python', 'java', 'csharp', 'go', 'rust', 'cpp', 'c'
      ];
      const codeActionDisposables = registerAICodeActionProvider(supportedLanguages);
      aiProviderDisposables.push(...codeActionDisposables);
      logger.debug('Code action providers registered', { languages: supportedLanguages.join(', ') });
      
      // Register Code Lens provider for AI actions (conditionally)
      // Note: Code Lens is registered globally, individual enable/disable is handled at render time
      const codeLensDisposables = registerAICodeLensProvider(supportedLanguages);
      aiProviderDisposables.push(...codeLensDisposables);
      logger.debug('Code Lens providers registered');
      
      aiProvidersRegistered = true;
      logger.info('All AI providers registered successfully');
    } catch (error) {
      logger.error('Failed to register AI providers', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// Register LSP providers once
let lspProvidersRegistered = false;
const lspProviderDisposables: monaco.IDisposable[] = [];

function ensureLSPProvidersRegistered() {
  if (!lspProvidersRegistered) {
    try {
      logger.debug('Registering LSP providers...');
      const disposables = registerMonacoLSPProviders();
      lspProviderDisposables.push(...disposables);
      lspProvidersRegistered = true;
      logger.info('LSP providers registered successfully');
    } catch (error) {
      logger.error('Failed to register LSP providers', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// Cleanup function for AI providers (called on app unmount if needed)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _disposeAIProviders() {
  aiProviderDisposables.forEach(d => d.dispose());
  aiProviderDisposables.length = 0;
  aiProvidersRegistered = false;
}

interface MonacoEditorProps {
  tab: EditorTab;
  settings: EditorSettings;
  onChange: (content: string) => void;
  onSave: () => void;
  onViewStateChange: (viewState: monaco.editor.ICodeEditorViewState | null) => void;
  onCursorChange: (position: { lineNumber: number; column: number }) => void;
  className?: string;
  /** Enable AI features */
  enableAI?: boolean;
  /** Pending navigation - scroll to this position when set */
  pendingNavigation?: { line: number; column: number } | null;
  /** Called after handling pending navigation */
  onNavigationHandled?: () => void;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = memo(({
  tab,
  settings,
  onChange,
  onSave,
  onViewStateChange,
  onCursorChange,
  className,
  enableAI: enableAIProp = true,
  pendingNavigation,
  onNavigationHandled,
}) => {
  // Derive AI feature flags from settings - memoized to prevent recalculation
  const enableAI = useMemo(() => enableAIProp && settings.enableAI !== false, [enableAIProp, settings.enableAI]);
  const enableInlineCompletions = useMemo(() => enableAI && settings.enableInlineCompletions !== false, [enableAI, settings.enableInlineCompletions]);
  const enableSelectionToolbar = useMemo(() => enableAI && settings.enableSelectionToolbar !== false, [enableAI, settings.enableSelectionToolbar]);
  // Code Lens is controlled at the provider level, but we track the setting for future use
  const _enableCodeLens = useMemo(() => enableAI && settings.enableCodeLens !== false, [enableAI, settings.enableCodeLens]);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isRestoringViewState = useRef(false);
  const inlineCompletionDecorationRef = useRef<string[]>([]);
  
  // Track previous tab id to detect tab switches vs content updates
  const prevTabIdRef = useRef<string>(tab.id);

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const [aiContextMenu, setAIContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const [showAIResult, setShowAIResult] = useState(false);

  const [selectionToolbar, setSelectionToolbar] = useState<{
    isVisible: boolean;
    position: { x: number; y: number };
    selectedText: string;
  }>({
    isVisible: false,
    position: { x: 0, y: 0 },
    selectedText: '',
  });

  // AI hook - pass settings from global EditorAISettings (synced via EditorProvider)
  const {
    inlineCompletion,
    requestInlineCompletion,
    acceptInlineCompletion,
    dismissInlineCompletion,
    actionState,
    executeAction,
    clearActionResult,
  } = useEditorAI({
    enableInlineCompletions,
    debounceMs: settings.inlineCompletionDebounceMs,
    maxTokens: settings.inlineCompletionMaxTokens,
    contextLinesBefore: settings.contextLinesBefore,
    contextLinesAfter: settings.contextLinesAfter,
  });

  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onViewStateChangeRef = useRef(onViewStateChange);

  // Keep refs updated
  useEffect(() => {
    onSaveRef.current = onSave;
    onChangeRef.current = onChange;
    onCursorChangeRef.current = onCursorChange;
    onViewStateChangeRef.current = onViewStateChange;
  }, [onSave, onChange, onCursorChange, onViewStateChange]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current || tab.isLoading || tab.hasError) return;

    ensureThemesRegistered();
    ensureDiagnosticsConfigured();
    
    // Register AI providers if enabled
    if (enableAI) {
      ensureAIProvidersRegistered();
    }
    
    // Register LSP providers for multi-language support
    ensureLSPProvidersRegistered();

    // Create a model with a proper file URI so markers can be matched by path
    const fileUri = monaco.Uri.file(tab.path);
    let model = monaco.editor.getModel(fileUri);
    
    if (!model) {
      // Create new model with the file URI
      model = monaco.editor.createModel(tab.content, tab.language, fileUri);
    } else {
      // Update existing model content if it differs
      if (model.getValue() !== tab.content) {
        model.setValue(tab.content);
      }
      // Update language if needed
      if (model.getLanguageId() !== tab.language) {
        monaco.editor.setModelLanguage(model, tab.language);
      }
    }

    const editor = monaco.editor.create(containerRef.current, {
      model, // Use our model with file URI instead of inline value
      theme: settings.theme,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
      wordWrap: settings.wordWrap,
      minimap: { enabled: settings.minimap },
      lineNumbers: settings.lineNumbers,
      renderWhitespace: settings.renderWhitespace,
      bracketPairColorization: { enabled: settings.bracketPairColorization },
      smoothScrolling: settings.smoothScrolling,
      cursorBlinking: settings.cursorBlinking,
      cursorStyle: settings.cursorStyle,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      matchBrackets: 'always',
      renderLineHighlight: 'line',
      selectOnLineNumbers: true,
      roundedSelection: true,
      cursorSmoothCaretAnimation: 'on',
      mouseWheelZoom: true,
      contextmenu: false, // Disable native context menu
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'inline',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      formatOnPaste: true,
      formatOnType: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoSurround: 'languageDefined',
      links: true,
      colorDecorators: true,
      guides: {
        bracketPairs: true,
        indentation: true,
      },
    });

    editorRef.current = editor;

    // Set up callback for Code Lens AI actions
    if (enableAI) {
      setAIActionCallback((filePath: string, line: number, action: string) => {
        const model = editor.getModel();
        if (!model) return;
        
        // Find the end of the function/class (simple heuristic)
        let endLine = line;
        let braceCount = 0;
        let started = false;
        for (let i = line; i <= model.getLineCount(); i++) {
          const lineContent = model.getLineContent(i);
          for (const char of lineContent) {
            if (char === '{') { braceCount++; started = true; }
            if (char === '}') braceCount--;
          }
          if (started && braceCount === 0) {
            endLine = i;
            break;
          }
        }
        
        const selectedCode = model.getValueInRange(
          new monaco.Range(line, 1, endLine, model.getLineMaxColumn(endLine))
        );
        
        setShowAIResult(true);
        executeAction({
          action: action as EditorAIAction,
          filePath: filePath || tab.path,
          language: tab.language,
          selectedCode,
          fileContent: model.getValue(),
          selectionRange: {
            startLine: line,
            startColumn: 1,
            endLine,
            endColumn: model.getLineMaxColumn(endLine),
          },
        });
      });
    }

    // Restore view state if available
    if (tab.viewState) {
      isRestoringViewState.current = true;
      editor.restoreViewState(tab.viewState);
      isRestoringViewState.current = false;
    }

    // Focus editor
    editor.focus();

    // Add Ctrl+S shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });

    // Handle context menu
    const contextMenuDisposable = editor.onContextMenu((e) => {
      // Prevent default and show our custom menu
      e.event.preventDefault();
      e.event.stopPropagation();

      // Close AI context menu if open
      setAIContextMenu(prev => ({ ...prev, isOpen: false }));

      setContextMenu({
        isOpen: true,
        position: { x: e.event.posx, y: e.event.posy },
      });
    });

    // Add keyboard shortcut for AI actions (Ctrl+Shift+A)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, () => {
      const position = editor.getPosition();
      if (position) {
        const coords = editor.getScrolledVisiblePosition(position);
        if (coords) {
          const editorDom = editor.getDomNode();
          const rect = editorDom?.getBoundingClientRect();
          if (rect) {
            setAIContextMenu({
              isOpen: true,
              position: { x: rect.left + coords.left, y: rect.top + coords.top + 20 },
            });
          }
        }
      }
    });

    // Track content changes
    const contentDisposable = editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      onChangeRef.current(value);
    });

    // Track cursor position and trigger inline completion
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (!isRestoringViewState.current) {
        onCursorChangeRef.current({
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });

        // Request inline completion when cursor moves (with debounce in hook)
        if (enableAI) {
          const model = editor.getModel();
          if (model) {
            const lineContent = model.getLineContent(e.position.lineNumber);
            const prefix = lineContent.substring(0, e.position.column - 1);
            const suffix = lineContent.substring(e.position.column - 1);
            
            // Only request if there's meaningful prefix
            if (prefix.trim().length >= 2) {
              requestInlineCompletion({
                filePath: tab.path,
                language: tab.language,
                content: model.getValue(),
                line: e.position.lineNumber,
                column: e.position.column,
                prefix,
                suffix,
              });
            }
          }
        }
      }
    });

    // Track scroll/view state changes
    const scrollDisposable = editor.onDidScrollChange(() => {
      if (!isRestoringViewState.current) {
        const viewState = editor.saveViewState();
        onViewStateChangeRef.current(viewState);
      }
    });

    // Track selection changes for selection toolbar
    const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
      if (!enableSelectionToolbar) return;
      
      const selection = e.selection;
      if (selection.isEmpty()) {
        setSelectionToolbar(prev => ({ ...prev, isVisible: false }));
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      const selectedText = model.getValueInRange(selection);
      if (selectedText.trim().length < 3) {
        setSelectionToolbar(prev => ({ ...prev, isVisible: false }));
        return;
      }

      // Get position for toolbar (above selection start)
      const startPosition = new monaco.Position(selection.startLineNumber, selection.startColumn);
      const coords = editor.getScrolledVisiblePosition(startPosition);
      if (coords) {
        const editorDom = editor.getDomNode();
        const rect = editorDom?.getBoundingClientRect();
        if (rect) {
          setSelectionToolbar({
            isVisible: true,
            position: { 
              x: rect.left + coords.left + (selection.endColumn - selection.startColumn) * 4,
              y: rect.top + coords.top - 10,
            },
            selectedText,
          });
        }
      }
    });

    return () => {
      // Clear the AI action callback when editor is disposed
      if (enableAI) {
        setAIActionCallback(null);
      }
      
      // Dispose all disposables with error handling
      // Monaco can throw "Canceled" errors when disposing while async operations are pending
      const safeDispose = (disposable: { dispose: () => void }) => {
        try {
          disposable.dispose();
        } catch (err) {
          // Ignore "Canceled" errors from Monaco's internal word highlighter
          // These happen when the editor is disposed while async operations are pending
          if (err instanceof Error && err.message !== 'Canceled') {
            logger.debug('Error disposing Monaco resource', { error: err.message });
          }
        }
      };
      
      safeDispose(contextMenuDisposable);
      safeDispose(contentDisposable);
      safeDispose(cursorDisposable);
      safeDispose(scrollDisposable);
      safeDispose(selectionDisposable);
      safeDispose(editor);
      editorRef.current = null;
    };
  }, [tab.id, tab.isLoading, tab.hasError, enableAI]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when tab changes (but not on initial mount)
  // Optimized to only update when tab switches, not on every content change
  useEffect(() => {
    if (editorRef.current && !tab.isLoading && !tab.hasError) {
      const isTabSwitch = prevTabIdRef.current !== tab.id;
      prevTabIdRef.current = tab.id;
      
      // Only update editor content if this is a tab switch or external content change
      // Don't update if the change came from the editor itself (user typing)
      if (isTabSwitch) {
        isRestoringViewState.current = true;
        editorRef.current.setValue(tab.content);
        if (tab.viewState) {
          editorRef.current.restoreViewState(tab.viewState);
        }
        isRestoringViewState.current = false;
      } else {
        // For non-tab-switch updates, only update if content differs significantly
        // This handles external file changes (e.g., from git or file watcher)
        const currentValue = editorRef.current.getValue();
        if (currentValue !== tab.content && tab.content === tab.originalContent) {
          // External change detected (content matches original, meaning file was reloaded)
          isRestoringViewState.current = true;
          editorRef.current.setValue(tab.content);
          if (tab.viewState) {
            editorRef.current.restoreViewState(tab.viewState);
          }
          isRestoringViewState.current = false;
        }
      }
    }
  }, [tab.id, tab.content, tab.viewState, tab.isLoading, tab.hasError, tab.originalContent]);

  // Update language when it changes
  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, tab.language);
      }
    }
  }, [tab.language]);

  // Update theme when settings change
  useEffect(() => {
    monaco.editor.setTheme(settings.theme);
  }, [settings.theme]);

  // Handle pending navigation - scroll to position when set
  useEffect(() => {
    if (editorRef.current && pendingNavigation) {
      const { line, column } = pendingNavigation;
      
      // Set cursor position
      editorRef.current.setPosition({ lineNumber: line, column });
      
      // Reveal the line in center of editor
      editorRef.current.revealLineInCenter(line);
      
      // Focus the editor
      editorRef.current.focus();
      
      // Clear the pending navigation
      onNavigationHandled?.();
    }
  }, [pendingNavigation, onNavigationHandled]);

  // Update editor options when settings change
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        tabSize: settings.tabSize,
        insertSpaces: settings.insertSpaces,
        wordWrap: settings.wordWrap,
        minimap: { enabled: settings.minimap },
        lineNumbers: settings.lineNumbers,
        renderWhitespace: settings.renderWhitespace,
        bracketPairColorization: { enabled: settings.bracketPairColorization },
        smoothScrolling: settings.smoothScrolling,
        cursorBlinking: settings.cursorBlinking,
        cursorStyle: settings.cursorStyle,
      });
    }
  }, [settings]);

  // Render inline completion as ghost text decoration
  useEffect(() => {
    if (!editorRef.current || !enableAI) return;
    const editor = editorRef.current;

    // Clear previous decorations
    if (inlineCompletionDecorationRef.current.length > 0) {
      editor.deltaDecorations(inlineCompletionDecorationRef.current, []);
      inlineCompletionDecorationRef.current = [];
    }

    // Add new decoration if we have a completion
    if (inlineCompletion.text) {
      const position = editor.getPosition();
      if (position) {
        const decorations = editor.deltaDecorations([], [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          options: {
            after: {
              content: inlineCompletion.text,
              inlineClassName: 'ai-inline-completion-ghost',
            },
          },
        }]);
        inlineCompletionDecorationRef.current = decorations;
      }
    }
  }, [inlineCompletion.text, enableAI]);

  // Handle Tab key to accept inline completion
  useEffect(() => {
    if (!editorRef.current || !enableAI) return;
    const editor = editorRef.current;

    const tabDisposable = editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Tab && inlineCompletion.text) {
        e.preventDefault();
        e.stopPropagation();
        
        const text = acceptInlineCompletion();
        if (text) {
          const position = editor.getPosition();
          if (position) {
            editor.executeEdits('ai-completion', [{
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              text,
              forceMoveMarkers: true,
            }]);
          }
        }
      } else if (e.keyCode === monaco.KeyCode.Escape && inlineCompletion.text) {
        dismissInlineCompletion();
      }
    });

    return () => tabDisposable.dispose();
  }, [inlineCompletion.text, acceptInlineCompletion, dismissInlineCompletion, enableAI]);

  // Handle AI action
  const handleAIAction = useCallback(async (action: EditorAIAction) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    const model = editor.getModel();
    
    if (!model) return;

    const selectedCode = selection && !selection.isEmpty() 
      ? model.getValueInRange(selection) 
      : undefined;
    
    const fileContent = model.getValue();
    const position = editor.getPosition();

    setShowAIResult(true);
    
    await executeAction({
      action,
      filePath: tab.path,
      language: tab.language,
      selectedCode,
      fileContent,
      cursorPosition: position ? { line: position.lineNumber, column: position.column } : undefined,
      selectionRange: selection && !selection.isEmpty() ? {
        startLine: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLine: selection.endLineNumber,
        endColumn: selection.endColumn,
      } : undefined,
    });
  }, [tab.path, tab.language, executeAction]);

  // Apply code from AI result
  const handleApplyCode = useCallback((code: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    
    if (selection && !selection.isEmpty()) {
      editor.executeEdits('ai-apply', [{
        range: selection,
        text: code,
        forceMoveMarkers: true,
      }]);
    }
  }, []);

  // Insert code at cursor
  const handleInsertCode = useCallback((code: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const position = editor.getPosition();
    
    if (position) {
      editor.executeEdits('ai-insert', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: code,
        forceMoveMarkers: true,
      }]);
    }
  }, []);

  // Check if there's a selection for AI context menu
  const hasSelection = useCallback(() => {
    if (!editorRef.current) return false;
    const selection = editorRef.current.getSelection();
    return selection ? !selection.isEmpty() : false;
  }, []);

  // Handle context menu action
  const handleContextMenuAction = useCallback((action: EditorContextMenuAction) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    switch (action) {
      case 'copy': {
        const selection = editor.getSelection();
        if (selection) {
          const text = editor.getModel()?.getValueInRange(selection) || '';
          navigator.clipboard.writeText(text).catch(err => logger.error('Failed to copy to clipboard', { error: err instanceof Error ? err.message : String(err) }));
        }
        editor.focus();
        break;
      }
      case 'cut': {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          const text = editor.getModel()?.getValueInRange(selection) || '';
          navigator.clipboard.writeText(text).catch(err => logger.error('Failed to cut to clipboard', { error: err instanceof Error ? err.message : String(err) }));
          editor.executeEdits('cut', [{
            range: selection,
            text: '',
            forceMoveMarkers: true
          }]);
        }
        editor.focus();
        break;
      }
      case 'paste':
        editor.focus();
        navigator.clipboard.readText().then(text => {
          const selection = editor.getSelection();
          if (selection) {
            editor.executeEdits('clipboard', [{
              range: selection,
              text: text,
              forceMoveMarkers: true
            }]);
          }
        }).catch(err => logger.error('Failed to paste from clipboard', { error: err instanceof Error ? err.message : String(err) }));
        break;
      case 'selectAll':
        editor.setSelection(editor.getModel()?.getFullModelRange() || new monaco.Range(1, 1, 1, 1));
        editor.focus();
        break;
      case 'save':
        onSaveRef.current();
        break;
      case 'format':
        editor.getAction('editor.action.formatDocument')?.run();
        break;
      case 'showDiff': {
        // Trigger the keyboard shortcut event for showing diff
        // Use userAgentData if available, fallback to userAgent check
        const isMac = navigator.userAgent.toLowerCase().includes('mac');
        const event = new KeyboardEvent('keydown', {
          key: 'd',
          ctrlKey: !isMac,
          metaKey: isMac,
          bubbles: true
        });
        window.dispatchEvent(event);
        break;
      }
      case 'aiActions': {
        // Close main context menu and open AI context menu at the same position
        setContextMenu(prev => ({ ...prev, isOpen: false }));
        setAIContextMenu({
          isOpen: true,
          position: contextMenu.position,
        });
        break;
      }
    }
  }, [contextMenu.position]);

  // Loading state
  if (tab.isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-[var(--color-surface-1)]', className)}>
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[11px] font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (tab.hasError) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-[var(--color-surface-1)]', className)}>
        <div className="text-center">
          <p className="text-[var(--color-error)] text-[11px] font-mono mb-2">
            Failed to load file
          </p>
          <p className="text-[var(--color-text-muted)] text-[10px] font-mono">
            {tab.errorMessage || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full w-full relative', className)}>
      <div
        ref={containerRef}
        className="h-full w-full"
      />
      
      {/* Standard context menu */}
      <EditorContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        canSave={tab.isDirty}
        fileName={tab.name}
        onAction={handleContextMenuAction}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
      />

      {/* AI context menu */}
      {enableAI && (
        <AIContextMenu
          isOpen={aiContextMenu.isOpen}
          position={aiContextMenu.position}
          hasSelection={hasSelection()}
          onAction={handleAIAction}
          onClose={() => setAIContextMenu(prev => ({ ...prev, isOpen: false }))}
          isLoading={actionState.isLoading}
        />
      )}

      {/* AI result panel */}
      {enableAI && showAIResult && (
        <div className="absolute bottom-4 right-4 w-[400px] z-50">
          <AIResultPanel
            isOpen={showAIResult}
            isLoading={actionState.isLoading}
            action={actionState.action}
            result={actionState.result}
            error={actionState.error}
            provider={actionState.provider}
            latencyMs={actionState.latencyMs}
            onClose={() => {
              setShowAIResult(false);
              clearActionResult();
            }}
            onApplyCode={handleApplyCode}
            onInsertCode={handleInsertCode}
          />
        </div>
      )}

      {/* Selection toolbar */}
      {enableSelectionToolbar && (
        <SelectionToolbar
          isVisible={selectionToolbar.isVisible}
          position={selectionToolbar.position}
          selectedText={selectionToolbar.selectedText}
          onAction={(action) => {
            handleAIAction(action);
            setSelectionToolbar(prev => ({ ...prev, isVisible: false }));
          }}
          onClose={() => setSelectionToolbar(prev => ({ ...prev, isVisible: false }))}
          isLoading={actionState.isLoading}
        />
      )}

      {/* Inline completion loading indicator */}
      {enableAI && inlineCompletion.isLoading && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-surface-2)]/80 backdrop-blur-sm">
          <Loader2 size={10} className="animate-spin text-[var(--color-accent-primary)]" />
          <span className="text-[9px] text-[var(--color-text-muted)] font-mono">AI</span>
        </div>
      )}

      {/* CSS for ghost text */}
      <style>{`
        .ai-inline-completion-ghost {
          color: var(--color-text-placeholder);
          opacity: 0.6;
          font-style: italic;
        }
      `}</style>
    </div>
  );
});

MonacoEditor.displayName = 'MonacoEditor';
