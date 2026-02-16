/**
 * Monaco Editor Wrapper Component
 * 
 * React wrapper around the Monaco Editor instance with:
 * - Automatic language detection
 * - Theme synchronization
 * - File model management
 * - Save/edit support via IPC
 * - Cursor/scroll position persistence
 * - Keyboard shortcut integration
 * - Diff editor support
 */

import React, { useRef, useEffect, useCallback, memo } from 'react';
import * as monaco from 'monaco-editor';
import { initializeMonaco, getMonacoLanguage } from './monacoSetup';
import { registerMonacoThemes, getMonacoTheme } from './monacoTheme';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('MonacoWrapper');

// Ensure Monaco is initialized once
let monacoReady = false;
function ensureMonacoReady(): void {
  if (monacoReady) return;
  initializeMonaco();
  registerMonacoThemes();

  // Suppress Monaco's internal "Canceled" promise rejections.
  // These fire when the editor is disposed while async operations
  // (e.g. WordHighlighter, Delayer) are still pending — harmless.
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    if (
      reason &&
      (reason.name === 'Canceled' ||
        (typeof reason.message === 'string' && reason.message === 'Canceled'))
    ) {
      e.preventDefault();
    }
  });

  monacoReady = true;
}

// =============================================================================
// Types
// =============================================================================

export interface MonacoEditorProps {
  /** File path for language detection and model URI */
  filePath: string;
  /** File content */
  content: string;
  /** Language override (auto-detected from filePath if not provided) */
  language?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** Called when the editor is saved (Ctrl+S) */
  onSave?: (value: string) => void;
  /** Called when cursor position changes */
  onCursorChange?: (position: { line: number; column: number }) => void;
  /** Called when selection changes */
  onSelectionChange?: (selection: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null) => void;
  /** Initial scroll position */
  scrollPosition?: { top: number; left: number };
  /** Initial cursor position */
  cursorPosition?: { line: number; column: number };
  /** Additional CSS class */
  className?: string;
  /** Minimap visibility */
  showMinimap?: boolean;
  /** Word wrap setting */
  wordWrap?: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  /** Font size override */
  fontSize?: number;
}

export interface MonacoDiffEditorProps {
  /** File path for language detection */
  filePath: string;
  /** Original content */
  original: string;
  /** Modified content */
  modified: string;
  /** Language override */
  language?: string;
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Code Editor Component
// =============================================================================

export const MonacoEditor = memo<MonacoEditorProps>(({
  filePath,
  content,
  language,
  readOnly = false,
  onChange,
  onSave,
  onCursorChange,
  onSelectionChange,
  scrollPosition,
  cursorPosition,
  className,
  showMinimap = true,
  wordWrap = 'off',
  fontSize = 12,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef(content);
  const disposeListenersRef = useRef<monaco.IDisposable[]>([]);

  // Keep content ref in sync
  contentRef.current = content;

  // Detect language from file path
  const resolvedLanguage = language ?? getMonacoLanguage(filePath);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;
    ensureMonacoReady();

    const modelUri = monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/')}`);
    let model = monaco.editor.getModel(modelUri);

    if (model) {
      // Update existing model
      if (model.getValue() !== contentRef.current) {
        model.setValue(contentRef.current);
      }
      monaco.editor.setModelLanguage(model, resolvedLanguage);
    } else {
      // Create new model
      model = monaco.editor.createModel(contentRef.current, resolvedLanguage, modelUri);
    }

    const editor = monaco.editor.create(containerRef.current, {
      model,
      theme: getMonacoTheme(),
      readOnly,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      wordWrap,
      minimap: {
        enabled: showMinimap,
        scale: 1,
        showSlider: 'mouseover',
        renderCharacters: false,
      },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      cursorStyle: 'line',
      renderLineHighlight: 'line',
      renderWhitespace: 'selection',
      bracketPairColorization: {
        enabled: true,
        independentColorPoolPerBracketType: true,
      },
      guides: {
        bracketPairs: 'active',
        indentation: true,
        highlightActiveIndentation: true,
      },
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showSnippets: true,
        insertMode: 'insert',
        filterGraceful: true,
        shareSuggestSelections: true,
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
      },
      parameterHints: {
        enabled: true,
        cycle: true,
      },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoSurround: 'languageDefined',
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: true,
      trimAutoWhitespace: true,
      links: true,
      colorDecorators: true,
      contextmenu: true,
      mouseWheelZoom: true,
      dragAndDrop: true,
      accessibilitySupport: 'auto',
      ariaLabel: `Code editor for ${filePath.split(/[/\\]/).pop() ?? 'file'}`,
      padding: { top: 8, bottom: 8 },
      overviewRulerBorder: false,
      overviewRulerLanes: 2,
      hideCursorInOverviewRuler: false,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        verticalSliderSize: 6,
        horizontalSliderSize: 6,
      },
      stickyScroll: {
        enabled: true,
        maxLineCount: 5,
      },
      // Control character rendering
      renderControlCharacters: false,
    });

    editorRef.current = editor;

    // Restore cursor position
    if (cursorPosition) {
      editor.setPosition({
        lineNumber: cursorPosition.line,
        column: cursorPosition.column,
      });
    }

    // Restore scroll position
    if (scrollPosition) {
      editor.setScrollPosition({
        scrollTop: scrollPosition.top,
        scrollLeft: scrollPosition.left,
      });
    }

    // Listen for content changes
    if (onChange) {
      const changeDisposable = model.onDidChangeContent(() => {
        const value = model!.getValue();
        onChange(value);
      });
      disposeListenersRef.current.push(changeDisposable);
    }

    // Listen for cursor position changes
    if (onCursorChange) {
      const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
        onCursorChange({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      });
      disposeListenersRef.current.push(cursorDisposable);
    }

    // Listen for selection changes
    if (onSelectionChange) {
      const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
        const sel = e.selection;
        if (sel.isEmpty()) {
          onSelectionChange(null);
        } else {
          onSelectionChange({
            startLine: sel.startLineNumber,
            startColumn: sel.startColumn,
            endLine: sel.endLineNumber,
            endColumn: sel.endColumn,
          });
        }
      });
      disposeListenersRef.current.push(selectionDisposable);
    }

    // Register Ctrl+S save command
    if (onSave) {
      const saveDisposable = editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          const value = model!.getValue();
          onSave(value);
        }
      );
      // addCommand returns a disposable number, no need to track
    }

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });
    resizeObserver.observe(containerRef.current);

    // Theme change observer
    const themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(getMonacoTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Focus the editor
    editor.focus();

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      disposeListenersRef.current.forEach(d => {
        try { d.dispose(); } catch { /* ignore dispose race */ }
      });
      disposeListenersRef.current = [];
      try { editor.dispose(); } catch { /* ignore Canceled errors during dispose */ }
      editorRef.current = null;
      // Don't dispose the model - it may be reused
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]); // Only recreate when filePath changes

  // Update content when it changes externally
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    if (model.getValue() !== content) {
      // Preserve cursor/selection position
      const position = editor.getPosition();
      const selections = editor.getSelections();

      model.setValue(content);

      if (position) editor.setPosition(position);
      if (selections) editor.setSelections(selections);
    }
  }, [content]);

  // Update readOnly mode
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Update theme
  useEffect(() => {
    monaco.editor.setTheme(getMonacoTheme());
  }, []);

  // Update word wrap
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap });
  }, [wordWrap]);

  // Update font size
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Update minimap
  useEffect(() => {
    editorRef.current?.updateOptions({
      minimap: { enabled: showMinimap },
    });
  }, [showMinimap]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      data-testid="monaco-editor"
    />
  );
});

MonacoEditor.displayName = 'MonacoEditor';

// =============================================================================
// Diff Editor Component
// =============================================================================

export const MonacoDiffEditor = memo<MonacoDiffEditorProps>(({
  filePath,
  original,
  modified,
  language,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  const resolvedLanguage = language ?? getMonacoLanguage(filePath);

  useEffect(() => {
    if (!containerRef.current) return;
    ensureMonacoReady();

    const originalModel = monaco.editor.createModel(
      original,
      resolvedLanguage,
      monaco.Uri.parse(`file:///diff-original/${filePath.replace(/\\/g, '/')}`)
    );

    const modifiedModel = monaco.editor.createModel(
      modified,
      resolvedLanguage,
      monaco.Uri.parse(`file:///diff-modified/${filePath.replace(/\\/g, '/')}`)
    );

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: getMonacoTheme(),
      readOnly: true,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      glyphMargin: false,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: 'line',
      minimap: { enabled: false },
      overviewRulerBorder: false,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      renderIndicators: true,
      originalEditable: false,
      ariaLabel: `Diff view for ${filePath.split(/[/\\]/).pop() ?? 'file'}`,
    });

    editor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = editor;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      editor.layout();
    });
    resizeObserver.observe(containerRef.current);

    // Theme sync
    const themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(getMonacoTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      try { editor.dispose(); } catch { /* ignore Canceled errors */ }
      try { originalModel.dispose(); } catch { /* ignore */ }
      try { modifiedModel.dispose(); } catch { /* ignore */ }
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, original, modified]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      data-testid="monaco-diff-editor"
    />
  );
});

MonacoDiffEditor.displayName = 'MonacoDiffEditor';
