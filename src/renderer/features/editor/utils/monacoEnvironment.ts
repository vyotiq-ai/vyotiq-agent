/**
 * Monaco Environment Setup
 * 
 * Configures Monaco Editor web workers for optimal performance.
 * Must be called before creating any Monaco editor instances.
 */

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let environmentConfigured = false;

// For Monaco v0.55.0+, TypeScript features are at top-level: monaco.typescript
// For v0.54.0 and earlier, they were at: monaco.languages.typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTypescriptAPI = () => (monaco as any).typescript || (monaco.languages as any).typescript;

/**
 * Configure Monaco environment with local web workers.
 * Safe to call multiple times - only configures once.
 */
export function ensureMonacoEnvironment(): void {
  if (environmentConfigured) return;
  
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
      // Default editor worker handles diff computation, link detection, etc.
      return new editorWorker();
    },
  };

  // Configure TypeScript/JavaScript BEFORE any editors are created
  // This MUST happen early to prevent Monaco from generating semantic errors
  // for projects where we don't have access to type definitions
  configureTypeScriptDefaults();
  
  environmentConfigured = true;
}

/**
 * Configure TypeScript/JavaScript defaults to disable semantic validation.
 * Monaco's TypeScript worker runs in a sandbox without file system access,
 * so it can't resolve node_modules/@types. We disable its semantic validation
 * and rely on our backend TypeScript Diagnostics Service which has full access.
 */
function configureTypeScriptDefaults(): void {
  const ts = getTypescriptAPI();
  if (!ts) {
    console.warn('[Monaco] TypeScript API not available');
    return;
  }

  try {
    // CRITICAL: Disable semantic validation BEFORE any models are created
    // This prevents Monaco from generating "Cannot find name 'Promise'" errors
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

    // Set basic compiler options
    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: false, // Don't check JS - let backend handle it
      strict: false,
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
      checkJs: false, // Don't check JS - let backend handle it
      noEmit: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    });

    console.log('[Monaco] TypeScript semantic validation disabled - using backend service');
  } catch (err) {
    console.warn('[Monaco] Failed to configure TypeScript defaults:', err);
  }
}

/**
 * Check if Monaco environment is configured
 */
export function isMonacoEnvironmentConfigured(): boolean {
  return environmentConfigured;
}
