/**
 * Monaco Editor Setup
 * 
 * Configures Monaco Editor environment, workers, and global settings.
 * Must be called once before any Monaco instances are created.
 */

import * as monaco from 'monaco-editor';
import { createLogger } from '../../../utils/logger';

// Vite static worker imports — Vite processes these at build time
// and bundles each worker into a separate chunk with correct URLs.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

const logger = createLogger('MonacoSetup');

let isInitialized = false;

/**
 * Initialize Monaco Editor environment with web workers.
 * Uses Vite's ?worker import for proper bundling.
 */
export function initializeMonaco(): void {
  if (isInitialized) return;

  try {
    // Configure Monaco environment for web workers
    // Vite's ?worker imports give us constructors that create properly-bundled workers
    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string): Worker {
        switch (label) {
          case 'json':
            return new JsonWorker();
          case 'css':
          case 'scss':
          case 'less':
            return new CssWorker();
          case 'html':
          case 'handlebars':
          case 'razor':
            return new HtmlWorker();
          case 'typescript':
          case 'javascript':
            return new TsWorker();
          default:
            return new EditorWorker();
        }
      },
    };

    // Configure language defaults using the available API
    configureLanguageDefaults();

    isInitialized = true;
    logger.info('Monaco Editor environment initialized');
  } catch (err) {
    logger.error('Failed to initialize Monaco Editor', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Configure language-specific defaults safely.
 * Handles API differences across Monaco versions.
 */
function configureLanguageDefaults(): void {
  try {
    // Configure TypeScript defaults if available
    const tsLang = monaco.languages.typescript;
    if (tsLang && typeof tsLang !== 'object') return;

    // Access via the languages.typescript namespace if APIs are available
    const tsDefaults = (tsLang as Record<string, unknown>)?.typescriptDefaults;
    const jsDefaults = (tsLang as Record<string, unknown>)?.javascriptDefaults;
    const ScriptTarget = (tsLang as Record<string, unknown>)?.ScriptTarget as Record<string, number> | undefined;
    const ModuleKind = (tsLang as Record<string, unknown>)?.ModuleKind as Record<string, number> | undefined;
    const ModuleResolutionKind = (tsLang as Record<string, unknown>)?.ModuleResolutionKind as Record<string, number> | undefined;
    const JsxEmit = (tsLang as Record<string, unknown>)?.JsxEmit as Record<string, number> | undefined;

    if (tsDefaults && typeof (tsDefaults as Record<string, unknown>).setCompilerOptions === 'function') {
      (tsDefaults as { setCompilerOptions: (opts: Record<string, unknown>) => void }).setCompilerOptions({
        target: ScriptTarget?.ESNext ?? 99,
        module: ModuleKind?.ESNext ?? 99,
        moduleResolution: ModuleResolutionKind?.NodeJs ?? 2,
        allowNonTsExtensions: true,
        allowJs: true,
        jsx: JsxEmit?.ReactJSX ?? 4,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
      });

      (tsDefaults as { setDiagnosticsOptions: (opts: Record<string, unknown>) => void }).setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
      });

      (tsDefaults as { setEagerModelSync: (v: boolean) => void }).setEagerModelSync(true);
    }

    if (jsDefaults && typeof (jsDefaults as Record<string, unknown>).setCompilerOptions === 'function') {
      (jsDefaults as { setCompilerOptions: (opts: Record<string, unknown>) => void }).setCompilerOptions({
        target: ScriptTarget?.ESNext ?? 99,
        module: ModuleKind?.ESNext ?? 99,
        allowNonTsExtensions: true,
        allowJs: true,
        checkJs: true,
        jsx: JsxEmit?.ReactJSX ?? 4,
      });

      (jsDefaults as { setDiagnosticsOptions: (opts: Record<string, unknown>) => void }).setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      (jsDefaults as { setEagerModelSync: (v: boolean) => void }).setEagerModelSync(true);
    }

    // Configure JSON defaults
    const jsonLang = monaco.languages.json;
    const jsonDefaults = (jsonLang as Record<string, unknown>)?.jsonDefaults;
    if (jsonDefaults && typeof (jsonDefaults as Record<string, unknown>).setDiagnosticsOptions === 'function') {
      (jsonDefaults as { setDiagnosticsOptions: (opts: Record<string, unknown>) => void }).setDiagnosticsOptions({
        validate: true,
        allowComments: true,
        trailingCommas: 'warning',
        schemaValidation: 'warning',
      });
    }
  } catch (err) {
    logger.warn('Failed to configure language defaults (non-critical)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get Monaco language ID from file extension
 */
export function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    vue: 'html',
    svelte: 'html',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    r: 'r',
    lua: 'lua',
    perl: 'perl',
    ini: 'ini',
    conf: 'ini',
    env: 'ini',
    proto: 'protobuf',
    tf: 'hcl',
    dart: 'dart',
    elixir: 'elixir',
    ex: 'elixir',
    exs: 'elixir',
    clj: 'clojure',
    scala: 'scala',
    zig: 'zig',
  };

  // Check for special filenames
  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  const specialFiles: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    '.gitignore': 'ignore',
    '.dockerignore': 'ignore',
    '.env': 'ini',
    '.env.local': 'ini',
    '.env.development': 'ini',
    '.env.production': 'ini',
  };

  return specialFiles[fileName] ?? langMap[ext] ?? 'plaintext';
}

export { monaco };
