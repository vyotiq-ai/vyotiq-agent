/**
 * Monaco LSP Provider
 * 
 * Registers Monaco language providers that connect to the backend LSP servers.
 * Provides hover, definition, references, and completion support for all
 * languages supported by the LSP manager.
 */

import * as monaco from 'monaco-editor';

// Languages that have LSP support configured in the backend
const LSP_SUPPORTED_LANGUAGES = [
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'python', 'rust', 'go', 'java', 'csharp', 'cpp', 'c',
  'ruby', 'php', 'swift', 'kotlin', 'scala',
  'html', 'css', 'scss', 'less', 'json', 'yaml', 'markdown',
];

// Track registered providers to avoid duplicates
let providersRegistered = false;
const disposables: monaco.IDisposable[] = [];

/**
 * Register Monaco providers that use the backend LSP
 */
export function registerMonacoLSPProviders(): monaco.IDisposable[] {
  if (providersRegistered) return disposables;
  providersRegistered = true;

  // Register hover provider
  const hoverDisposable = monaco.languages.registerHoverProvider(LSP_SUPPORTED_LANGUAGES, {
    async provideHover(model, position) {
      const filePath = getFilePath(model);
      if (!filePath) return null;

      try {
        const result = await window.vyotiq?.lsp?.hover?.(
          filePath,
          position.lineNumber,
          position.column
        );

        if (result?.success && result.hover) {
          const contents: monaco.IMarkdownString[] = [{
            value: result.hover.contents,
            isTrusted: true,
          }];

          return {
            contents,
            range: result.hover.range ? new monaco.Range(
              result.hover.range.startLine,
              result.hover.range.startColumn,
              result.hover.range.endLine,
              result.hover.range.endColumn
            ) : undefined,
          };
        }
      } catch {
        // Fall back to Monaco's built-in hover
      }
      return null;
    },
  });
  disposables.push(hoverDisposable);

  // Register definition provider
  const definitionDisposable = monaco.languages.registerDefinitionProvider(LSP_SUPPORTED_LANGUAGES, {
    async provideDefinition(model, position) {
      const filePath = getFilePath(model);
      if (!filePath) return null;

      try {
        const result = await window.vyotiq?.lsp?.definition?.(
          filePath,
          position.lineNumber,
          position.column
        );

        if (result?.success && result.locations?.length) {
          return result.locations.map(loc => ({
            uri: monaco.Uri.file(loc.filePath),
            range: new monaco.Range(
              loc.line,
              loc.column,
              loc.endLine || loc.line,
              loc.endColumn || loc.column
            ),
          }));
        }
      } catch {
        // Fall back to Monaco's built-in definition
      }
      return null;
    },
  });
  disposables.push(definitionDisposable);

  // Register references provider
  const referencesDisposable = monaco.languages.registerReferenceProvider(LSP_SUPPORTED_LANGUAGES, {
    async provideReferences(model, position, context) {
      const filePath = getFilePath(model);
      if (!filePath) return null;

      try {
        const result = await window.vyotiq?.lsp?.references?.(
          filePath,
          position.lineNumber,
          position.column,
          context.includeDeclaration
        );

        if (result?.success && result.locations?.length) {
          return result.locations.map(loc => ({
            uri: monaco.Uri.file(loc.filePath),
            range: new monaco.Range(
              loc.line,
              loc.column,
              loc.endLine || loc.line,
              loc.endColumn || loc.column
            ),
          }));
        }
      } catch {
        // Fall back to Monaco's built-in references
      }
      return null;
    },
  });
  disposables.push(referencesDisposable);

  // Register document symbol provider
  const symbolDisposable = monaco.languages.registerDocumentSymbolProvider(LSP_SUPPORTED_LANGUAGES, {
    async provideDocumentSymbols(model) {
      const filePath = getFilePath(model);
      if (!filePath) return null;

      try {
        const result = await window.vyotiq?.lsp?.documentSymbols?.(filePath);

        if (result?.success && result.symbols?.length) {
          return result.symbols.map(sym => ({
            name: sym.name,
            kind: mapSymbolKind(sym.kind),
            range: new monaco.Range(
              sym.line,
              sym.column,
              sym.endLine || sym.line,
              sym.endColumn || sym.column
            ),
            selectionRange: new monaco.Range(
              sym.line,
              sym.column,
              sym.line,
              sym.column + sym.name.length
            ),
            detail: sym.containerName || '',
            children: sym.children?.map(mapSymbol) || [],
            tags: [] as monaco.languages.SymbolTag[],
          }));
        }
      } catch {
        // Fall back to Monaco's built-in symbols
      }
      return null;
    },
  });
  disposables.push(symbolDisposable);

  return disposables;
}

/**
 * Dispose all registered LSP providers
 */
export function disposeMonacoLSPProviders(): void {
  disposables.forEach(d => d.dispose());
  disposables.length = 0;
  providersRegistered = false;
}

/**
 * Get file path from Monaco model URI
 */
function getFilePath(model: monaco.editor.ITextModel): string | null {
  const uri = model.uri;
  if (uri.scheme === 'file') {
    return uri.fsPath || uri.path;
  }
  return null;
}

/**
 * Map LSP symbol kind string to Monaco SymbolKind
 */
function mapSymbolKind(kind: string): monaco.languages.SymbolKind {
  const kindMap: Record<string, monaco.languages.SymbolKind> = {
    'File': monaco.languages.SymbolKind.File,
    'Module': monaco.languages.SymbolKind.Module,
    'Namespace': monaco.languages.SymbolKind.Namespace,
    'Package': monaco.languages.SymbolKind.Package,
    'Class': monaco.languages.SymbolKind.Class,
    'Method': monaco.languages.SymbolKind.Method,
    'Property': monaco.languages.SymbolKind.Property,
    'Field': monaco.languages.SymbolKind.Field,
    'Constructor': monaco.languages.SymbolKind.Constructor,
    'Enum': monaco.languages.SymbolKind.Enum,
    'Interface': monaco.languages.SymbolKind.Interface,
    'Function': monaco.languages.SymbolKind.Function,
    'Variable': monaco.languages.SymbolKind.Variable,
    'Constant': monaco.languages.SymbolKind.Constant,
    'String': monaco.languages.SymbolKind.String,
    'Number': monaco.languages.SymbolKind.Number,
    'Boolean': monaco.languages.SymbolKind.Boolean,
    'Array': monaco.languages.SymbolKind.Array,
    'Object': monaco.languages.SymbolKind.Object,
    'Key': monaco.languages.SymbolKind.Key,
    'Null': monaco.languages.SymbolKind.Null,
    'EnumMember': monaco.languages.SymbolKind.EnumMember,
    'Struct': monaco.languages.SymbolKind.Struct,
    'Event': monaco.languages.SymbolKind.Event,
    'Operator': monaco.languages.SymbolKind.Operator,
    'TypeParameter': monaco.languages.SymbolKind.TypeParameter,
  };
  return kindMap[kind] || monaco.languages.SymbolKind.Variable;
}

/**
 * Map symbol with children recursively
 */
function mapSymbol(sym: {
  name: string;
  kind: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  containerName?: string;
  children?: Array<{
    name: string;
    kind: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    containerName?: string;
    children?: unknown[];
  }>;
}): monaco.languages.DocumentSymbol {
  return {
    name: sym.name,
    kind: mapSymbolKind(sym.kind),
    range: new monaco.Range(
      sym.line,
      sym.column,
      sym.endLine || sym.line,
      sym.endColumn || sym.column
    ),
    selectionRange: new monaco.Range(
      sym.line,
      sym.column,
      sym.line,
      sym.column + sym.name.length
    ),
    detail: sym.containerName || '',
    children: sym.children?.map(mapSymbol) || [],
    tags: [],
  };
}
