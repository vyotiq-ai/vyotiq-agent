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
import { ensureMonacoEnvironment } from '../utils/monacoEnvironment';
import { registerAIInlineCompletionProvider, registerAICodeActionProvider, registerAICodeLensProvider, setAIActionCallback } from '../utils/monacoAIProvider';
import { registerMonacoLSPProviders } from '../utils/monacoLSPProvider';
import type { EditorSettings, EditorTab } from '../types';
import { Spinner } from '../../../components/ui/LoadingState';
import { EditorContextMenu, type EditorContextMenuAction } from './EditorContextMenu';
import { AIContextMenu } from './AIContextMenu';
import { AIResultPanel } from './AIResultPanel';
import { SelectionToolbar } from './SelectionToolbar';
import { useEditorAI, type EditorAIAction } from '../hooks/useEditorAI';

const logger = new RendererLogger('monaco-editor');

// Ensure Monaco environment is configured
ensureMonacoEnvironment();

// TypeScript language service types
// Monaco v0.55.0+ moved typescript to top-level: monaco.typescript
// Fallback to monaco.languages.typescript for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTypescriptAPI = () => (monaco as any).typescript || (monaco.languages as any).typescript;

// Configure TypeScript/JavaScript diagnostics once
let diagnosticsConfigured = false;
function ensureDiagnosticsConfigured() {
  const ts = getTypescriptAPI();
  if (!ts) return;
  
  try {
    // Disable Monaco's built-in semantic validation for TypeScript/JavaScript
    // Monaco's web worker doesn't have access to node_modules/@types, so it will
    // report false errors like "Cannot find name 'Promise'" for projects with type
    // definitions. Instead, we rely on our backend TypeScript Diagnostics Service
    // which has full file system access and can properly resolve type definitions.
    // 
    // We keep syntax validation enabled (fast, doesn't need types) but disable
    // semantic validation (slow, requires type resolution).
    //
    // NOTE: We call this every time (not just once) because Monaco's TypeScript
    // worker initializes asynchronously and might reset our settings.
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,  // Disable - backend service handles this
      noSyntaxValidation: false,   // Keep - doesn't need types
      noSuggestionDiagnostics: true, // Disable - backend service handles this
    });
    
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,  // Disable - backend service handles this
      noSyntaxValidation: false,   // Keep - doesn't need types
      noSuggestionDiagnostics: true, // Disable - backend service handles this
    });

    // Only set compiler options once
    if (!diagnosticsConfigured) {
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

      // Clear any existing TypeScript/JavaScript markers from all models
      // This ensures stale semantic errors don't persist after we disable semantic validation
      const models = monaco.editor.getModels();
      for (const model of models) {
        const uri = model.uri;
        const path = uri.path.toLowerCase();
        if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
          monaco.editor.setModelMarkers(model, 'typescript', []);
          monaco.editor.setModelMarkers(model, 'javascript', []);
        }
      }

      diagnosticsConfigured = true;
      logger.debug('TypeScript/JavaScript diagnostics configured - semantic validation disabled');
    }
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

/**
 * Cleanup function for Monaco AI providers
 * Call this on app unmount to properly dispose of AI provider resources
 * Note: This is specifically for Monaco editor instance providers,
 * separate from the monacoAIProvider utility's disposeAIProviders
 */
export function disposeMonacoAIProviders(): void {
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
  // Code Lens is controlled both at provider level and editor option level
  const enableCodeLens = useMemo(() => enableAI && settings.enableCodeLens !== false, [enableAI, settings.enableCodeLens]);
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
  const settingsRef = useRef(settings);

  // Keep refs updated
  useEffect(() => {
    onSaveRef.current = onSave;
    onChangeRef.current = onChange;
    onCursorChangeRef.current = onCursorChange;
    onViewStateChangeRef.current = onViewStateChange;
    settingsRef.current = settings;
  }, [onSave, onChange, onCursorChange, onViewStateChange, settings]);

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
      minimap: { 
        enabled: settings.minimap,
        autohide: 'none' as const,
        renderCharacters: false,
        maxColumn: 120,
        scale: 1,
        showSlider: 'mouseover',
      },
      lineNumbers: settings.lineNumbers,
      renderWhitespace: settings.renderWhitespace,
      bracketPairColorization: { 
        enabled: settings.bracketPairColorization,
        independentColorPoolPerBracketType: true,
      },
      smoothScrolling: settings.smoothScrolling,
      cursorBlinking: settings.cursorBlinking,
      cursorStyle: settings.cursorStyle,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      
      // Folding configuration - VSCode feature
      folding: true,
      foldingStrategy: 'auto', // Use language-aware folding when available
      showFoldingControls: 'mouseover',
      foldingHighlight: true,
      foldingImportsByDefault: false,
      unfoldOnClickAfterEndOfLine: true,
      
      // Sticky scroll - VSCode feature for keeping context visible
      stickyScroll: {
        enabled: settings.stickyScroll ?? true,
        maxLineCount: 5,
        defaultModel: 'outlineModel',
        scrollWithEditor: true,
      },
      
      // Enhanced matching and selection
      matchBrackets: 'always',
      renderLineHighlight: 'all', // Highlight full line including gutter
      renderLineHighlightOnlyWhenFocus: false,
      selectOnLineNumbers: true,
      roundedSelection: true,
      cursorSmoothCaretAnimation: 'on',
      mouseWheelZoom: true,
      contextmenu: false, // Disable native context menu
      
      // Multi-cursor support - VSCode feature
      multiCursorModifier: 'ctrlCmd',
      multiCursorMergeOverlapping: true,
      multiCursorPaste: 'spread',
      columnSelection: false, // Enable via Alt+Shift+Click
      
      // Suggestions and completions
      quickSuggestions: {
        other: 'on',
        comments: 'off',
        strings: 'on',
      },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'inline',
      wordBasedSuggestions: 'currentDocument',
      wordBasedSuggestionsOnlySameLanguage: true,
      parameterHints: { 
        enabled: true,
        cycle: true,
      },
      suggest: {
        preview: true,
        previewMode: 'prefix',
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
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
        showUsers: true,
        showIssues: true,
        insertMode: 'insert',
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false,
        localityBonus: true,
        shareSuggestSelections: true,
        selectionMode: 'always',
      },
      
      // Formatting options
      formatOnPaste: settings.formatOnPaste ?? true,
      formatOnType: settings.formatOnType ?? true,
      
      // Auto-closing and surrounding
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoClosingDelete: 'always',
      autoClosingOvertype: 'always',
      autoSurround: 'languageDefined',
      
      // Links and decorators
      links: true,
      colorDecorators: true,
      colorDecoratorsActivatedOn: 'clickAndHover',
      
      // Indent and bracket guides - enhanced VSCode feature
      guides: {
        bracketPairs: 'active', // Highlight active bracket pair
        bracketPairsHorizontal: 'active',
        highlightActiveBracketPair: true,
        indentation: true,
        highlightActiveIndentation: 'always',
      },
      
      // Font ligatures - VSCode feature
      fontLigatures: settings.fontLigatures ?? true,
      fontVariations: false,
      
      // Inlay hints - VSCode feature for parameter names, types
      inlayHints: {
        enabled: 'on',
        fontSize: settings.fontSize ? Math.round(settings.fontSize * 0.85) : 11,
        fontFamily: settings.fontFamily,
        padding: true,
      },
      
      // Hover configuration
      hover: {
        enabled: true,
        delay: 300,
        sticky: true,
        above: true,
      },
      
      // Definition peek - go to definition
      gotoLocation: {
        multiple: 'peek',
        multipleDefinitions: 'peek',
        multipleTypeDefinitions: 'peek',
        multipleDeclarations: 'peek',
        multipleImplementations: 'peek',
        multipleReferences: 'peek',
        alternativeDefinitionCommand: 'editor.action.goToReferences',
        alternativeTypeDefinitionCommand: 'editor.action.goToReferences',
        alternativeDeclarationCommand: 'editor.action.goToReferences',
        alternativeImplementationCommand: 'editor.action.goToReferences',
        alternativeReferenceCommand: '',
      },
      
      // Occurrences highlight
      occurrencesHighlight: 'singleFile',
      
      // Selection highlight
      selectionHighlight: true,
      
      // Render control characters
      renderControlCharacters: false,
      
      // Drop into editor
      dropIntoEditor: {
        enabled: true,
        showDropSelector: 'afterDrop',
      },
      
      // Experimental whitespace rendering
      experimentalWhitespaceRendering: 'svg',
      
      // Linked editing - rename paired tags
      linkedEditing: settings.linkedEditing ?? true,
      
      // Code Lens - shows inline actions like "Run Test", "References", etc.
      codeLens: enableCodeLens,
      
      // Render final newline
      renderFinalNewline: 'on',
      
      // Screenreader support
      accessibilitySupport: 'auto',
      
      // Editor scrollbar
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        arrowSize: 11,
        scrollByPage: false,
      },
      
      // Overscroll behavior
      overviewRulerBorder: false,
      overviewRulerLanes: 3,
      
      // Hide cursor in overview ruler
      hideCursorInOverviewRuler: false,
      
      // Unicode highlighting - configured to allow common special characters
      // This prevents Monaco from highlighting box-drawing characters, emojis, etc. as "ambiguous"
      unicodeHighlight: {
        ambiguousCharacters: false, // Disable - causes issues with box-drawing chars
        invisibleCharacters: true,
        nonBasicASCII: false, // Don't highlight non-ASCII as suspicious
        includeComments: false, // Don't highlight in comments
        includeStrings: false, // Don't highlight in strings
        allowedCharacters: {
          // Box-drawing characters
          '\u251C': true, '\u2502': true, '\u2514': true, '\u2500': true, '\u250C': true, '\u2510': true,
          '\u2518': true, '\u2524': true, '\u252C': true, '\u2534': true, '\u253C': true,
          '\u2554': true, '\u2557': true, '\u255A': true, '\u255D': true, '\u2551': true, '\u2550': true,
          // Common symbols - arrows
          '\u2192': true, '\u2190': true, '\u2191': true, '\u2193': true, '\u21D2': true, '\u21D0': true,
          // Check marks and crosses
          '\u2713': true, '\u2717': true, '\u2714': true, '\u2718': true,
          // Bullets
          '\u2022': true, '\u25E6': true, '\u25AA': true, '\u25AB': true,
          // Copyright, trademark
          '\u00A9': true, '\u00AE': true, '\u2122': true,
          // Math symbols
          '\u00B0': true, '\u00B1': true, '\u00D7': true, '\u00F7': true,
          // Punctuation
          '\u2026': true, '\u2014': true, '\u2013': true,
          // Smart quotes
          '\u2018': true, '\u2019': true, '\u201C': true, '\u201D': true,
          // Guillemets
          '\u00AB': true, '\u00BB': true,
          // Currency
          '\u20AC': true, '\u00A3': true, '\u00A5': true,
        },
        allowedLocales: { _os: true, _vscode: true },
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

    // =============================================
    // VSCode-like keyboard shortcuts and commands
    // =============================================

    // Ctrl+S - Save with format on save and trim trailing whitespace
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const currentSettings = settingsRef.current;
      const model = editor.getModel();
      
      // Apply pre-save transformations
      if (model) {
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
        
        // Trim trailing whitespace
        if (currentSettings.trimTrailingWhitespace) {
          const lineCount = model.getLineCount();
          for (let i = 1; i <= lineCount; i++) {
            const line = model.getLineContent(i);
            const trimmed = line.trimEnd();
            if (line !== trimmed) {
              edits.push({
                range: new monaco.Range(i, trimmed.length + 1, i, line.length + 1),
                text: '',
              });
            }
          }
        }
        
        // Insert final newline
        if (currentSettings.insertFinalNewline) {
          const lineCount = model.getLineCount();
          const lastLine = model.getLineContent(lineCount);
          if (lastLine.length > 0) {
            edits.push({
              range: new monaco.Range(lineCount, lastLine.length + 1, lineCount, lastLine.length + 1),
              text: model.getEOL(),
            });
          }
        }
        
        // Apply edits if any
        if (edits.length > 0) {
          model.pushEditOperations([], edits, () => null);
        }
        
        // Format document on save
        if (currentSettings.formatOnSave) {
          try {
            const formatAction = editor.getAction('editor.action.formatDocument');
            if (formatAction) {
              await formatAction.run();
            }
          } catch {
            // Formatting may fail if no formatter is available, continue with save
          }
        }
      }
      
      onSaveRef.current();
    });

    // Ctrl+D - Add selection to next find match (multi-cursor)
    editor.addAction({
      id: 'vyotiq.addSelectionToNextFindMatch',
      label: 'Add Selection To Next Find Match',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD],
      run: (ed) => {
        ed.getAction('editor.action.addSelectionToNextFindMatch')?.run();
      }
    });

    // Alt+Click - Add cursor (handled by Monaco default)

    // Ctrl+Shift+L - Select all occurrences of find match
    editor.addAction({
      id: 'vyotiq.selectAllOccurrences',
      label: 'Select All Occurrences of Find Match',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
      run: (ed) => {
        ed.getAction('editor.action.selectHighlights')?.run();
      }
    });

    // Ctrl+/ - Toggle line comment
    editor.addAction({
      id: 'vyotiq.toggleLineComment',
      label: 'Toggle Line Comment',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
      run: (ed) => {
        ed.getAction('editor.action.commentLine')?.run();
      }
    });

    // Ctrl+Shift+/ or Ctrl+Shift+A - Toggle block comment
    editor.addAction({
      id: 'vyotiq.toggleBlockComment',
      label: 'Toggle Block Comment',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash],
      run: (ed) => {
        ed.getAction('editor.action.blockComment')?.run();
      }
    });

    // Alt+Up - Move line up
    editor.addAction({
      id: 'vyotiq.moveLineUp',
      label: 'Move Line Up',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
      run: (ed) => {
        ed.getAction('editor.action.moveLinesUpAction')?.run();
      }
    });

    // Alt+Down - Move line down
    editor.addAction({
      id: 'vyotiq.moveLineDown',
      label: 'Move Line Down',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
      run: (ed) => {
        ed.getAction('editor.action.moveLinesDownAction')?.run();
      }
    });

    // Alt+Shift+Up - Copy line up
    editor.addAction({
      id: 'vyotiq.copyLineUp',
      label: 'Copy Line Up',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow],
      run: (ed) => {
        ed.getAction('editor.action.copyLinesUpAction')?.run();
      }
    });

    // Alt+Shift+Down - Copy line down
    editor.addAction({
      id: 'vyotiq.copyLineDown',
      label: 'Copy Line Down',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow],
      run: (ed) => {
        ed.getAction('editor.action.copyLinesDownAction')?.run();
      }
    });

    // Ctrl+Shift+K - Delete line
    editor.addAction({
      id: 'vyotiq.deleteLine',
      label: 'Delete Line',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK],
      run: (ed) => {
        ed.getAction('editor.action.deleteLines')?.run();
      }
    });

    // Ctrl+Enter - Insert line below
    editor.addAction({
      id: 'vyotiq.insertLineBelow',
      label: 'Insert Line Below',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: (ed) => {
        ed.getAction('editor.action.insertLineAfter')?.run();
      }
    });

    // Ctrl+Shift+Enter - Insert line above
    editor.addAction({
      id: 'vyotiq.insertLineAbove',
      label: 'Insert Line Above',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: (ed) => {
        ed.getAction('editor.action.insertLineBefore')?.run();
      }
    });

    // Ctrl+Shift+\ - Jump to matching bracket
    editor.addAction({
      id: 'vyotiq.jumpToBracket',
      label: 'Go to Bracket',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backslash],
      run: (ed) => {
        ed.getAction('editor.action.jumpToBracket')?.run();
      }
    });

    // Ctrl+] - Indent line
    editor.addAction({
      id: 'vyotiq.indentLine',
      label: 'Indent Line',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketRight],
      run: (ed) => {
        ed.getAction('editor.action.indentLines')?.run();
      }
    });

    // Ctrl+[ - Outdent line
    editor.addAction({
      id: 'vyotiq.outdentLine',
      label: 'Outdent Line',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketLeft],
      run: (ed) => {
        ed.getAction('editor.action.outdentLines')?.run();
      }
    });

    // Ctrl+K Ctrl+0 - Fold all
    editor.addAction({
      id: 'vyotiq.foldAll',
      label: 'Fold All',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0 | monaco.KeyMod.Alt],
      run: (ed) => {
        ed.getAction('editor.foldAll')?.run();
      }
    });

    // Ctrl+K Ctrl+J - Unfold all
    editor.addAction({
      id: 'vyotiq.unfoldAll',
      label: 'Unfold All',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ | monaco.KeyMod.Alt],
      run: (ed) => {
        ed.getAction('editor.unfoldAll')?.run();
      }
    });

    // Ctrl+Shift+[ - Fold region
    editor.addAction({
      id: 'vyotiq.foldRegion',
      label: 'Fold',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft],
      run: (ed) => {
        ed.getAction('editor.fold')?.run();
      }
    });

    // Ctrl+Shift+] - Unfold region
    editor.addAction({
      id: 'vyotiq.unfoldRegion',
      label: 'Unfold',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight],
      run: (ed) => {
        ed.getAction('editor.unfold')?.run();
      }
    });

    // F12 - Go to definition
    editor.addAction({
      id: 'vyotiq.goToDefinition',
      label: 'Go to Definition',
      keybindings: [monaco.KeyCode.F12],
      run: (ed) => {
        ed.getAction('editor.action.revealDefinition')?.run();
      }
    });

    // Alt+F12 - Peek definition
    editor.addAction({
      id: 'vyotiq.peekDefinition',
      label: 'Peek Definition',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      run: (ed) => {
        ed.getAction('editor.action.peekDefinition')?.run();
      }
    });

    // Shift+F12 - Go to references
    editor.addAction({
      id: 'vyotiq.goToReferences',
      label: 'Go to References',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
      run: (ed) => {
        ed.getAction('editor.action.goToReferences')?.run();
      }
    });

    // F2 - Rename symbol
    editor.addAction({
      id: 'vyotiq.renameSymbol',
      label: 'Rename Symbol',
      keybindings: [monaco.KeyCode.F2],
      run: (ed) => {
        ed.getAction('editor.action.rename')?.run();
      }
    });

    // Ctrl+. - Quick fix
    editor.addAction({
      id: 'vyotiq.quickFix',
      label: 'Quick Fix',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period],
      run: (ed) => {
        ed.getAction('editor.action.quickFix')?.run();
      }
    });

    // Shift+Alt+F - Format document
    editor.addAction({
      id: 'vyotiq.formatDocument',
      label: 'Format Document',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: (ed) => {
        ed.getAction('editor.action.formatDocument')?.run();
      }
    });

    // Ctrl+K Ctrl+F - Format selection
    editor.addAction({
      id: 'vyotiq.formatSelection',
      label: 'Format Selection',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: (ed) => {
        ed.getAction('editor.action.formatSelection')?.run();
      }
    });

    // Ctrl+Space - Trigger suggestion
    editor.addAction({
      id: 'vyotiq.triggerSuggest',
      label: 'Trigger Suggest',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space],
      run: (ed) => {
        ed.getAction('editor.action.triggerSuggest')?.run();
      }
    });

    // Ctrl+Shift+Space - Trigger parameter hints
    editor.addAction({
      id: 'vyotiq.triggerParameterHints',
      label: 'Trigger Parameter Hints',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Space],
      run: (ed) => {
        ed.getAction('editor.action.triggerParameterHints')?.run();
      }
    });

    // Ctrl+K Ctrl+X - Trim trailing whitespace
    editor.addAction({
      id: 'vyotiq.trimTrailingWhitespace',
      label: 'Trim Trailing Whitespace',
      keybindings: [],
      run: (ed) => {
        ed.getAction('editor.action.trimTrailingWhitespace')?.run();
      }
    });

    // Ctrl+L - Select line
    editor.addAction({
      id: 'vyotiq.selectLine',
      label: 'Select Line',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
      run: (ed) => {
        const selection = ed.getSelection();
        if (selection) {
          const lineNumber = selection.startLineNumber;
          const model = ed.getModel();
          if (model) {
            ed.setSelection(new monaco.Selection(
              lineNumber, 1,
              lineNumber + 1, 1
            ));
          }
        }
      }
    });

    // Ctrl+Shift+D - Duplicate line/selection
    editor.addAction({
      id: 'vyotiq.duplicateLine',
      label: 'Duplicate Line',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD],
      run: (ed) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (selection && model) {
          if (selection.isEmpty()) {
            // Duplicate entire line
            const lineNumber = selection.startLineNumber;
            const lineContent = model.getLineContent(lineNumber);
            ed.executeEdits('duplicate', [{
              range: new monaco.Range(lineNumber, model.getLineMaxColumn(lineNumber), lineNumber, model.getLineMaxColumn(lineNumber)),
              text: '\n' + lineContent,
              forceMoveMarkers: true,
            }]);
          } else {
            // Duplicate selection
            const text = model.getValueInRange(selection);
            ed.executeEdits('duplicate', [{
              range: new monaco.Range(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn),
              text: text,
              forceMoveMarkers: true,
            }]);
          }
        }
      }
    });

    // Ctrl+U - Undo cursor
    editor.addAction({
      id: 'vyotiq.undoCursor',
      label: 'Cursor Undo',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU],
      run: (ed) => {
        ed.getAction('cursorUndo')?.run();
      }
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

    // Listen for custom editor commands from command palette
    const handleFind = () => {
      editor.getAction('actions.find')?.run();
    };
    const handleReplace = () => {
      editor.getAction('editor.action.startFindReplaceAction')?.run();
    };
    const handleFormat = () => {
      editor.getAction('editor.action.formatDocument')?.run();
    };

    document.addEventListener('vyotiq:editor:find', handleFind);
    document.addEventListener('vyotiq:editor:replace', handleReplace);
    document.addEventListener('vyotiq:editor:formatDocument', handleFormat);

    return () => {
      // Remove custom event listeners
      document.removeEventListener('vyotiq:editor:find', handleFind);
      document.removeEventListener('vyotiq:editor:replace', handleReplace);
      document.removeEventListener('vyotiq:editor:formatDocument', handleFormat);

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
  }, [tab.id, tab.isLoading, tab.hasError, enableAI, enableCodeLens]); // eslint-disable-line react-hooks/exhaustive-deps

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
        minimap: { 
          enabled: settings.minimap,
          autohide: 'none' as const,
          renderCharacters: false,
          maxColumn: 120,
          scale: 1,
          showSlider: 'mouseover',
        },
        lineNumbers: settings.lineNumbers,
        renderWhitespace: settings.renderWhitespace,
        bracketPairColorization: { 
          enabled: settings.bracketPairColorization,
          independentColorPoolPerBracketType: true,
        },
        smoothScrolling: settings.smoothScrolling,
        cursorBlinking: settings.cursorBlinking,
        cursorStyle: settings.cursorStyle,
        // VSCode features
        stickyScroll: {
          enabled: settings.stickyScroll ?? true,
          maxLineCount: 5,
        },
        fontLigatures: settings.fontLigatures ?? true,
        formatOnPaste: settings.formatOnPaste ?? true,
        formatOnType: settings.formatOnType ?? true,
        linkedEditing: settings.linkedEditing ?? true,
        inlayHints: {
          enabled: (settings.inlayHints ?? true) ? 'on' : 'off',
          fontSize: settings.fontSize ? Math.round(settings.fontSize * 0.85) : 11,
          fontFamily: settings.fontFamily,
          padding: true,
        },
        guides: {
          bracketPairs: 'active',
          bracketPairsHorizontal: 'active',
          highlightActiveBracketPair: true,
          indentation: settings.renderIndentGuides ?? true,
          highlightActiveIndentation: (settings.highlightActiveIndentGuide ?? true) ? 'always' : false,
        },
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
          <Spinner size="sm" />
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
          <Spinner size="sm" className="w-2.5 h-2.5 text-[var(--color-accent-primary)]" />
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
