/**
 * Editor AI IPC Handlers
 * 
 * Handles all editor AI-related IPC operations including:
 * - Inline code completions
 * - Code actions (explain, refactor, document, etc.)
 * - Quick fixes for diagnostics
 * - Cache management
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';

const logger = createLogger('IPC:EditorAI');

export function registerEditorAiHandlers(context: IpcContext): void {
  const { getOrchestrator, getSettingsStore, emitToRenderer } = context;

  // ==========================================================================
  // Inline Completions
  // ==========================================================================

  ipcMain.handle('editor-ai:inline-completion', async (_event, payload: {
    filePath: string;
    language: string;
    content: string;
    line: number;
    column: number;
    prefix: string;
    suffix: string;
    contextBefore?: string[];
    contextAfter?: string[];
    triggerKind: 'automatic' | 'explicit';
    maxTokens?: number;
  }) => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();

      if (!service) {
        // Emit status event to renderer for UI feedback
        emitToRenderer({
          type: 'editor-ai:status',
          status: 'unavailable',
          message: 'Editor AI service not initialized',
        });
        return { text: null, error: 'Editor AI service not initialized' };
      }

      // Emit start event for completion request
      emitToRenderer({
        type: 'editor-ai:completion-start',
        filePath: payload.filePath,
        line: payload.line,
        column: payload.column,
      });

      const result = await service.getInlineCompletion(payload);
      
      // Emit completion event with result
      emitToRenderer({
        type: 'editor-ai:completion-end',
        filePath: payload.filePath,
        success: !!result.text,
        hasError: !!result.error,
      });

      return result;
    } catch (error) {
      logger.error('Editor AI inline completion failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Emit error event to renderer
      emitToRenderer({
        type: 'editor-ai:completion-error',
        filePath: payload.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return { text: null, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Code Actions
  // ==========================================================================

  ipcMain.handle('editor-ai:execute-action', async (_event, payload: {
    action: string;
    filePath: string;
    language: string;
    selectedCode?: string;
    fileContent?: string;
    cursorPosition?: { line: number; column: number };
    selectionRange?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    context?: {
      diagnostics?: Array<{
        message: string;
        severity: 'error' | 'warning' | 'info' | 'hint';
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
        source?: string;
        code?: string | number;
      }>;
      userInstructions?: string;
    };
  }) => {
    try {
      logger.info('Editor AI action requested', {
        action: payload.action,
        filePath: payload.filePath,
        language: payload.language,
        hasSelectedCode: !!payload.selectedCode,
        hasFileContent: !!payload.fileContent,
      });

      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();

      if (!service) {
        logger.error('Editor AI service not initialized');
        return { success: false, action: payload.action, error: 'Editor AI service not initialized' };
      }

      const result = await service.executeAction(payload as Parameters<typeof service.executeAction>[0]);
      
      if (!result.success) {
        logger.warn('Editor AI action failed', {
          action: payload.action,
          error: result.error,
        });
      } else {
        logger.info('Editor AI action completed successfully', {
          action: payload.action,
          provider: result.provider,
          latencyMs: result.latencyMs,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Editor AI action failed with exception', {
        action: payload.action,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return { success: false, action: payload.action, error: errorMessage };
    }
  });

  // ==========================================================================
  // Quick Fixes
  // ==========================================================================

  ipcMain.handle('editor-ai:quick-fix', async (_event, payload: {
    filePath: string;
    language: string;
    diagnostic: {
      message: string;
      severity: 'error' | 'warning' | 'info' | 'hint';
      line: number;
      column: number;
      endLine?: number;
      endColumn?: number;
      source?: string;
      code?: string | number;
    };
    codeContext: string;
    fileContent?: string;
  }) => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();

      if (!service) {
        return { fixes: [], error: 'Editor AI service not initialized' };
      }

      return await service.getQuickFixes(payload);
    } catch (error) {
      logger.error('Editor AI quick fix failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { fixes: [], error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Control & Cache Management
  // ==========================================================================

  ipcMain.handle('editor-ai:cancel', async () => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();
      service?.cancelPending();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('editor-ai:clear-cache', async () => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();
      service?.clearCache();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('editor-ai:get-cache-stats', async () => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();
      const stats = service?.getCacheStats() ?? { hits: 0, misses: 0, hitRate: 0 };
      return stats;
    } catch (error) {
      logger.error('Failed to get editor AI cache stats', { error: (error as Error).message });
      return { hits: 0, misses: 0, hitRate: 0 };
    }
  });

  // ==========================================================================
  // Status & Diagnostics
  // ==========================================================================

  ipcMain.handle('editor-ai:get-status', async () => {
    try {
      const { getEditorAIService } = await import('../agent/editor');
      const service = getEditorAIService();
      
      if (!service) {
        return {
          initialized: false,
          error: 'Service not initialized. Make sure the app has fully loaded and at least one provider is configured.',
          providers: [],
          config: null,
        };
      }

      const orchestrator = getOrchestrator();
      // Use getProvidersInfo() to get detailed provider info
      const providersInfo = orchestrator?.getProvidersInfo() ?? [];
      const settings = getSettingsStore().get();
      const enabledCount = providersInfo.filter(p => p.enabled && p.hasApiKey).length;

      return {
        initialized: true,
        providers: providersInfo.map(p => ({
          name: p.name,
          enabled: p.enabled,
          hasApiKey: p.hasApiKey,
        })),
        config: settings.editorAISettings,
        hasProviders: providersInfo.length > 0,
        enabledProviders: enabledCount,
      };
    } catch (error) {
      return {
        initialized: false,
        error: (error as Error).message,
        providers: [],
        config: null,
      };
    }
  });
}
