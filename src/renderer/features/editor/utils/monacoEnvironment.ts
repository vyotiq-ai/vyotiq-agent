/**
 * Monaco Environment Setup
 * 
 * Configures Monaco Editor web workers for optimal performance.
 * Must be called before creating any Monaco editor instances.
 */

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let environmentConfigured = false;

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
  
  environmentConfigured = true;
}

/**
 * Check if Monaco environment is configured
 */
export function isMonacoEnvironmentConfigured(): boolean {
  return environmentConfigured;
}
