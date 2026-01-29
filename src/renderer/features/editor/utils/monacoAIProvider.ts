/**
 * Monaco AI Provider
 * 
 * Registers AI-powered providers with Monaco Editor:
 * - Inline completion provider (ghost text)
 * - Code action provider (quick fixes)
 */

import * as monaco from 'monaco-editor';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('MonacoAI');

// Track registered providers to avoid duplicates
let inlineCompletionProviderDisposable: monaco.IDisposable | null = null;

/**
 * Register the AI inline completion provider
 */
export function registerAIInlineCompletionProvider(): monaco.IDisposable {
  // Dispose existing provider if any
  if (inlineCompletionProviderDisposable) {
    inlineCompletionProviderDisposable.dispose();
  }

  const provider: monaco.languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
      context: monaco.languages.InlineCompletionContext,
      token: monaco.CancellationToken
    ): Promise<monaco.languages.InlineCompletions | null> => {
      // Skip if cancelled
      if (token.isCancellationRequested) {
        return null;
      }

      // Skip if not automatic trigger and not explicit
      if (context.triggerKind !== monaco.languages.InlineCompletionTriggerKind.Automatic &&
          context.triggerKind !== monaco.languages.InlineCompletionTriggerKind.Explicit) {
        return null;
      }

      // Get context
      const lineContent = model.getLineContent(position.lineNumber);
      const prefix = lineContent.substring(0, position.column - 1);
      const suffix = lineContent.substring(position.column - 1);

      // Skip if prefix is too short
      if (prefix.trim().length < 2) {
        return null;
      }

      // Get surrounding context
      const startLine = Math.max(1, position.lineNumber - 50);
      const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);
      
      const contextBefore: string[] = [];
      for (let i = startLine; i < position.lineNumber; i++) {
        contextBefore.push(model.getLineContent(i));
      }
      
      const contextAfter: string[] = [];
      for (let i = position.lineNumber + 1; i <= endLine; i++) {
        contextAfter.push(model.getLineContent(i));
      }

      try {
        // Check if editorAI API is available
        if (!window.vyotiq?.editorAI) {
          logger.warn('EditorAI API not available - window.vyotiq.editorAI is undefined');
          return null;
        }

        const response = await window.vyotiq.editorAI.inlineCompletion({
          filePath: model.uri.path,
          language: model.getLanguageId(),
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
          prefix,
          suffix,
          contextBefore,
          contextAfter,
          triggerKind: context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit 
            ? 'explicit' 
            : 'automatic',
        });

        // Check if cancelled during request
        if (token.isCancellationRequested) {
          return null;
        }

        if (!response.text) {
          // Log error if there was one (but not for quota/rate limit - those are expected)
          if (response.error && !response.error.includes('quota') && !response.error.includes('Rate limited')) {
            logger.debug('Inline completion returned no text', { error: response.error });
          }
          return null;
        }

        logger.debug('Inline completion received', {
          provider: response.provider,
          latencyMs: response.latencyMs,
          textLength: response.text.length,
        });

        return {
          items: [{
            insertText: response.text,
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
          }],
        };
      } catch (error) {
        // Only log unexpected errors, not quota/rate limit issues
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes('quota') && !errorMsg.includes('rate')) {
          logger.error('Inline completion error', { error });
        }
        return null;
      }
    },

    disposeInlineCompletions: () => {
      // Nothing to clean up
    },
  };

  // Register for all languages
  inlineCompletionProviderDisposable = monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    provider
  );

  logger.info('AI inline completion provider registered');

  return inlineCompletionProviderDisposable;
}

/**
 * Register AI code action provider for quick fixes
 */
export function registerAICodeActionProvider(languages: string[] = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']): monaco.IDisposable[] {
  const disposables: monaco.IDisposable[] = [];

  for (const language of languages) {
    const disposable = monaco.languages.registerCodeActionProvider(language, {
      provideCodeActions: async (
        model: monaco.editor.ITextModel,
        range: monaco.Range,
        context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken
      ): Promise<monaco.languages.CodeActionList | null> => {
        // Only provide actions for errors/warnings
        if (context.markers.length === 0) {
          return null;
        }

        // Check if editorAI API is available
        if (!window.vyotiq?.editorAI) {
          return null;
        }

        const actions: monaco.languages.CodeAction[] = [];

        // Add AI fix action for each marker
        for (const marker of context.markers) {
          if (token.isCancellationRequested) break;

          // Get code context around the error
          const startLine = Math.max(1, marker.startLineNumber - 5);
          const endLine = Math.min(model.getLineCount(), marker.endLineNumber + 5);
          const codeContext = model.getValueInRange(new monaco.Range(
            startLine, 1,
            endLine, model.getLineMaxColumn(endLine)
          ));

          try {
            const response = await window.vyotiq.editorAI.quickFix({
              filePath: model.uri.path,
              language: model.getLanguageId(),
              diagnostic: {
                message: marker.message,
                severity: marker.severity === monaco.MarkerSeverity.Error ? 'error' :
                         marker.severity === monaco.MarkerSeverity.Warning ? 'warning' :
                         marker.severity === monaco.MarkerSeverity.Info ? 'info' : 'hint',
                line: marker.startLineNumber,
                column: marker.startColumn,
                endLine: marker.endLineNumber,
                endColumn: marker.endColumn,
                source: marker.source,
                code: typeof marker.code === 'object' ? marker.code.value : marker.code,
              },
              codeContext,
              fileContent: model.getValue(),
            });

            if (token.isCancellationRequested) break;

            // Convert fixes to code actions
            for (const fix of response.fixes) {
              const edits: monaco.languages.TextEdit[] = fix.edits.map(edit => ({
                range: new monaco.Range(
                  edit.range.startLine,
                  edit.range.startColumn,
                  edit.range.endLine,
                  edit.range.endColumn
                ),
                text: edit.newText,
              }));

              actions.push({
                title: `[AI] ${fix.title}`,
                kind: 'quickfix',
                diagnostics: [marker],
                isPreferred: fix.isPreferred,
                edit: {
                  edits: [{
                    resource: model.uri,
                    textEdit: edits[0],
                    versionId: model.getVersionId(),
                  }],
                },
              });
            }
          } catch (error) {
            logger.error('Quick fix error', { error });
          }
        }

        return {
          actions,
          dispose: () => {},
        };
      },
    });

    disposables.push(disposable);
  }

  logger.info('AI code action provider registered', { languages });

  return disposables;
}

// Track Code Lens provider disposables
let codeLensProviderDisposables: monaco.IDisposable[] = [];

// Track registered command disposables
let commandDisposables: monaco.IDisposable[] = [];

// Event emitter for AI actions (used by Code Lens to communicate with editor)
type AIActionCallback = (filePath: string, line: number, action: string) => void;
let aiActionCallback: AIActionCallback | null = null;

/**
 * Set the callback for AI actions triggered from Code Lens
 */
export function setAIActionCallback(callback: AIActionCallback | null): void {
  aiActionCallback = callback;
}

/**
 * Register global commands for Code Lens AI actions
 * Must be called once before Code Lens provider is used
 */
function ensureCommandsRegistered(): void {
  if (commandDisposables.length > 0) return;

  const commands = [
    { id: 'editor.ai.explain', action: 'explain' },
    { id: 'editor.ai.refactor', action: 'refactor' },
    { id: 'editor.ai.tests', action: 'generate-tests' },
  ];

  for (const { id, action } of commands) {
    try {
      const disposable = monaco.editor.registerCommand(id, (_accessor, filePath: string, line: number, actionType?: string) => {
        logger.debug('Code Lens command triggered', { id, filePath, line, actionType });
        if (aiActionCallback) {
          aiActionCallback(filePath, line, actionType || action);
        } else {
          logger.warn('AI action callback not set - Code Lens action will not work');
        }
      });
      commandDisposables.push(disposable);
      logger.debug('Registered command', { id });
    } catch (error) {
      logger.error('Failed to register command', { id, error });
    }
  }
}

/**
 * Register AI Code Lens provider
 * Shows AI action hints above functions and classes
 */
export function registerAICodeLensProvider(languages: string[] = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']): monaco.IDisposable[] {
  // Ensure commands are registered first
  ensureCommandsRegistered();

  // Dispose existing providers
  codeLensProviderDisposables.forEach(d => d.dispose());
  codeLensProviderDisposables = [];

  for (const language of languages) {
    const disposable = monaco.languages.registerCodeLensProvider(language, {
      provideCodeLenses: async (
        model: monaco.editor.ITextModel,
        token: monaco.CancellationToken
      ): Promise<monaco.languages.CodeLensList | null> => {
        if (token.isCancellationRequested) return null;

        const lenses: monaco.languages.CodeLens[] = [];
        const content = model.getValue();
        const lines = content.split('\n');

        // Simple regex patterns to detect functions and classes
        const functionPatterns = [
          /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/,
          /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/,
          /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?function/,
          /^(\s*)(public|private|protected)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/,
          /^(\s*)(export\s+)?(default\s+)?class\s+(\w+)/,
        ];

        for (let i = 0; i < lines.length; i++) {
          if (token.isCancellationRequested) break;
          
          const line = lines[i];
          for (const pattern of functionPatterns) {
            if (pattern.test(line)) {
              // Add AI lens for this function/class
              lenses.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                command: {
                  id: 'editor.ai.explain',
                  title: '[AI] Explain',
                  arguments: [model.uri.path, i + 1, 'explain'],
                },
              });
              lenses.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                command: {
                  id: 'editor.ai.refactor',
                  title: 'Refactor',
                  arguments: [model.uri.path, i + 1, 'refactor'],
                },
              });
              lenses.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                command: {
                  id: 'editor.ai.tests',
                  title: 'Tests',
                  arguments: [model.uri.path, i + 1, 'generate-tests'],
                },
              });
              break;
            }
          }
        }

        return {
          lenses,
          dispose: () => {},
        };
      },

      resolveCodeLens: (
        _model: monaco.editor.ITextModel,
        codeLens: monaco.languages.CodeLens,
        _token: monaco.CancellationToken
      ): monaco.languages.CodeLens => {
        return codeLens;
      },
    });

    codeLensProviderDisposables.push(disposable);
  }

  logger.info('AI Code Lens provider registered', { languages });

  return codeLensProviderDisposables;
}

/**
 * Dispose all AI providers
 */
export function disposeAIProviders(): void {
  if (inlineCompletionProviderDisposable) {
    inlineCompletionProviderDisposable.dispose();
    inlineCompletionProviderDisposable = null;
  }
  codeLensProviderDisposables.forEach(d => d.dispose());
  codeLensProviderDisposables = [];
  commandDisposables.forEach(d => d.dispose());
  commandDisposables = [];
  aiActionCallback = null;
}
