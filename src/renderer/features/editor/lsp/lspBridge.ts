/**
 * LSP Bridge for Monaco Editor
 * 
 * Connects the LSP backend (via Electron IPC) to Monaco Editor, providing:
 * - Hover information
 * - Go to Definition / Type Definition / Implementation
 * - Find All References
 * - Completions
 * - Signature Help
 * - Code Actions (Quick Fixes)
 * - Document Formatting
 * - Symbol Rename
 * - Real-time Diagnostics
 * - Document Symbol Outline
 * 
 * This bridge registers Monaco language providers that delegate to
 * the actual language servers running in the main process.
 */

import * as monaco from 'monaco-editor';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('LSPBridge');

// =============================================================================
// Types
// =============================================================================

interface LSPHover {
  contents: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

interface LSPLocation {
  filePath: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface LSPCompletion {
  label: string;
  kind?: string | number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

interface LSPDiagnostic {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

interface LSPCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LSPDiagnostic[];
  isPreferred?: boolean;
  edit?: {
    changes: Array<{
      filePath: string;
      edits: Array<{
        range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
        newText: string;
      }>;
    }>;
  };
}

interface LSPSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}

interface LSPSymbol {
  name: string;
  kind: string | number;
  filePath?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  selectionRange?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  children?: LSPSymbol[];
  containerName?: string;
  detail?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/** Map LSP completion kind (number or string) to Monaco CompletionItemKind */
function toMonacoCompletionKind(kind?: string | number): monaco.languages.CompletionItemKind {
  if (!kind) return monaco.languages.CompletionItemKind.Text;
  // Handle numeric kinds
  if (typeof kind === 'number') {
    const numMap: Record<number, monaco.languages.CompletionItemKind> = {
      1: monaco.languages.CompletionItemKind.Text,
      2: monaco.languages.CompletionItemKind.Method,
      3: monaco.languages.CompletionItemKind.Function,
      4: monaco.languages.CompletionItemKind.Constructor,
      5: monaco.languages.CompletionItemKind.Field,
      6: monaco.languages.CompletionItemKind.Variable,
      7: monaco.languages.CompletionItemKind.Class,
      8: monaco.languages.CompletionItemKind.Interface,
      9: monaco.languages.CompletionItemKind.Module,
      10: monaco.languages.CompletionItemKind.Property,
      11: monaco.languages.CompletionItemKind.Unit,
      12: monaco.languages.CompletionItemKind.Value,
      13: monaco.languages.CompletionItemKind.Enum,
      14: monaco.languages.CompletionItemKind.Keyword,
      15: monaco.languages.CompletionItemKind.Snippet,
      16: monaco.languages.CompletionItemKind.Color,
      17: monaco.languages.CompletionItemKind.File,
      18: monaco.languages.CompletionItemKind.Reference,
      19: monaco.languages.CompletionItemKind.Folder,
      20: monaco.languages.CompletionItemKind.EnumMember,
      21: monaco.languages.CompletionItemKind.Constant,
      22: monaco.languages.CompletionItemKind.Struct,
      23: monaco.languages.CompletionItemKind.Event,
      24: monaco.languages.CompletionItemKind.Operator,
      25: monaco.languages.CompletionItemKind.TypeParameter,
    };
    return numMap[kind] ?? monaco.languages.CompletionItemKind.Text;
  }
  // Handle string kinds from LSP
  const strMap: Record<string, monaco.languages.CompletionItemKind> = {
    text: monaco.languages.CompletionItemKind.Text,
    method: monaco.languages.CompletionItemKind.Method,
    function: monaco.languages.CompletionItemKind.Function,
    constructor: monaco.languages.CompletionItemKind.Constructor,
    field: monaco.languages.CompletionItemKind.Field,
    variable: monaco.languages.CompletionItemKind.Variable,
    class: monaco.languages.CompletionItemKind.Class,
    interface: monaco.languages.CompletionItemKind.Interface,
    module: monaco.languages.CompletionItemKind.Module,
    property: monaco.languages.CompletionItemKind.Property,
    unit: monaco.languages.CompletionItemKind.Unit,
    value: monaco.languages.CompletionItemKind.Value,
    enum: monaco.languages.CompletionItemKind.Enum,
    keyword: monaco.languages.CompletionItemKind.Keyword,
    snippet: monaco.languages.CompletionItemKind.Snippet,
    color: monaco.languages.CompletionItemKind.Color,
    file: monaco.languages.CompletionItemKind.File,
    reference: monaco.languages.CompletionItemKind.Reference,
    folder: monaco.languages.CompletionItemKind.Folder,
    enummember: monaco.languages.CompletionItemKind.EnumMember,
    constant: monaco.languages.CompletionItemKind.Constant,
    struct: monaco.languages.CompletionItemKind.Struct,
    event: monaco.languages.CompletionItemKind.Event,
    operator: monaco.languages.CompletionItemKind.Operator,
    typeparameter: monaco.languages.CompletionItemKind.TypeParameter,
  };
  return strMap[kind.toLowerCase()] ?? monaco.languages.CompletionItemKind.Text;
}

/** Map LSP symbol kind (number or string) to Monaco SymbolKind */
function toMonacoSymbolKind(kind: string | number): monaco.languages.SymbolKind {
  if (typeof kind === 'number') {
    return (kind as monaco.languages.SymbolKind) ?? monaco.languages.SymbolKind.Variable;
  }
  const strMap: Record<string, monaco.languages.SymbolKind> = {
    file: monaco.languages.SymbolKind.File,
    module: monaco.languages.SymbolKind.Module,
    namespace: monaco.languages.SymbolKind.Namespace,
    package: monaco.languages.SymbolKind.Package,
    class: monaco.languages.SymbolKind.Class,
    method: monaco.languages.SymbolKind.Method,
    property: monaco.languages.SymbolKind.Property,
    field: monaco.languages.SymbolKind.Field,
    constructor: monaco.languages.SymbolKind.Constructor,
    enum: monaco.languages.SymbolKind.Enum,
    interface: monaco.languages.SymbolKind.Interface,
    function: monaco.languages.SymbolKind.Function,
    variable: monaco.languages.SymbolKind.Variable,
    constant: monaco.languages.SymbolKind.Constant,
    string: monaco.languages.SymbolKind.String,
    number: monaco.languages.SymbolKind.Number,
    boolean: monaco.languages.SymbolKind.Boolean,
    array: monaco.languages.SymbolKind.Array,
    object: monaco.languages.SymbolKind.Object,
    key: monaco.languages.SymbolKind.Key,
    null: monaco.languages.SymbolKind.Null,
    enummember: monaco.languages.SymbolKind.EnumMember,
    struct: monaco.languages.SymbolKind.Struct,
    event: monaco.languages.SymbolKind.Event,
    operator: monaco.languages.SymbolKind.Operator,
    typeparameter: monaco.languages.SymbolKind.TypeParameter,
  };
  return strMap[kind.toLowerCase()] ?? monaco.languages.SymbolKind.Variable;
}

/** Map LSP diagnostic severity to Monaco MarkerSeverity */
function toMonacoSeverity(severity: string): monaco.MarkerSeverity {
  switch (severity) {
    case 'error': return monaco.MarkerSeverity.Error;
    case 'warning': return monaco.MarkerSeverity.Warning;
    case 'info': return monaco.MarkerSeverity.Info;
    case 'hint': return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Info;
  }
}

/** Convert a file path to Monaco URI */
function filePathToUri(filePath: string): monaco.Uri {
  return monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/')}`);
}

/** Extract file path from Monaco URI */
function uriToFilePath(uri: monaco.Uri): string {
  let path = uri.path;
  // Remove leading slash on Windows paths (e.g., /C:/...)
  if (/^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1);
  }
  return path.replace(/\//g, '\\');
}

/** Get the LSP API from the preload bridge */
function getLsp(): typeof window.vyotiq.lsp | undefined {
  return window.vyotiq?.lsp;
}

// =============================================================================
// Provider Registrations
// =============================================================================

/** Disposables for all registered providers */
const disposables: monaco.IDisposable[] = [];

/** Languages we've registered providers for */
const registeredLanguages = new Set<string>();

/** Track active file for document sync */
let activeFilePath: string | null = null;

/**
 * Register LSP providers for a specific Monaco language.
 * Idempotent — will not register twice for the same language.
 */
export function registerLSPProviders(language: string): void {
  if (registeredLanguages.has(language)) return;
  registeredLanguages.add(language);

  logger.info('Registering LSP providers', { language });

  // Hover provider
  disposables.push(
    monaco.languages.registerHoverProvider(language, {
      provideHover: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.hover) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.hover(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.hover) return null;

          const hover = result.hover as LSPHover;
          const contents: monaco.IMarkdownString[] = [];

          if (hover.contents) {
            contents.push({ value: hover.contents });
          }

          const range = hover.range
            ? new monaco.Range(
                hover.range.startLine + 1,
                hover.range.startColumn + 1,
                hover.range.endLine + 1,
                hover.range.endColumn + 1,
              )
            : undefined;

          return { contents, range };
        } catch (err) {
          logger.debug('Hover failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Completion provider
  disposables.push(
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '#', ' '],
      provideCompletionItems: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.completions) return { suggestions: [] };

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.completions(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.completions) return { suggestions: [] };

          const suggestions: monaco.languages.CompletionItem[] = (result.completions as LSPCompletion[]).map((item) => ({
            label: item.label,
            kind: toMonacoCompletionKind(item.kind),
            detail: item.detail,
            documentation: item.documentation ? { value: item.documentation } : undefined,
            insertText: item.insertText || item.label,
            sortText: item.sortText,
            filterText: item.filterText,
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
          }));

          return { suggestions };
        } catch (err) {
          logger.debug('Completions failed', { error: err instanceof Error ? err.message : String(err) });
          return { suggestions: [] };
        }
      },
    }),
  );

  // Definition provider
  disposables.push(
    monaco.languages.registerDefinitionProvider(language, {
      provideDefinition: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.definition) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.definition(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.locations?.length) return null;

          return (result.locations as LSPLocation[]).map((loc) => ({
            uri: filePathToUri(loc.filePath),
            range: new monaco.Range(
              loc.line + 1,
              loc.column + 1,
              loc.endLine + 1,
              loc.endColumn + 1,
            ),
          }));
        } catch (err) {
          logger.debug('Definition failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Type Definition provider — falls back to definition since typeDefinition
  // isn't exposed as a separate IPC method.
  disposables.push(
    monaco.languages.registerTypeDefinitionProvider(language, {
      provideTypeDefinition: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.definition) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.definition(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.locations?.length) return null;

          return (result.locations as LSPLocation[]).map((loc) => ({
            uri: filePathToUri(loc.filePath),
            range: new monaco.Range(
              loc.line + 1,
              loc.column + 1,
              loc.endLine + 1,
              loc.endColumn + 1,
            ),
          }));
        } catch (err) {
          logger.debug('Type definition failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Implementation provider — falls back to definition since implementations
  // isn't exposed as a separate IPC method.
  disposables.push(
    monaco.languages.registerImplementationProvider(language, {
      provideImplementation: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.definition) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.definition(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.locations?.length) return null;

          return (result.locations as LSPLocation[]).map((loc) => ({
            uri: filePathToUri(loc.filePath),
            range: new monaco.Range(
              loc.line + 1,
              loc.column + 1,
              loc.endLine + 1,
              loc.endColumn + 1,
            ),
          }));
        } catch (err) {
          logger.debug('Implementation failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Reference provider
  disposables.push(
    monaco.languages.registerReferenceProvider(language, {
      provideReferences: async (model, position, context) => {
        const lsp = getLsp();
        if (!lsp?.references) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.references(
            filePath,
            position.lineNumber - 1,
            position.column - 1,
            context.includeDeclaration,
          );
          if (!result?.success || !result.locations?.length) return null;

          return (result.locations as LSPLocation[]).map((loc) => ({
            uri: filePathToUri(loc.filePath),
            range: new monaco.Range(
              loc.line + 1,
              loc.column + 1,
              loc.endLine + 1,
              loc.endColumn + 1,
            ),
          }));
        } catch (err) {
          logger.debug('References failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Document Symbol provider (for outline, breadcrumbs, go-to-symbol)
  disposables.push(
    monaco.languages.registerDocumentSymbolProvider(language, {
      provideDocumentSymbols: async (model) => {
        const lsp = getLsp();
        if (!lsp?.documentSymbols) return [];

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.documentSymbols(filePath);
          if (!result?.success || !result.symbols?.length) return [];

          const convertSymbol = (sym: LSPSymbol): monaco.languages.DocumentSymbol => ({
            name: sym.name,
            detail: sym.detail || sym.containerName || '',
            kind: toMonacoSymbolKind(sym.kind),
            tags: [],
            range: new monaco.Range(
              sym.line + 1,
              sym.column + 1,
              sym.endLine + 1,
              sym.endColumn + 1,
            ),
            selectionRange: sym.selectionRange
              ? new monaco.Range(
                  sym.selectionRange.startLine + 1,
                  sym.selectionRange.startColumn + 1,
                  sym.selectionRange.endLine + 1,
                  sym.selectionRange.endColumn + 1,
                )
              : new monaco.Range(
                  sym.line + 1,
                  sym.column + 1,
                  sym.line + 1,
                  sym.column + 1,
                ),
            children: sym.children?.map(convertSymbol) ?? [],
          });

          return (result.symbols as LSPSymbol[]).map(convertSymbol);
        } catch (err) {
          logger.debug('Document symbols failed', { error: err instanceof Error ? err.message : String(err) });
          return [];
        }
      },
    }),
  );

  // Signature Help provider
  disposables.push(
    monaco.languages.registerSignatureHelpProvider(language, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: async (model, position) => {
        const lsp = getLsp();
        if (!lsp?.signatureHelp) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.signatureHelp(filePath, position.lineNumber - 1, position.column - 1);
          if (!result?.success || !result.signatureHelp) return null;

          const sigHelp = result.signatureHelp as LSPSignatureHelp;

          return {
            value: {
              signatures: sigHelp.signatures.map((sig) => ({
                label: sig.label,
                documentation: sig.documentation ? { value: sig.documentation } : undefined,
                parameters: (sig.parameters ?? []).map((p) => ({
                  label: p.label,
                  documentation: p.documentation ? { value: p.documentation } : undefined,
                })),
              })),
              activeSignature: sigHelp.activeSignature ?? 0,
              activeParameter: sigHelp.activeParameter ?? 0,
            },
            dispose: () => {},
          };
        } catch (err) {
          logger.debug('Signature help failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },
    }),
  );

  // Code Action provider (quick fixes, refactoring)
  disposables.push(
    monaco.languages.registerCodeActionProvider(language, {
      provideCodeActions: async (model, range) => {
        const lsp = getLsp();
        if (!lsp?.codeActions) return { actions: [], dispose: () => {} };

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.codeActions(
            filePath,
            range.startLineNumber - 1,
            range.startColumn - 1,
            range.endLineNumber - 1,
            range.endColumn - 1,
          );
          if (!result?.success || !result.actions?.length) {
            return { actions: [], dispose: () => {} };
          }

          const actions: monaco.languages.CodeAction[] = (result.actions as LSPCodeAction[]).map((action) => {
            const codeAction: monaco.languages.CodeAction = {
              title: action.title,
              kind: action.kind,
              isPreferred: action.isPreferred,
            };

            if (action.edit?.changes) {
              const edits: monaco.languages.IWorkspaceTextEdit[] = [];
              for (const change of action.edit.changes) {
                const editUri = filePathToUri(change.filePath);
                for (const edit of change.edits) {
                  edits.push({
                    resource: editUri,
                    textEdit: {
                      range: new monaco.Range(
                        edit.range.startLine + 1,
                        edit.range.startColumn + 1,
                        edit.range.endLine + 1,
                        edit.range.endColumn + 1,
                      ),
                      text: edit.newText,
                    },
                    versionId: undefined,
                  });
                }
              }
              codeAction.edit = { edits };
            }

            return codeAction;
          });

          return { actions, dispose: () => {} };
        } catch (err) {
          logger.debug('Code actions failed', { error: err instanceof Error ? err.message : String(err) });
          return { actions: [], dispose: () => {} };
        }
      },
    }),
  );

  // Document Formatting provider
  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: async (model) => {
        const lsp = getLsp();
        if (!lsp?.format) return [];

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.format(filePath);
          if (!result?.success || !result.edits?.length) return [];

          return result.edits.map((edit) => ({
            range: new monaco.Range(
              edit.range.startLine + 1,
              edit.range.startColumn + 1,
              edit.range.endLine + 1,
              edit.range.endColumn + 1,
            ),
            text: edit.newText,
          }));
        } catch (err) {
          logger.debug('Format failed', { error: err instanceof Error ? err.message : String(err) });
          return [];
        }
      },
    }),
  );

  // Rename provider
  disposables.push(
    monaco.languages.registerRenameProvider(language, {
      provideRenameEdits: async (model, position, newName) => {
        const lsp = getLsp();
        if (!lsp?.rename) return null;

        const filePath = uriToFilePath(model.uri);
        try {
          const result = await lsp.rename(filePath, position.lineNumber - 1, position.column - 1, newName);
          if (!result?.success || !result.edits?.length) return null;

          const edits: monaco.languages.IWorkspaceTextEdit[] = [];
          for (const fileEdit of result.edits) {
            const editUri = filePathToUri(fileEdit.filePath);
            for (const edit of fileEdit.edits) {
              edits.push({
                resource: editUri,
                textEdit: {
                  range: new monaco.Range(
                    edit.range.startLine + 1,
                    edit.range.startColumn + 1,
                    edit.range.endLine + 1,
                    edit.range.endColumn + 1,
                  ),
                  text: edit.newText,
                },
                versionId: undefined,
              });
            }
          }

          return { edits };
        } catch (err) {
          logger.debug('Rename failed', { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },

      resolveRenameLocation: async (model, position) => {
        // Use word at cursor position for rename location
        const word = model.getWordAtPosition(position);
        if (!word) {
          return {
            text: '',
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            rejectReason: 'Cannot rename this element',
          } as monaco.languages.RenameLocation & monaco.languages.Rejection;
        }
        return {
          text: word.word,
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
        } as monaco.languages.RenameLocation & monaco.languages.Rejection;
      },
    }),
  );

  logger.info('LSP providers registered', { language });
}

// =============================================================================
// Document Sync
// =============================================================================

/**
 * Notify the LSP that a document was opened.
 * Called when a file is opened in the editor.
 */
export async function notifyDocumentOpen(filePath: string, content?: string): Promise<void> {
  const lsp = getLsp();
  if (!lsp?.openDocument) return;

  activeFilePath = filePath;
  try {
    await lsp.openDocument(filePath, content);
  } catch (err) {
    logger.debug('Failed to notify document open', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Notify the LSP that a document content changed.
 * Called on each edit in the editor.
 */
export async function notifyDocumentChange(filePath: string, content: string): Promise<void> {
  const lsp = getLsp();
  if (!lsp?.updateDocument) return;

  try {
    await lsp.updateDocument(filePath, content);
  } catch (err) {
    logger.debug('Failed to notify document change', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Notify the LSP that a document was closed.
 */
export async function notifyDocumentClose(filePath: string): Promise<void> {
  const lsp = getLsp();
  if (!lsp?.closeDocument) return;

  if (activeFilePath === filePath) {
    activeFilePath = null;
  }
  try {
    await lsp.closeDocument(filePath);
  } catch (err) {
    logger.debug('Failed to notify document close', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// Diagnostics
// =============================================================================

/** Diagnostics subscription cleanup */
let diagnosticsUnsubscribe: (() => void) | null = null;

/**
 * Subscribe to real-time LSP diagnostics and push them to Monaco markers.
 */
export function subscribeToDiagnostics(): void {
  if (diagnosticsUnsubscribe) return;

  const lsp = getLsp();
  if (!lsp?.onDiagnosticsUpdated) return;

  diagnosticsUnsubscribe = lsp.onDiagnosticsUpdated((event) => {
    const { filePath, diagnostics } = event;
    const uri = filePathToUri(filePath);
    const model = monaco.editor.getModel(uri);
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = (diagnostics as LSPDiagnostic[]).map((d) => ({
      severity: toMonacoSeverity(d.severity),
      message: d.message,
      startLineNumber: d.line + 1,
      startColumn: d.column + 1,
      endLineNumber: (d.endLine ?? d.line) + 1,
      endColumn: (d.endColumn ?? d.column) + 1,
      source: d.source,
      code: d.code?.toString(),
    }));

    monaco.editor.setModelMarkers(model, event.source || 'lsp', markers);
  });

  logger.info('Subscribed to LSP diagnostics');
}

/**
 * Fetch diagnostics for a file and apply them to the Monaco model.
 */
export async function refreshDiagnostics(filePath?: string): Promise<void> {
  const lsp = getLsp();
  if (!lsp?.diagnostics) return;

  try {
    const result = await lsp.diagnostics(filePath);
    if (!result?.success || !result.diagnostics) return;

    // Group diagnostics by file
    const byFile = new Map<string, LSPDiagnostic[]>();
    for (const d of result.diagnostics as LSPDiagnostic[]) {
      const path = d.filePath || filePath || '';
      if (!byFile.has(path)) byFile.set(path, []);
      byFile.get(path)!.push(d);
    }

    for (const [path, diags] of byFile) {
      const uri = filePathToUri(path);
      const model = monaco.editor.getModel(uri);
      if (!model) continue;

      const markers: monaco.editor.IMarkerData[] = diags.map((d) => ({
        severity: toMonacoSeverity(d.severity),
        message: d.message,
        startLineNumber: d.line + 1,
        startColumn: d.column + 1,
        endLineNumber: (d.endLine ?? d.line) + 1,
        endColumn: (d.endColumn ?? d.column) + 1,
        source: d.source,
        code: d.code?.toString(),
      }));

      monaco.editor.setModelMarkers(model, 'lsp', markers);
    }
  } catch (err) {
    logger.debug('Failed to refresh diagnostics', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// LSP Initialization
// =============================================================================

let isInitialized = false;

/**
 * Initialize the LSP bridge for a workspace.
 * Sets up the LSP manager and subscribes to diagnostics.
 */
export async function initializeLSP(workspacePath: string): Promise<boolean> {
  if (isInitialized) return true;

  const lsp = getLsp();
  if (!lsp?.initialize) {
    logger.warn('LSP API not available');
    return false;
  }

  try {
    const result = await lsp.initialize(workspacePath);
    if (!result?.success) {
      logger.warn('LSP initialization failed', { error: result?.error });
      return false;
    }

    // Subscribe to real-time diagnostics
    subscribeToDiagnostics();

    isInitialized = true;
    logger.info('LSP bridge initialized', {
      workspacePath,
      availableServers: result.availableServers,
    });

    return true;
  } catch (err) {
    logger.error('LSP initialization error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Register LSP providers for all commonly used languages.
 * Call this once after Monaco is initialized.
 */
export function registerAllLSPProviders(): void {
  const languages = [
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact',
    'json',
    'html',
    'css',
    'scss',
    'less',
    'python',
    'rust',
    'go',
    'java',
    'cpp',
    'c',
    'csharp',
    'ruby',
    'php',
    'markdown',
    'yaml',
    'toml',
    'shell',
    'dockerfile',
    'sql',
  ];

  for (const lang of languages) {
    registerLSPProviders(lang);
  }
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Dispose all registered LSP providers and subscriptions.
 */
export function disposeLSPBridge(): void {
  for (const d of disposables) {
    try { d.dispose(); } catch { /* ignore */ }
  }
  disposables.length = 0;
  registeredLanguages.clear();

  if (diagnosticsUnsubscribe) {
    diagnosticsUnsubscribe();
    diagnosticsUnsubscribe = null;
  }

  isInitialized = false;
  logger.info('LSP bridge disposed');
}
