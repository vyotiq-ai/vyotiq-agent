import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { minimatch } from 'minimatch';
import type { AgentOrchestrator } from './agent/orchestrator';
import type { SettingsStore } from './agent/settingsStore';
import type { WorkspaceManager } from './workspaces/workspaceManager';
import { getCacheManager } from './agent/cache/CacheManager';
import { getToolResultCache } from './agent/cache/ToolResultCache';
import { getContextCache } from './agent/cache/ContextCache';
import {
  initTypeScriptDiagnosticsService,
  getTypeScriptDiagnosticsService,
  type DiagnosticsEvent,
  type DiagnosticsSnapshot,
} from './agent/workspace/TypeScriptDiagnosticsService';
import type {
  AttachmentPayload,
  RendererEvent,
  UpdateSettingsPayload,
} from '../shared/types';
import { guessMimeType } from './utils/mime';
import { createLogger } from './logger';
import { getGitService } from './git';
import { resolvePath } from './utils/fileSystem';

const logger = createLogger('IPC');

interface IpcContext {
  getOrchestrator: () => AgentOrchestrator | null;
  getSettingsStore: () => SettingsStore;
  getWorkspaceManager: () => WorkspaceManager;
  getMainWindow: () => BrowserWindow | null;
  emitToRenderer: (event: RendererEvent) => void;
}

export const registerIpcHandlers = (context: IpcContext) => {
  const { getOrchestrator, getSettingsStore, getWorkspaceManager, getMainWindow, emitToRenderer } = context;

  /** Get the active workspace path or null */
  const getActiveWorkspacePath = (): string | null => {
    const active = getWorkspaceManager().getActive();
    return active?.path ?? null;
  };

  /** Get the language identifier from a file path */
  const languageFromPath = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.json':
        return 'json';
      case '.md':
      case '.mdx':
        return 'markdown';
      case '.css':
        return 'css';
      case '.html':
      case '.htm':
        return 'html';
      case '.yml':
      case '.yaml':
        return 'yaml';
      default:
        return ext.replace(/^\./, '') || 'text';
    }
  };

  /** Check if a file path matches an ignore pattern */
  const matchesIgnorePattern = (filePath: string, patterns: string[]): boolean => {
    return patterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
  };

  /** Emit file change event to renderer for real-time file tree updates */
  const emitFileChange = (type: 'create' | 'write' | 'delete' | 'rename' | 'createDir', filePath: string, oldPath?: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    
    mainWindow.webContents.send('files:changed', {
      type,
      path: filePath,
      ...(oldPath && { oldPath }),
    });
    
    logger.debug('File change event emitted', { type, path: filePath, oldPath });
  };

  // Use Electron's app module for diagnostics and to avoid dead imports.
  // This is intentionally low-noise (debug) and does not affect UI behavior.
  logger.debug('Registering IPC handlers', {
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
  });

  ipcMain.handle('agent:start-session', async (_event, payload) => {
    try {
      logger.info('Starting session', { workspaceId: payload.workspaceId });
      const session = await getOrchestrator()?.startSession(payload);
      logger.info('Session started successfully', { sessionId: session?.id });
      return session;
    } catch (error) {
      logger.error('Failed to start session', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('agent:send-message', async (_event, payload) => {
    try {
      logger.info('Sending message for session', {
        sessionId: payload.sessionId,
        contentLength: payload.content.length,
        attachmentCount: payload.attachments?.length ?? 0,
      });
      return await getOrchestrator()?.sendMessage(payload);
    } catch (error) {
      logger.error('Failed to send message', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('agent:confirm-tool', async (_event, payload) => getOrchestrator()?.confirmTool(payload));
  ipcMain.handle('agent:update-config', async (_event, payload) => getOrchestrator()?.updateConfig(payload));
  ipcMain.handle('agent:cancel-run', async (_event, sessionId: string) => {
    logger.info('IPC agent:cancel-run received', { sessionId });
    try {
      await getOrchestrator()?.cancelRun(sessionId);
      logger.info('IPC agent:cancel-run completed', { sessionId });
    } catch (error) {
      logger.error('IPC agent:cancel-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('agent:pause-run', (_event, sessionId: string) => {
    logger.info('IPC agent:pause-run received', { sessionId });
    try {
      const result = getOrchestrator()?.pauseRun(sessionId) ?? false;
      logger.info('IPC agent:pause-run completed', { sessionId, result });
      return { success: result };
    } catch (error) {
      logger.error('IPC agent:pause-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:resume-run', (_event, sessionId: string) => {
    logger.info('IPC agent:resume-run received', { sessionId });
    try {
      const result = getOrchestrator()?.resumeRun(sessionId) ?? false;
      logger.info('IPC agent:resume-run completed', { sessionId, result });
      return { success: result };
    } catch (error) {
      logger.error('IPC agent:resume-run failed', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('agent:is-run-paused', (_event, sessionId: string) => {
    return getOrchestrator()?.isRunPaused(sessionId) ?? false;
  });

  ipcMain.handle('agent:get-sessions', () => getOrchestrator()?.getSessions());

  // Check if system has available providers configured
  ipcMain.handle('agent:has-available-providers', () => {
    return getOrchestrator()?.hasAvailableProviders() ?? false;
  });

  // Get list of available providers
  ipcMain.handle('agent:get-available-providers', () => {
    return getOrchestrator()?.getAvailableProviders() ?? [];
  });

  // Get cooldown status for all providers
  ipcMain.handle('agent:get-providers-cooldown', () => {
    return getOrchestrator()?.getProvidersCooldownStatus() ?? {};
  });

  // Get sessions filtered by workspace ID - returns only sessions for the specified workspace
  ipcMain.handle('agent:get-sessions-by-workspace', (_event, workspaceId: string) => {
    try {
      logger.info('Getting sessions for workspace', { workspaceId });
      const sessions = getOrchestrator()?.getSessionsByWorkspace(workspaceId);
      
      // Debug: Log usage data availability
      if (sessions && sessions.length > 0) {
        const sessionsWithUsage = sessions.filter(s => 
          s.messages.some(m => m.usage)
        );
        logger.debug('Sessions usage data', {
          workspaceId,
          totalSessions: sessions.length,
          sessionsWithUsage: sessionsWithUsage.length,
          sampleSession: sessions[0] ? {
            id: sessions[0].id,
            messageCount: sessions[0].messages.length,
            messagesWithUsage: sessions[0].messages.filter(m => m.usage).length,
          } : null,
        });
      }
      
      logger.info('Retrieved sessions', { count: sessions?.length ?? 0, workspaceId });
      return sessions ?? [];
    } catch (error) {
      logger.error('Failed to get sessions by workspace', { workspaceId, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Get session summaries for lazy loading (faster than full sessions)
  ipcMain.handle('agent:get-session-summaries', async (_event, workspaceId?: string) => {
    try {
      const summaries = await getOrchestrator()?.getSessionSummaries(workspaceId);
      return summaries ?? [];
    } catch (error) {
      logger.error('Failed to get session summaries', { workspaceId, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Get sessions for the currently active workspace
  ipcMain.handle('agent:get-active-workspace-sessions', () => {
    return getOrchestrator()?.getActiveWorkspaceSessions();
  });

  ipcMain.handle('agent:delete-session', async (_event, sessionId: string) => getOrchestrator()?.deleteSession(sessionId));
  ipcMain.handle('agent:regenerate', async (_event, sessionId: string) => getOrchestrator()?.regenerate(sessionId));
  ipcMain.handle('agent:rename-session', async (_event, sessionId: string, title: string) => {
    return getOrchestrator()?.renameSession(sessionId, title);
  });

  ipcMain.handle('agent:update-editor-state', (_event, state) => {
    getOrchestrator()?.updateEditorState(state);
    return { success: true };
  });

  // Edit message and resend - truncates conversation and triggers new run
  ipcMain.handle('agent:edit-message', async (_event, sessionId: string, messageIndex: number, newContent: string) => {
    try {
      // Convert messageIndex to messageId by getting the session and finding the message
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }
      // Get all sessions and find the matching one
      const sessions = orchestrator.getSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      const message = session.messages[messageIndex];
      if (!message) {
        return { success: false, error: `Message at index ${messageIndex} not found` };
      }
      return await orchestrator.editMessageAndResend(sessionId, message.id, newContent);
    } catch (error) {
      logger.error('Failed to edit message', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // Add reaction to a message
  ipcMain.handle('agent:add-reaction', async (_event, sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };
      return await orchestrator.addReaction(sessionId, messageId, reaction);
    } catch (error) {
      logger.error('Failed to add reaction', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // Branch management - create a new branch from a message
  ipcMain.handle('agent:create-branch', async (_event, sessionId: string, messageId: string, name?: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };

      return orchestrator.createBranch(sessionId, messageId, name);
    } catch (error) {
      logger.error('Failed to create branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // Switch to a different branch
  ipcMain.handle('agent:switch-branch', async (_event, sessionId: string, branchId: string | null) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };

      return orchestrator.switchBranch(sessionId, branchId);
    } catch (error) {
      logger.error('Failed to switch branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete a branch
  ipcMain.handle('agent:delete-branch', async (_event, sessionId: string, branchId: string) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) return { success: false, error: 'Orchestrator not available' };

      return orchestrator.deleteBranch(sessionId, branchId);
    } catch (error) {
      logger.error('Failed to delete branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Undo History IPC Handlers
  // ==========================================================================

  ipcMain.handle('undo:get-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.getSessionHistory(sessionId);
    } catch (error) {
      logger.error('Failed to get undo history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('undo:get-grouped-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.getGroupedHistory(sessionId);
    } catch (error) {
      logger.error('Failed to get grouped undo history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('undo:undo-change', async (_event, sessionId: string, changeId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.undoChange(sessionId, changeId);
    } catch (error) {
      logger.error('Failed to undo change', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('undo:redo-change', async (_event, sessionId: string, changeId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.redoChange(sessionId, changeId);
    } catch (error) {
      logger.error('Failed to redo change', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('undo:undo-run', async (_event, sessionId: string, runId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.undoRun(sessionId, runId);
    } catch (error) {
      logger.error('Failed to undo run', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: (error as Error).message, count: 0 };
    }
  });

  ipcMain.handle('undo:get-undoable-count', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      return await undoHistory.getUndoableCount(sessionId);
    } catch (error) {
      logger.error('Failed to get undoable count', { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  });

  ipcMain.handle('undo:clear-history', async (_event, sessionId: string) => {
    try {
      const { undoHistory } = await import('./agent/undoHistory');
      await undoHistory.clearSessionHistory(sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear undo history', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  });

  // ==========================================================================
  // Debug IPC Handlers
  // ==========================================================================

  ipcMain.handle('debug:get-traces', (_event, sessionId: string) => {
    try {
      return getOrchestrator()?.getDebugTracesForSession(sessionId) ?? [];
    } catch (error) {
      logger.error('Failed to get debug traces', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('debug:get-active-trace', () => {
    try {
      return getOrchestrator()?.getActiveDebugTrace() ?? null;
    } catch (error) {
      logger.error('Failed to get active debug trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:get-trace', (_event, traceId: string) => {
    try {
      return getOrchestrator()?.getTrace(traceId) ?? null;
    } catch (error) {
      logger.error('Failed to get trace', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('debug:set-enabled', (_event, enabled: boolean) => {
    try {
      getOrchestrator()?.setDebugEnabled(enabled);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set debug enabled', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:export-trace', (_event, traceId: string, format: 'json' | 'markdown' | 'html' = 'json') => {
    try {
      const exported = getOrchestrator()?.exportTrace(traceId, format);
      return { success: true, content: exported };
    } catch (error) {
      logger.error('Failed to export trace', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:update-config', (_event, config: {
    verbose?: boolean;
    captureFullPayloads?: boolean;
    stepMode?: boolean;
    exportOnError?: boolean;
    exportFormat?: 'json' | 'markdown';
  }) => {
    try {
      getOrchestrator()?.updateDebugConfig(config);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update debug config', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:clear-traces', (_event, sessionId: string) => {
    try {
      getOrchestrator()?.clearTracesForSession(sessionId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear traces', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:save-trace-to-file', async (_event, traceId: string, format: 'json' | 'markdown' = 'json') => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'No main window available' };
      }

      const exported = getOrchestrator()?.exportTrace(traceId, format);
      if (!exported) {
        return { success: false, error: 'Failed to export trace' };
      }

      const extension = format === 'markdown' ? 'md' : 'json';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Trace',
        defaultPath: `trace-${traceId.slice(0, 8)}.${extension}`,
        filters: [
          { name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      await fs.writeFile(result.filePath, exported, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      logger.error('Failed to save trace to file', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('debug:get-all-traces', () => {
    try {
      return getOrchestrator()?.getAllTraces() ?? [];
    } catch (error) {
      logger.error('Failed to get all traces', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('debug:get-debug-config', () => {
    try {
      return getOrchestrator()?.getDebugConfig() ?? null;
    } catch (error) {
      logger.error('Failed to get debug config', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  // ==========================================================================
  // Settings IPC Handlers
  // ==========================================================================

  ipcMain.handle('settings:get', () => getSettingsStore().get());
  ipcMain.handle('settings:update', async (_event, payload: UpdateSettingsPayload) => {
    const updated = await getSettingsStore().update(payload.settings ?? {});
    getOrchestrator()?.refreshProviders();

    // Apply cache settings to cache managers
    if (updated.cacheSettings) {
      const toolCache = getToolResultCache();
      const contextCache = getContextCache();

      // Update tool result cache config
      if (updated.cacheSettings.toolCache) {
        toolCache.updateConfig({
          maxAge: updated.cacheSettings.toolCache.defaultTtlMs,
          maxSize: updated.cacheSettings.toolCache.maxEntries,
          enableLRU: updated.cacheSettings.enableLruEviction,
        });
      }

      // Update context cache config
      if (updated.cacheSettings.contextCache) {
        contextCache.setConfig({
          maxSizeBytes: updated.cacheSettings.contextCache.maxSizeMb * 1024 * 1024,
          defaultTTL: updated.cacheSettings.contextCache.defaultTtlMs,
          enableTTL: updated.cacheSettings.contextCache.enabled,
        });
      }
    }

    // Apply debug settings to the debugger at runtime
    if (updated.debugSettings) {
      const orchestrator = getOrchestrator();
      if (orchestrator) {
        // Update debug config
        orchestrator.updateDebugConfig({
          verbose: updated.debugSettings.verboseLogging,
          captureFullPayloads: updated.debugSettings.captureFullPayloads,
          stepMode: updated.debugSettings.stepByStepMode,
          exportOnError: updated.debugSettings.autoExportOnError,
          exportFormat: updated.debugSettings.traceExportFormat,
        });

        // Enable or disable debug mode based on verbose logging setting
        orchestrator.setDebugEnabled(updated.debugSettings.verboseLogging);
      }
    }

    emitToRenderer({ type: 'settings-update', settings: updated });
    return updated;
  });

  // ==========================================================================
  // OpenRouter Models IPC Handler
  // ==========================================================================

  ipcMain.handle('openrouter:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.openrouter;
      
      if (!apiKey) {
        return { success: false, error: 'OpenRouter API key not configured', models: [] };
      }
      
      const { OpenRouterProvider } = await import('./agent/providers/openrouterProvider');
      const { normalizeApiModel, setCachedModels } = await import('./agent/providers/modelCache');
      const provider = new OpenRouterProvider(apiKey);
      const models = await provider.fetchModels();
      
      // Cache normalized models for routing
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'openrouter'));
      setCachedModels('openrouter', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenRouter models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // Anthropic Models IPC Handler
  // ==========================================================================

  ipcMain.handle('anthropic:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.anthropic;
      
      if (!apiKey) {
        return { success: false, error: 'Anthropic API key not configured', models: [] };
      }
      
      const { AnthropicProvider } = await import('./agent/providers/anthropicProvider');
      const { normalizeApiModel, setCachedModels } = await import('./agent/providers/modelCache');
      const provider = new AnthropicProvider(apiKey);
      const models = await provider.fetchModels();
      
      // Cache normalized models for routing
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'anthropic'));
      setCachedModels('anthropic', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Anthropic models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // OpenAI Models IPC Handler
  // ==========================================================================

  ipcMain.handle('openai:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.openai;
      
      if (!apiKey) {
        return { success: false, error: 'OpenAI API key not configured', models: [] };
      }
      
      const { OpenAIProvider } = await import('./agent/providers/openAIProvider');
      const { normalizeApiModel, setCachedModels } = await import('./agent/providers/modelCache');
      const provider = new OpenAIProvider(apiKey);
      const models = await provider.fetchModels();
      
      // Cache normalized models for routing
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'openai'));
      setCachedModels('openai', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch OpenAI models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // DeepSeek Models IPC Handler
  // ==========================================================================

  ipcMain.handle('deepseek:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.deepseek;
      
      if (!apiKey) {
        return { success: false, error: 'DeepSeek API key not configured', models: [] };
      }
      
      const { DeepSeekProvider } = await import('./agent/providers/deepseekProvider');
      const { normalizeApiModel, setCachedModels } = await import('./agent/providers/modelCache');
      const provider = new DeepSeekProvider(apiKey);
      const models = await provider.fetchModels();
      
      // Cache normalized models for routing
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'deepseek'));
      setCachedModels('deepseek', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch DeepSeek models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // Gemini Models IPC Handler
  // ==========================================================================

  ipcMain.handle('gemini:fetch-models', async () => {
    try {
      const settings = getSettingsStore().get();
      const apiKey = settings.apiKeys.gemini;
      
      if (!apiKey) {
        return { success: false, error: 'Gemini API key not configured', models: [] };
      }
      
      const { GeminiProvider } = await import('./agent/providers/geminiProvider');
      const { normalizeApiModel, setCachedModels } = await import('./agent/providers/modelCache');
      const provider = new GeminiProvider(apiKey);
      const models = await provider.fetchModels();
      
      // Cache normalized models for routing
      const normalized = models.map(m => normalizeApiModel(m as unknown as Record<string, unknown>, 'gemini'));
      setCachedModels('gemini', normalized);
      
      return { success: true, models };
    } catch (error) {
      logger.error('Failed to fetch Gemini models', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', models: [] };
    }
  });

  // ==========================================================================
  // Workspace IPC Handlers
  // ==========================================================================

  ipcMain.handle('workspace:list', () => {
    return getWorkspaceManager().list();
  });

  ipcMain.handle('workspace:add', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return getWorkspaceManager().list();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return getWorkspaceManager().list();
    await getWorkspaceManager().add(result.filePaths[0]);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });
    
    // Start file watcher for the new workspace if it's active
    const active = entries.find((entry) => entry.isActive);
    if (active) {
      try {
        const { watchWorkspace } = await import('./workspaces/fileWatcher');
        await watchWorkspace(active.path);
        logger.info('File watcher started for new workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to start file watcher for new workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return entries;
  });

  ipcMain.handle('workspace:set-active', async (_event, workspaceId: string) => {
    await getWorkspaceManager().setActive(workspaceId);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });
    // Re-initialize git for the new workspace
    const active = entries.find((entry) => entry.isActive);
    if (active) {
      await getGitService().init(active.path);
      
      // Update file watcher for the new workspace
      try {
        const { watchWorkspace, setLSPChangeHandler } = await import('./workspaces/fileWatcher');
        await watchWorkspace(active.path);
        
        // Connect file watcher to LSP bridge
        const { getLSPBridge } = await import('./lsp');
        setLSPChangeHandler((filePath, changeType) => {
          const bridge = getLSPBridge();
          if (bridge) {
            bridge.onFileChanged(filePath, changeType);
          }
        });
        
        logger.info('File watcher updated for workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to update file watcher for workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Initialize LSP manager for the new workspace
      try {
        const { getLSPManager } = await import('./lsp');
        const lspManager = getLSPManager();
        if (lspManager) {
          await lspManager.initialize(active.path);
          logger.info('LSP manager initialized for workspace', { workspacePath: active.path });
        }
      } catch (error) {
        logger.warn('Failed to initialize LSP manager for workspace', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Initialize TypeScript diagnostics service for the new workspace
      try {
        const { initTypeScriptDiagnosticsService, getTypeScriptDiagnosticsService } = await import('./agent/workspace/TypeScriptDiagnosticsService');
        const existingService = getTypeScriptDiagnosticsService();
        if (existingService) {
          existingService.dispose();
        }
        const tsDiagnosticsService = initTypeScriptDiagnosticsService(logger);
        await tsDiagnosticsService.initialize(active.path);
        
        // Forward diagnostics events to renderer
        tsDiagnosticsService.on('diagnostics', (event) => {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('diagnostics:updated', event);
          }
        });
        
        logger.info('TypeScript diagnostics service initialized for workspace', { workspacePath: active.path });
      } catch (error) {
        logger.warn('Failed to initialize TypeScript diagnostics service', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return entries;
  });

  ipcMain.handle('workspace:remove', async (_event, workspaceId: string) => {
    await getWorkspaceManager().remove(workspaceId);
    const entries = getWorkspaceManager().list();
    emitToRenderer({ type: 'workspace-update', workspaces: entries });
    return entries;
  });

  // ==========================================================================
  // Workspace Diagnostics IPC Handlers
  // ==========================================================================

  // Track active diagnostics listener for cleanup
  let diagnosticsListener: ((event: DiagnosticsEvent) => void) | null = null;

  /**
   * Initialize the TypeScript Diagnostics Service for the active workspace.
   * Called when workspace changes or when diagnostics subscription starts.
   */
  const initDiagnosticsServiceForWorkspace = async (): Promise<boolean> => {
    const workspacePath = getActiveWorkspacePath();
    if (!workspacePath) {
      logger.debug('No active workspace for diagnostics service');
      return false;
    }

    // Check if service already exists and is initialized for this workspace
    let service = getTypeScriptDiagnosticsService();
    if (service && service.isReady()) {
      return true;
    }

    // Initialize new service
    const diagnosticsLogger = createLogger('TypeScriptDiagnostics');
    service = initTypeScriptDiagnosticsService(diagnosticsLogger);
    
    const success = await service.initialize(workspacePath);
    if (!success) {
      logger.warn('Failed to initialize TypeScript diagnostics service', { workspacePath });
      return false;
    }

    logger.info('TypeScript diagnostics service initialized', { workspacePath });
    return true;
  };

  /**
   * Get workspace-wide diagnostics (all errors/warnings from entire codebase)
   * Uses TypeScript Language Service for real-time incremental diagnostics
   * @param options.forceRefresh - Force a fresh diagnostics collection
   */
  ipcMain.handle('workspace:get-diagnostics', async (_event, options?: { forceRefresh?: boolean }) => {
    try {
      logger.debug('workspace:get-diagnostics called', { forceRefresh: options?.forceRefresh });
      
      // Ensure diagnostics service is initialized
      const initialized = await initDiagnosticsServiceForWorkspace();
      const service = getTypeScriptDiagnosticsService();
      
      if (!initialized || !service) {
        // Fallback to orchestrator method if TypeScript service unavailable
        const orchestrator = getOrchestrator();
        if (!orchestrator) {
          return { success: false, error: 'Orchestrator not initialized' };
        }
        
        const diagnostics = await orchestrator.getWorkspaceDiagnostics();
        if (!diagnostics) {
          return { success: true, diagnostics: [], message: 'No active workspace' };
        }
        
        return {
          success: true,
          diagnostics: diagnostics.diagnostics,
          errorCount: diagnostics.errorCount,
          warningCount: diagnostics.warningCount,
          filesWithErrors: diagnostics.filesWithErrors,
          collectedAt: diagnostics.collectedAt,
        };
      }

      // Use new TypeScript Language Service for real-time diagnostics
      let snapshot: DiagnosticsSnapshot;
      if (options?.forceRefresh) {
        snapshot = await service.refreshAll();
      } else {
        snapshot = service.getSnapshot();
      }

      logger.debug('workspace:get-diagnostics: Returning diagnostics', {
        count: snapshot.diagnostics.length,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
      });

      return {
        success: true,
        diagnostics: snapshot.diagnostics,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
        filesWithErrors: snapshot.filesWithErrors,
        collectedAt: snapshot.timestamp,
      };
    } catch (error) {
      logger.error('Failed to get workspace diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Subscribe to real-time diagnostics updates.
   * Returns immediately and pushes updates via 'diagnostics:updated' event.
   */
  ipcMain.handle('workspace:diagnostics-subscribe', async () => {
    try {
      const initialized = await initDiagnosticsServiceForWorkspace();
      const service = getTypeScriptDiagnosticsService();
      const mainWindow = getMainWindow();
      
      if (!initialized || !service || !mainWindow) {
        logger.warn('Cannot subscribe to diagnostics: service or window not available');
        return { success: false, error: 'Diagnostics service not available' };
      }

      // Remove existing listener if any
      if (diagnosticsListener) {
        service.removeListener('diagnostics', diagnosticsListener);
      }

      // Create new listener that forwards events to renderer
      diagnosticsListener = (event: DiagnosticsEvent) => {
        if (event.type === 'diagnostics-updated' && event.snapshot) {
          mainWindow.webContents.send('diagnostics:updated', {
            diagnostics: event.snapshot.diagnostics,
            errorCount: event.snapshot.errorCount,
            warningCount: event.snapshot.warningCount,
            filesWithErrors: event.snapshot.filesWithErrors,
            timestamp: event.snapshot.timestamp,
          });
        } else if (event.type === 'file-diagnostics' && event.filePath && event.diagnostics) {
          mainWindow.webContents.send('diagnostics:file-updated', {
            filePath: event.filePath,
            diagnostics: event.diagnostics,
          });
        } else if (event.type === 'diagnostics-cleared') {
          mainWindow.webContents.send('diagnostics:cleared', {});
        }
      };

      service.on('diagnostics', diagnosticsListener);
      logger.info('Diagnostics subscription started');

      // Send initial snapshot
      const snapshot = service.getSnapshot();
      mainWindow.webContents.send('diagnostics:updated', {
        diagnostics: snapshot.diagnostics,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
        filesWithErrors: snapshot.filesWithErrors,
        timestamp: snapshot.timestamp,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to subscribe to diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Unsubscribe from real-time diagnostics updates.
   */
  ipcMain.handle('workspace:diagnostics-unsubscribe', () => {
    try {
      const service = getTypeScriptDiagnosticsService();
      
      if (service && diagnosticsListener) {
        service.removeListener('diagnostics', diagnosticsListener);
        diagnosticsListener = null;
        logger.info('Diagnostics subscription stopped');
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to unsubscribe from diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Notify the diagnostics service about a file change.
   * This is called internally when files are modified via IPC.
   */
  const notifyDiagnosticsOfFileChange = (filePath: string, changeType: 'create' | 'change' | 'delete') => {
    const service = getTypeScriptDiagnosticsService();
    if (service && service.isReady()) {
      service.onFileChanged(filePath, changeType);
    }
  };

  // ==========================================================================
  // File Selection IPC Handlers
  // ==========================================================================

  ipcMain.handle('files:select', async (_event, options?: { filters?: Electron.FileFilter[] }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters,
    });
    if (result.canceled) return [];
    const files: AttachmentPayload[] = await Promise.all(
      result.filePaths.map(async (filePath) => {
        const buffer = await fs.readFile(filePath);
        return {
          id: randomUUID(),
          name: path.basename(filePath),
          path: filePath,
          size: buffer.byteLength,
          mimeType: guessMimeType(filePath),
          encoding: 'base64',
          content: buffer.toString('base64'),
        };
      }),
    );
    return files;
  });

  ipcMain.handle('files:read', async (_event, filePaths: string[]) => {
    const files: AttachmentPayload[] = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const buffer = await fs.readFile(filePath);
          return {
            id: randomUUID(),
            name: path.basename(filePath),
            path: filePath,
            size: buffer.byteLength,
            mimeType: guessMimeType(filePath),
            encoding: 'base64',
            content: buffer.toString('base64'),
          };
        } catch (error) {
          logger.error('Failed to read file', { path: filePath, error });
          return {
            id: randomUUID(),
            name: path.basename(filePath),
            path: filePath,
            size: 0,
            mimeType: 'text/plain',
            encoding: 'utf-8',
            content: '',
            error: (error as Error).message,
          };
        }
      }),
    );
    return files;
  });

  ipcMain.handle('files:open', async (_event, filePath: string) => {
    try {
      // Open file with the system's default application
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('files:reveal', async (_event, filePath: string) => {
    // Reveal file in file explorer
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle('files:saveAs', async (_event, content: string, options?: {
    defaultPath?: string;
    filters?: Electron.FileFilter[];
    title?: string;
  }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { success: false, error: 'No main window available' };

    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options?.title ?? 'Save File',
        defaultPath: options?.defaultPath,
        filters: options?.filters ?? [
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      await fs.writeFile(result.filePath, content, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // File Operations IPC Handlers
  // ==========================================================================

  // Create new file
  ipcMain.handle('files:create', async (_event, filePath: string, content: string = '') => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      // Check if file already exists
      try {
        await fs.access(resolvedPath);
        return { success: false, error: `File already exists: ${filePath}` };
      } catch {
        // File doesn't exist, we can create it
      }

      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Create file
      await fs.writeFile(resolvedPath, content, 'utf-8');

      const stats = await fs.stat(resolvedPath);

      logger.info('File created', { path: resolvedPath });

      // Emit file change event for real-time file tree updates
      emitFileChange('create', resolvedPath);
      
      // Notify diagnostics service of file creation
      notifyDiagnosticsOfFileChange(resolvedPath, 'create');

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        language: languageFromPath(resolvedPath),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  // Write content to file (overwrites if exists)
  ipcMain.handle('files:write', async (_event, filePath: string, content: string = '') => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file (overwrites if exists)
      await fs.writeFile(resolvedPath, content, 'utf-8');

      const stats = await fs.stat(resolvedPath);

      logger.info('File written', { path: resolvedPath });

      // Emit file change event for real-time file tree updates
      emitFileChange('write', resolvedPath);
      
      // Notify diagnostics service of file change
      notifyDiagnosticsOfFileChange(resolvedPath, 'change');

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        language: languageFromPath(resolvedPath),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to write file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  // Create new directory
  ipcMain.handle('files:createDir', async (_event, dirPath: string) => {
    try {
      const resolvedPath = path.isAbsolute(dirPath)
        ? dirPath
        : resolvePath(dirPath, getActiveWorkspacePath() ?? undefined);

      await fs.mkdir(resolvedPath, { recursive: true });

      logger.info('Directory created', { path: resolvedPath });

      // Emit file change event for real-time file tree updates
      emitFileChange('createDir', resolvedPath);

      return { success: true, path: resolvedPath };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create directory', { error: err.message, dirPath });
      return { success: false, error: err.message };
    }
  });

  // Delete file or directory
  ipcMain.handle('files:delete', async (_event, filePath: string) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(resolvedPath);
      }

      logger.info('File/directory deleted', { path: resolvedPath, isDirectory: stats.isDirectory() });

      // Emit file change event for real-time file tree updates
      emitFileChange('delete', resolvedPath);
      
      // Notify diagnostics service of file deletion (only for files, not directories)
      if (!stats.isDirectory()) {
        notifyDiagnosticsOfFileChange(resolvedPath, 'delete');
      }

      return { success: true, path: resolvedPath };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${filePath}` };
      }
      logger.error('Failed to delete file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  // Rename file or directory
  ipcMain.handle('files:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      const resolvedOldPath = path.isAbsolute(oldPath)
        ? oldPath
        : resolvePath(oldPath, getActiveWorkspacePath() ?? undefined);
      const resolvedNewPath = path.isAbsolute(newPath)
        ? newPath
        : resolvePath(newPath, getActiveWorkspacePath() ?? undefined);

      await fs.rename(resolvedOldPath, resolvedNewPath);

      logger.info('File/directory renamed', { from: resolvedOldPath, to: resolvedNewPath });

      // Emit file change event for real-time file tree updates
      emitFileChange('rename', resolvedNewPath, resolvedOldPath);
      
      // Notify diagnostics service of rename (delete old, create new)
      notifyDiagnosticsOfFileChange(resolvedOldPath, 'delete');
      notifyDiagnosticsOfFileChange(resolvedNewPath, 'create');

      return { success: true, oldPath: resolvedOldPath, newPath: resolvedNewPath };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to rename file', { error: err.message, oldPath, newPath });
      return { success: false, error: err.message };
    }
  });

  // Get file info (stats)
  ipcMain.handle('files:stat', async (_event, filePath: string) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      const stats = await fs.stat(resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        name: path.basename(resolvedPath),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtimeMs,
        modifiedAt: stats.mtimeMs,
        language: stats.isFile() ? languageFromPath(resolvedPath) : undefined,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `Path not found: ${filePath}` };
      }
      return { success: false, error: err.message };
    }
  });

  // ==========================================================================
  // Cache Management IPC Handlers
  // ==========================================================================

  // Get all cache statistics
  ipcMain.handle('cache:get-stats', async () => {
    const promptCache = getCacheManager();
    const toolCache = getToolResultCache();
    const contextCache = getContextCache();

    const promptStats = promptCache.getSummary();
    const toolStats = toolCache.getStats();
    const contextStats = contextCache.getStats();

    return {
      prompt: {
        totalHits: promptStats.totalHits,
        totalMisses: promptStats.totalMisses,
        hitRate: promptStats.overallHitRate,
        tokensSaved: promptStats.totalTokensSaved,
        costSaved: promptStats.totalCostSaved,
        creations: promptStats.totalCreations,
        byProvider: promptCache.getAllStats(),
      },
      toolResult: {
        size: toolStats.size,
        maxSize: toolStats.maxSize,
        hits: toolStats.hits,
        misses: toolStats.misses,
        hitRate: toolStats.hitRate,
        byTool: toolStats.byTool,
      },
      context: {
        entries: contextStats.entries,
        sizeBytes: contextStats.sizeBytes,
        hits: contextStats.hits,
        misses: contextStats.misses,
        hitRate: contextStats.hitRate,
        evictions: contextStats.evictions,
        expirations: contextStats.expirations,
      },
    };
  });

  // Clear specific cache or all caches
  ipcMain.handle('cache:clear', async (_event, cacheType?: 'prompt' | 'tool' | 'context' | 'all') => {
    const type = cacheType ?? 'all';
    const promptCache = getCacheManager();
    const toolCache = getToolResultCache();
    const contextCache = getContextCache();

    const cleared: string[] = [];

    if (type === 'prompt' || type === 'all') {
      promptCache.resetStats();
      cleared.push('prompt');
    }

    if (type === 'tool' || type === 'all') {
      toolCache.invalidateAll();
      toolCache.resetStats();
      cleared.push('tool');
    }

    if (type === 'context' || type === 'all') {
      contextCache.clear();
      contextCache.resetStats();
      cleared.push('context');
    }

    return { success: true, cleared };
  });

  // Update tool result cache configuration
  ipcMain.handle('cache:update-tool-config', async (_event, config: { maxAge?: number; maxSize?: number }) => {
    const toolCache = getToolResultCache();
    toolCache.updateConfig(config);
    return { success: true };
  });

  // Cleanup expired tool results (aggressive clearing)
  ipcMain.handle('cache:cleanup-tool-results', async () => {
    const toolCache = getToolResultCache();
    const removed = toolCache.cleanup();
    return { success: true, removed };
  });

  // Invalidate tool results for a specific path
  ipcMain.handle('cache:invalidate-path', async (_event, path: string) => {
    const toolCache = getToolResultCache();
    const invalidated = toolCache.invalidatePath(path);
    return { success: true, invalidated };
  });

  // ==========================================================================
  // File Tree IPC Handlers
  // ==========================================================================

  ipcMain.handle('files:list-dir', async (_event, dirPath: string, options?: {
    showHidden?: boolean;
    recursive?: boolean;
    maxDepth?: number;
    ignorePatterns?: string[];
  }) => {
    try {
      // Resolve the path relative to active workspace if needed
      const resolvedPath = path.isAbsolute(dirPath) ? dirPath : resolvePath(dirPath, getActiveWorkspacePath() ?? undefined);

      // Validate that the directory exists before attempting to list it
      try {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          return { success: false, error: `Path is not a directory: ${resolvedPath}`, files: [] };
        }
      } catch (statError) {
        const errorCode = (statError as NodeJS.ErrnoException).code;
        if (errorCode === 'ENOENT') {
          return { success: false, error: `Directory does not exist: ${resolvedPath}`, files: [] };
        }
        throw statError;
      }

      const showHidden = options?.showHidden ?? false;
      const recursive = options?.recursive ?? false;
      const maxDepth = options?.maxDepth ?? 10;
      const ignorePatterns = options?.ignorePatterns ?? [];

      // Default ignore patterns for common non-essential directories
      const defaultIgnorePatterns = ['node_modules', '__pycache__', '.git', 'dist', 'build', '.next', '.cache'];
      const allIgnorePatterns = [...defaultIgnorePatterns, ...ignorePatterns];

      interface FileNode {
        name: string;
        path: string;
        type: 'file' | 'directory';
        language?: string;
        children?: FileNode[];
      }

      const listDir = async (dir: string, depth: number): Promise<FileNode[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: FileNode[] = [];

        for (const entry of entries) {
          // Skip hidden files unless requested
          if (!showHidden && entry.name.startsWith('.')) continue;

          // Check against ignore patterns using minimatch
          if (matchesIgnorePattern(entry.name, allIgnorePatterns)) continue;

          const fullPath = path.join(dir, entry.name);
          const isDirectory = entry.isDirectory();

          const node: FileNode = {
            name: entry.name,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file',
            language: isDirectory ? undefined : languageFromPath(fullPath),
          };

          if (isDirectory && recursive && depth < maxDepth) {
            try {
              node.children = await listDir(fullPath, depth + 1);
            } catch (err) {
              // Permission errors for subdirectories are common and non-critical
              logger.debug('Cannot read subdirectory (permission denied or other)', {
                path: fullPath,
                error: err instanceof Error ? err.message : String(err)
              });
              node.children = [];
            }
          }

          results.push(node);
        }

        // Sort: directories first, then files, alphabetically
        return results.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      };

      const files = await listDir(resolvedPath, 0);
      return { success: true, files };
    } catch (error) {
      logger.error('Failed to list directory', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, files: [] };
    }
  });

  // ==========================================================================
  // Git IPC Handlers
  // ==========================================================================

  // Initialize git for active workspace
  const initGitForWorkspace = async () => {
    const workspaces = getWorkspaceManager().list();
    const active = workspaces.find(w => w.isActive);
    if (active) {
      await getGitService().init(active.path);
    }
  };

  // Initialize git on startup
  initGitForWorkspace();

  ipcMain.handle('git:status', async () => {
    return getGitService().status();
  });

  ipcMain.handle('git:is-repo', async () => {
    return getGitService().isRepo();
  });

  ipcMain.handle('git:current-branch', async () => {
    return getGitService().currentBranch();
  });

  ipcMain.handle('git:diff', async (_event, filePath?: string, staged?: boolean) => {
    return getGitService().diff(filePath, staged);
  });

  ipcMain.handle('git:show-file', async (_event, filePath: string, ref?: string) => {
    return getGitService().showFile(filePath, ref);
  });

  ipcMain.handle('git:stage', async (_event, paths: string[]) => {
    return getGitService().stage(paths);
  });

  ipcMain.handle('git:unstage', async (_event, paths: string[]) => {
    return getGitService().unstage(paths);
  });

  ipcMain.handle('git:discard', async (_event, filePath: string) => {
    return getGitService().discard(filePath);
  });

  ipcMain.handle('git:commit', async (_event, message: string, options?: { amend?: boolean; all?: boolean }) => {
    return getGitService().commit(message, options);
  });

  ipcMain.handle('git:log', async (_event, options?: { maxCount?: number; skip?: number; filePath?: string }) => {
    return getGitService().log(options);
  });

  ipcMain.handle('git:diff-refs', async (_event, ref1: string, ref2?: string) => {
    return getGitService().diffRefs(ref1, ref2);
  });

  ipcMain.handle('git:branches', async (_event, all?: boolean) => {
    return getGitService().branches(all);
  });

  ipcMain.handle('git:create-branch', async (_event, name: string, startPoint?: string) => {
    return getGitService().createBranch(name, startPoint);
  });

  ipcMain.handle('git:delete-branch', async (_event, name: string, force?: boolean) => {
    return getGitService().deleteBranch(name, force);
  });

  ipcMain.handle('git:checkout', async (_event, ref: string, options?: { create?: boolean }) => {
    return getGitService().checkout(ref, options);
  });

  ipcMain.handle('git:remotes', async () => {
    return getGitService().remotes();
  });

  ipcMain.handle('git:fetch', async (_event, remote?: string, prune?: boolean) => {
    return getGitService().fetch(remote, prune);
  });

  ipcMain.handle('git:pull', async (_event, remote?: string, branch?: string) => {
    return getGitService().pull(remote, branch);
  });

  ipcMain.handle('git:push', async (_event, remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }) => {
    return getGitService().push(remote, branch, options);
  });

  ipcMain.handle('git:stash', async (_event, message?: string) => {
    return getGitService().stash(message);
  });

  ipcMain.handle('git:stash-pop', async (_event, index?: number) => {
    return getGitService().stashPop(index);
  });

  ipcMain.handle('git:stash-apply', async (_event, index?: number) => {
    return getGitService().stashApply(index);
  });

  ipcMain.handle('git:stash-drop', async (_event, index?: number) => {
    return getGitService().stashDrop(index);
  });

  ipcMain.handle('git:stash-list', async () => {
    return getGitService().stashList();
  });

  ipcMain.handle('git:blame', async (_event, filePath: string) => {
    return getGitService().blame(filePath);
  });

  ipcMain.handle('git:merge', async (_event, branch: string, options?: { noFf?: boolean; squash?: boolean }) => {
    return getGitService().merge(branch, options);
  });

  // ==========================================================================
  // Advanced Git Integration IPC Handlers
  // ==========================================================================

  // Git Operation Manager handlers
  ipcMain.handle('git:request-access', async (_event, agentId: string, operation: string, params?: Record<string, unknown>, priority?: number) => {
    try {
      const { getGitOperationManager } = await import('./agent/git');
      const manager = getGitOperationManager();
      if (!manager) {
        return { success: false, error: 'Git operation manager not initialized' };
      }
      return await manager.requestAccess(agentId, operation as import('./agent/git').GitOperationType, params, priority);
    } catch (error) {
      logger.error('Failed to request git access', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:set-agent-permissions', async (_event, agentId: string, permissions: Partial<import('./agent/git').AgentGitPermissions>) => {
    try {
      const { getGitOperationManager } = await import('./agent/git');
      const manager = getGitOperationManager();
      if (!manager) {
        return { success: false, error: 'Git operation manager not initialized' };
      }
      manager.setAgentPermissions(agentId, permissions);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set agent permissions', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-operation-history', async (_event, agentId?: string, limit?: number) => {
    try {
      const { getGitOperationManager } = await import('./agent/git');
      const manager = getGitOperationManager();
      if (!manager) return [];
      return manager.getOperationHistory(agentId, limit);
    } catch (error) {
      logger.error('Failed to get operation history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Branch Manager handlers
  ipcMain.handle('git:create-task-branch', async (_event, taskId: string, agentId: string, description?: string) => {
    try {
      const { getBranchManager } = await import('./agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.createTaskBranch(taskId, agentId, description);
    } catch (error) {
      logger.error('Failed to create task branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:create-agent-branch', async (_event, agentId: string, baseBranch?: string) => {
    try {
      const { getBranchManager } = await import('./agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.createAgentBranch(agentId, baseBranch);
    } catch (error) {
      logger.error('Failed to create agent branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:merge-branch', async (_event, branchName: string, agentId: string, options?: { squash?: boolean; deleteAfter?: boolean }) => {
    try {
      const { getBranchManager } = await import('./agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.mergeBranch(branchName, agentId, options);
    } catch (error) {
      logger.error('Failed to merge branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-agent-branches', async (_event, agentId: string) => {
    try {
      const { getBranchManager } = await import('./agent/git');
      const manager = getBranchManager();
      if (!manager) return [];
      return manager.getAgentBranches(agentId);
    } catch (error) {
      logger.error('Failed to get agent branches', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Commit Coordinator handlers
  ipcMain.handle('git:queue-change', async (_event, agentId: string, filePath: string, changeType: string, description?: string, priority?: number) => {
    try {
      const { getCommitCoordinator } = await import('./agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) {
        return null;
      }
      return coordinator.queueChange(agentId, filePath, changeType as import('./agent/git').PendingChange['changeType'], description, priority);
    } catch (error) {
      logger.error('Failed to queue change', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('git:create-commit', async (_event, agentId: string, message: string, options?: { files?: string[]; all?: boolean }) => {
    try {
      const { getCommitCoordinator } = await import('./agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) {
        return { success: false, error: 'Commit coordinator not initialized' };
      }
      return await coordinator.createCommit(agentId, message, options);
    } catch (error) {
      logger.error('Failed to create commit', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-pending-changes', async (_event, agentId?: string) => {
    try {
      const { getCommitCoordinator } = await import('./agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) return [];
      return agentId ? coordinator.getAgentPendingChanges(agentId) : coordinator.getAllPendingChanges();
    } catch (error) {
      logger.error('Failed to get pending changes', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Conflict Resolver handlers
  ipcMain.handle('git:detect-conflicts', async () => {
    try {
      const { getGitConflictResolver } = await import('./agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) return [];
      return await resolver.detectConflicts();
    } catch (error) {
      logger.error('Failed to detect conflicts', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('git:resolve-conflict', async (_event, conflictId: string, agentId: string, strategy?: string) => {
    try {
      const { getGitConflictResolver } = await import('./agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) {
        return { success: false, error: 'Conflict resolver not initialized' };
      }
      return await resolver.resolveConflict(conflictId, agentId, strategy as import('./agent/git').ConflictResolutionType);
    } catch (error) {
      logger.error('Failed to resolve conflict', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-active-conflicts', async () => {
    try {
      const { getGitConflictResolver } = await import('./agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) return [];
      return resolver.getActiveConflicts();
    } catch (error) {
      logger.error('Failed to get active conflicts', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Re-initialize git when workspace changes
  ipcMain.on('workspace:changed', () => {
    initGitForWorkspace();
  });

  // ==========================================================================
  // Browser IPC Handlers
  // ==========================================================================

  ipcMain.handle('browser:navigate', async (_event, url: string) => {
    try {
      const { getBrowserManager } = await import('./browser');
      const browser = getBrowserManager();
      return await browser.navigate(url);
    } catch (error) {
      logger.error('Browser navigation failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, url, title: '' };
    }
  });

  ipcMain.handle('browser:extract', async (_event, options?: { includeHtml?: boolean; maxLength?: number }) => {
    try {
      const { getBrowserManager } = await import('./browser');
      const browser = getBrowserManager();
      return await browser.extractContent(options);
    } catch (error) {
      logger.error('Browser extract failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('browser:screenshot', async (_event, options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }) => {
    try {
      const { getBrowserManager } = await import('./browser');
      const browser = getBrowserManager();
      return await browser.screenshot(options);
    } catch (error) {
      logger.error('Browser screenshot failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('browser:back', async () => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().goBack();
  });

  ipcMain.handle('browser:forward', async () => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().goForward();
  });

  ipcMain.handle('browser:reload', async () => {
    const { getBrowserManager } = await import('./browser');
    await getBrowserManager().reload();
    return { success: true };
  });

  ipcMain.handle('browser:stop', async () => {
    const { getBrowserManager } = await import('./browser');
    getBrowserManager().stop();
    return { success: true };
  });

  ipcMain.handle('browser:state', async () => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().getState();
  });

  ipcMain.handle('browser:attach', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const { getBrowserManager } = await import('./browser');
      const browser = getBrowserManager();
      browser.attach(bounds);
      return { success: true };
    } catch (error) {
      logger.error('Browser attach failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:detach', async () => {
    const { getBrowserManager } = await import('./browser');
    getBrowserManager().detach();
    return { success: true };
  });

  ipcMain.handle('browser:setBounds', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    const { getBrowserManager } = await import('./browser');
    getBrowserManager().setBounds(bounds);
    return { success: true };
  });

  ipcMain.handle('browser:click', async (_event, selector: string) => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().click(selector);
  });

  ipcMain.handle('browser:type', async (_event, selector: string, text: string) => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().type(selector, text);
  });

  ipcMain.handle('browser:hover', async (_event, selector: string) => {
    try {
      const { getBrowserManager } = await import('./browser');
      return await getBrowserManager().hover(selector);
    } catch (error) {
      logger.error('Browser hover failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:fill', async (_event, selector: string, value: string) => {
    try {
      const { getBrowserManager } = await import('./browser');
      return await getBrowserManager().fill(selector, value);
    } catch (error) {
      logger.error('Browser fill failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:scroll', async (_event, direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => {
    const { getBrowserManager } = await import('./browser');
    await getBrowserManager().scroll(direction, amount);
    return { success: true };
  });

  ipcMain.handle('browser:evaluate', async (_event, script: string) => {
    try {
      const { getBrowserManager } = await import('./browser');
      return await getBrowserManager().evaluate(script);
    } catch (error) {
      logger.error('Browser evaluate failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle('browser:query', async (_event, selector: string, limit?: number) => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().queryElements(selector, limit);
  });

  ipcMain.handle('browser:waitForElement', async (_event, selector: string, timeout?: number) => {
    const { getBrowserManager } = await import('./browser');
    return getBrowserManager().waitForElement(selector, timeout);
  });

  ipcMain.handle('browser:clearData', async () => {
    const { getBrowserManager } = await import('./browser');
    await getBrowserManager().clearData();
    return { success: true };
  });

  // =========================================================================
  // Browser Security Handlers
  // =========================================================================

  ipcMain.handle('browser:security:getConfig', async () => {
    const { getBrowserSecurity } = await import('./browser');
    return getBrowserSecurity().getConfig();
  });

  ipcMain.handle('browser:security:updateConfig', async (_event, config: Record<string, unknown>) => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().updateConfig(config);
    return { success: true };
  });

  ipcMain.handle('browser:security:getStats', async () => {
    const { getBrowserSecurity } = await import('./browser');
    return getBrowserSecurity().getStats();
  });

  ipcMain.handle('browser:security:getEvents', async (_event, limit?: number) => {
    const { getBrowserSecurity } = await import('./browser');
    return getBrowserSecurity().getEvents(limit);
  });

  ipcMain.handle('browser:security:checkUrl', async (_event, url: string) => {
    const { getBrowserSecurity } = await import('./browser');
    return getBrowserSecurity().checkUrlSafety(url);
  });

  ipcMain.handle('browser:security:addToAllowList', async (_event, url: string) => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().addToAllowList(url);
    return { success: true };
  });

  ipcMain.handle('browser:security:removeFromAllowList', async (_event, url: string) => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().removeFromAllowList(url);
    return { success: true };
  });

  ipcMain.handle('browser:security:addToBlockList', async (_event, url: string) => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().addToBlockList(url);
    return { success: true };
  });

  ipcMain.handle('browser:security:removeFromBlockList', async (_event, url: string) => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().removeFromBlockList(url);
    return { success: true };
  });

  ipcMain.handle('browser:security:resetStats', async () => {
    const { getBrowserSecurity } = await import('./browser');
    getBrowserSecurity().resetStats();
    return { success: true };
  });

  // =========================================================================
  // Browser Debugging Handlers (Console & Network)
  // =========================================================================

  ipcMain.handle('browser:console:getLogs', async (_event, options?: {
    level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
    limit?: number;
    filter?: string;
  }) => {
    try {
      const { getConsoleLogs } = await import('./tools/implementations/browser/console');
      return { success: true, logs: getConsoleLogs(options) };
    } catch (error) {
      logger.error('Failed to get console logs', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, logs: [], error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:console:clear', async () => {
    try {
      const { clearConsoleLogs } = await import('./tools/implementations/browser/console');
      clearConsoleLogs();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear console logs', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:network:getRequests', async (_event, options?: {
    type?: string;
    status?: string;
    limit?: number;
    urlPattern?: string;
  }) => {
    try {
      const { getNetworkRequests } = await import('./tools/implementations/browser/network');
      return { success: true, requests: getNetworkRequests(options) };
    } catch (error) {
      logger.error('Failed to get network requests', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, requests: [], error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:network:clear', async () => {
    try {
      const { clearNetworkRequests } = await import('./tools/implementations/browser/network');
      clearNetworkRequests();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear network requests', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // =========================================================================
  // Browser Behavior Settings Handler
  // =========================================================================

  ipcMain.handle('browser:applyBehaviorSettings', async (_event, settings: {
    navigationTimeout?: number;
    maxContentLength?: number;
    customUserAgent?: string;
    enableJavaScript?: boolean;
    enableCookies?: boolean;
    clearDataOnExit?: boolean;
  }) => {
    try {
      const { getBrowserManager } = await import('./browser');
      const browser = getBrowserManager();
      browser.applyBehaviorSettings(settings);
      return { success: true };
    } catch (error) {
      logger.error('Failed to apply browser behavior settings', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Editor AI IPC Handlers
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
      const { getEditorAIService } = await import('./agent/editor');
      const service = getEditorAIService();

      if (!service) {
        return { text: null, error: 'Editor AI service not initialized' };
      }

      return await service.getInlineCompletion(payload);
    } catch (error) {
      logger.error('Editor AI inline completion failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { text: null, error: (error as Error).message };
    }
  });

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

      const { getEditorAIService } = await import('./agent/editor');
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
      const { getEditorAIService } = await import('./agent/editor');
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

  ipcMain.handle('editor-ai:cancel', async () => {
    try {
      const { getEditorAIService } = await import('./agent/editor');
      const service = getEditorAIService();
      service?.cancelPending();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('editor-ai:clear-cache', async () => {
    try {
      const { getEditorAIService } = await import('./agent/editor');
      const service = getEditorAIService();
      service?.clearCache();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('editor-ai:get-cache-stats', async () => {
    try {
      const { getEditorAIService } = await import('./agent/editor');
      const service = getEditorAIService();
      const stats = service?.getCacheStats() ?? { hits: 0, misses: 0, hitRate: 0 };
      return stats;
    } catch (error) {
      logger.error('Failed to get editor AI cache stats', { error: (error as Error).message });
      return { hits: 0, misses: 0, hitRate: 0 };
    }
  });

  // Add diagnostic handler for debugging editor AI issues
  ipcMain.handle('editor-ai:get-status', async () => {
    try {
      const { getEditorAIService } = await import('./agent/editor');
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
      // Use getProvidersInfo() to get detailed provider info, not getAvailableProviders() which returns strings
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

  // ==========================================================================
  // LSP (Language Server Protocol) IPC Handlers
  // ==========================================================================

  // ==========================================================================
  // LSP (Language Server Protocol) IPC Handlers
  // ==========================================================================

  /**
   * Initialize LSP manager for a workspace
   */
  ipcMain.handle('lsp:initialize', async (_event, workspacePath: string) => {
    try {
      const { initLSPManager, getLSPManager } = await import('./lsp');
      
      let manager = getLSPManager();
      if (!manager) {
        manager = initLSPManager(logger);
      }
      
      await manager.initialize(workspacePath);
      
      return { 
        success: true, 
        availableServers: manager.getAvailableServers(),
      };
    } catch (error) {
      logger.error('Failed to initialize LSP manager', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get LSP client info for all active servers
   */
  ipcMain.handle('lsp:get-clients', async () => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: true, clients: [] };
      }
      
      return { success: true, clients: manager.getClientInfo() };
    } catch (error) {
      logger.error('Failed to get LSP clients', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, clients: [] };
    }
  });

  /**
   * Get available language servers
   */
  ipcMain.handle('lsp:get-available-servers', async () => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: true, servers: [] };
      }
      
      return { success: true, servers: manager.getAvailableServers() };
    } catch (error) {
      logger.error('Failed to get available servers', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, servers: [] };
    }
  });

  /**
   * Start a specific language server
   */
  ipcMain.handle('lsp:start-server', async (_event, language: string) => {
    try {
      const { getLSPManager, isLanguageSupported } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      
      const started = await manager.startServer(language as Parameters<typeof manager.startServer>[0]);
      return { success: started, error: started ? undefined : 'Failed to start server' };
    } catch (error) {
      logger.error('Failed to start LSP server', { language, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Stop a specific language server
   */
  ipcMain.handle('lsp:stop-server', async (_event, language: string) => {
    try {
      const { getLSPManager, isLanguageSupported } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      if (!isLanguageSupported(language)) {
        return { success: false, error: `Language not supported: ${language}` };
      }
      
      await manager.stopServer(language as Parameters<typeof manager.stopServer>[0]);
      return { success: true };
    } catch (error) {
      logger.error('Failed to stop LSP server', { language, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get hover information at a position
   */
  ipcMain.handle('lsp:hover', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const hover = await manager.getHover(filePath, line, column);
      return { success: true, hover };
    } catch (error) {
      logger.error('Failed to get hover', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get definition location(s)
   */
  ipcMain.handle('lsp:definition', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const locations = await manager.getDefinition(filePath, line, column);
      return { success: true, locations };
    } catch (error) {
      logger.error('Failed to get definition', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get references to a symbol
   */
  ipcMain.handle('lsp:references', async (_event, filePath: string, line: number, column: number, includeDeclaration?: boolean) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const locations = await manager.getReferences(filePath, line, column, includeDeclaration ?? true);
      return { success: true, locations };
    } catch (error) {
      logger.error('Failed to get references', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get document symbols
   */
  ipcMain.handle('lsp:document-symbols', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const symbols = await manager.getDocumentSymbols(filePath);
      return { success: true, symbols };
    } catch (error) {
      logger.error('Failed to get document symbols', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Search workspace symbols
   */
  ipcMain.handle('lsp:workspace-symbols', async (_event, query: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const symbols = await manager.searchWorkspaceSymbols(query);
      return { success: true, symbols };
    } catch (error) {
      logger.error('Failed to search workspace symbols', { query, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get completions at a position
   */
  ipcMain.handle('lsp:completions', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const completions = await manager.getCompletions(filePath, line, column);
      return { success: true, completions };
    } catch (error) {
      logger.error('Failed to get completions', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get diagnostics for files
   */
  ipcMain.handle('lsp:diagnostics', async (_event, filePath?: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const diagnostics = filePath 
        ? await manager.getDiagnostics(filePath)
        : manager.getAllDiagnostics();
      
      return { success: true, diagnostics };
    } catch (error) {
      logger.error('Failed to get diagnostics', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get code actions for a range
   */
  ipcMain.handle('lsp:code-actions', async (_event, filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const actions = await manager.getCodeActions(filePath, startLine, startColumn, endLine, endColumn);
      return { success: true, actions };
    } catch (error) {
      logger.error('Failed to get code actions', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get signature help at a position
   */
  ipcMain.handle('lsp:signature-help', async (_event, filePath: string, line: number, column: number) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const signatureHelp = await manager.getSignatureHelp(filePath, line, column);
      return { success: true, signatureHelp };
    } catch (error) {
      logger.error('Failed to get signature help', { filePath, line, column, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Format a document
   */
  ipcMain.handle('lsp:format', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const edits = await manager.formatDocument(filePath);
      return { success: true, edits };
    } catch (error) {
      logger.error('Failed to format document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Rename a symbol
   */
  ipcMain.handle('lsp:rename', async (_event, filePath: string, line: number, column: number, newName: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      const edits = await manager.renameSymbol(filePath, line, column, newName);
      return { success: true, edits };
    } catch (error) {
      logger.error('Failed to rename symbol', { filePath, line, column, newName, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Open a document in the language server
   */
  ipcMain.handle('lsp:open-document', async (_event, filePath: string, content?: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      await manager.openDocument(filePath, content);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Update a document in the language server
   */
  ipcMain.handle('lsp:update-document', async (_event, filePath: string, content: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      manager.updateDocument(filePath, content);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Close a document in the language server
   */
  ipcMain.handle('lsp:close-document', async (_event, filePath: string) => {
    try {
      const { getLSPManager } = await import('./lsp');
      const manager = getLSPManager();
      
      if (!manager) {
        return { success: false, error: 'LSP manager not initialized' };
      }
      
      manager.closeDocument(filePath);
      return { success: true };
    } catch (error) {
      logger.error('Failed to close document', { filePath, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Shutdown LSP manager
   */
  ipcMain.handle('lsp:shutdown', async () => {
    try {
      const { shutdownLSPManager } = await import('./lsp');
      await shutdownLSPManager();
      return { success: true };
    } catch (error) {
      logger.error('Failed to shutdown LSP manager', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Refresh all diagnostics (TypeScript + LSP)
   */
  ipcMain.handle('lsp:refresh-diagnostics', async () => {
    try {
      const workspacePath = getActiveWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No active workspace' };
      }

      // Refresh TypeScript diagnostics
      const { getTypeScriptDiagnosticsService } = await import('./agent/workspace/TypeScriptDiagnosticsService');
      const tsService = getTypeScriptDiagnosticsService();
      let tsSnapshot = null;
      if (tsService?.isReady()) {
        tsSnapshot = await tsService.refreshAll();
      }

      // Get LSP diagnostics
      const { getLSPManager } = await import('./lsp');
      const lspManager = getLSPManager();
      const lspDiagnostics = lspManager?.getAllDiagnostics() ?? [];

      return {
        success: true,
        typescript: tsSnapshot ? {
          errorCount: tsSnapshot.errorCount,
          warningCount: tsSnapshot.warningCount,
          diagnosticsCount: tsSnapshot.diagnostics.length,
        } : null,
        lsp: {
          diagnosticsCount: lspDiagnostics.length,
        },
      };
    } catch (error) {
      logger.error('Failed to refresh diagnostics', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Session Health Monitoring IPC Handlers
  // ==========================================================================

  /**
   * Get session health status
   */
  ipcMain.handle('agent:get-session-health', async (_event, sessionId: string) => {
    try {
      const { getSessionHealthMonitor } = await import('./agent/sessionHealth');
      const monitor = getSessionHealthMonitor();
      return monitor.getHealthStatus(sessionId);
    } catch (error) {
      logger.error('Failed to get session health', { sessionId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  /**
   * Get all active monitored sessions
   */
  ipcMain.handle('agent:get-active-health-sessions', async () => {
    try {
      const { getSessionHealthMonitor } = await import('./agent/sessionHealth');
      const monitor = getSessionHealthMonitor();
      return monitor.getActiveSessions();
    } catch (error) {
      logger.error('Failed to get active health sessions', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // ==========================================================================
  // Model Quality Tracking IPC Handlers
  // ==========================================================================

  /**
   * Get model quality metrics
   */
  ipcMain.handle('agent:get-model-quality', async (_event, modelId: string, provider: string) => {
    try {
      const { getModelQualityTracker } = await import('./agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getMetrics(modelId, provider as import('../shared/types').LLMProviderName);
    } catch (error) {
      logger.error('Failed to get model quality', { modelId, provider, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  /**
   * Get all ranked models by quality
   */
  ipcMain.handle('agent:get-ranked-models', async () => {
    try {
      const { getModelQualityTracker } = await import('./agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getRankedModels();
    } catch (error) {
      logger.error('Failed to get ranked models', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  /**
   * Get global model quality stats
   */
  ipcMain.handle('agent:get-model-quality-stats', async () => {
    try {
      const { getModelQualityTracker } = await import('./agent/modelQuality');
      const tracker = getModelQualityTracker();
      return tracker.getGlobalStats();
    } catch (error) {
      logger.error('Failed to get model quality stats', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  /**
   * Record user reaction for model quality tracking
   */
  ipcMain.handle('agent:record-model-reaction', async (_event, modelId: string, provider: string, reaction: 'up' | 'down') => {
    try {
      const { getModelQualityTracker } = await import('./agent/modelQuality');
      const tracker = getModelQualityTracker();
      tracker.recordUserReaction(modelId, provider as import('../shared/types').LLMProviderName, reaction);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record model reaction', { modelId, provider, reaction, error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Loop Detection IPC Handlers
  // ==========================================================================

  /**
   * Get loop detection state for a run
   */
  ipcMain.handle('agent:get-loop-detection-state', async (_event, runId: string) => {
    try {
      const { getLoopDetector } = await import('./agent/loopDetection');
      const detector = getLoopDetector();
      return detector.getState(runId) ?? null;
    } catch (error) {
      logger.error('Failed to get loop detection state', { runId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  /**
   * Check if circuit breaker is triggered for a run
   */
  ipcMain.handle('agent:is-circuit-breaker-triggered', async (_event, runId: string) => {
    try {
      const { getLoopDetector } = await import('./agent/loopDetection');
      const detector = getLoopDetector();
      return detector.shouldTriggerCircuitBreaker(runId);
    } catch (error) {
      logger.error('Failed to check circuit breaker', { runId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  // ==========================================================================
  // Claude Code Subscription OAuth IPC Handlers
  // ==========================================================================

  ipcMain.handle('claude:start-oauth', async () => {
    try {
      const { importClaudeCodeCredentials, startBackgroundRefresh, setSubscriptionUpdateCallback, setStatusChangeCallback } = await import('./agent/claudeAuth');
      const subscription = await importClaudeCodeCredentials();
      
      // Save subscription to settings
      await getSettingsStore().update({ claudeSubscription: subscription });
      
      // Set callback to emit status changes to renderer
      setStatusChangeCallback((event) => {
        emitToRenderer({
          type: 'claude-subscription',
          eventType: event.type,
          message: event.message,
          tier: event.tier,
        });
      });
      
      // Set callback to auto-save refreshed tokens
      setSubscriptionUpdateCallback(async (updated) => {
        await getSettingsStore().update({ claudeSubscription: updated });
        emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
        getOrchestrator()?.refreshProviders();
      });
      
      // Start background refresh
      startBackgroundRefresh(subscription);
      
      // Refresh providers to use new subscription
      getOrchestrator()?.refreshProviders();
      
      // Emit settings update to renderer
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
      
      logger.info('Claude Code credentials imported', { tier: subscription.tier });
      return { success: true, subscription };
    } catch (error) {
      logger.error('Claude Code import failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Import failed' };
    }
  });

  ipcMain.handle('claude:disconnect', async () => {
    try {
      const { clearClaudeSubscription, setSubscriptionUpdateCallback, setStatusChangeCallback } = await import('./agent/claudeAuth');
      await clearClaudeSubscription();
      
      // Clear callbacks
      setSubscriptionUpdateCallback(null);
      setStatusChangeCallback(null);
      
      // Remove subscription from settings
      await getSettingsStore().update({ claudeSubscription: undefined });
      
      // Refresh providers
      getOrchestrator()?.refreshProviders();
      
      // Emit settings update to renderer
      emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
      
      logger.info('Claude subscription disconnected');
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect Claude subscription', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Disconnect failed' };
    }
  });

  ipcMain.handle('claude:get-subscription-status', async () => {
    try {
      const settings = getSettingsStore().get();
      const { getSubscriptionStatus } = await import('./agent/claudeAuth');
      return getSubscriptionStatus(settings.claudeSubscription);
    } catch (error) {
      logger.error('Failed to get subscription status', { error: error instanceof Error ? error.message : String(error) });
      return { connected: false };
    }
  });

  ipcMain.handle('claude:refresh-token', async () => {
    try {
      const settings = getSettingsStore().get();
      if (!settings.claudeSubscription?.refreshToken) {
        return { success: false, error: 'No refresh token available' };
      }

      const { refreshClaudeToken } = await import('./agent/claudeAuth');
      const subscription = await refreshClaudeToken(settings.claudeSubscription.refreshToken);
      
      // Save updated subscription
      await getSettingsStore().update({ claudeSubscription: subscription });
      
      // Refresh providers to use updated token
      getOrchestrator()?.refreshProviders();
      
      logger.info('Claude token refreshed', { tier: subscription.tier });
      return { success: true, subscription };
    } catch (error) {
      logger.error('Failed to refresh Claude token', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Token refresh failed' };
    }
  });

  ipcMain.handle('claude:check-installed', async () => {
    try {
      const { isClaudeCodeInstalled, hasClaudeCodeCredentials, isClaudeCodeCLIAvailable } = await import('./agent/claudeAuth');
      const cliAvailable = await isClaudeCodeCLIAvailable();
      const installed = await isClaudeCodeInstalled();
      const hasCredentials = installed ? await hasClaudeCodeCredentials() : false;
      return { installed, hasCredentials, cliAvailable };
    } catch (error) {
      logger.error('Failed to check Claude Code installation', { error: error instanceof Error ? error.message : String(error) });
      return { installed: false, hasCredentials: false, cliAvailable: false };
    }
  });

  ipcMain.handle('claude:launch-auth', async () => {
    try {
      const { launchClaudeAuthentication, setAuthCompleteCallback } = await import('./agent/claudeAuth');
      
      // Set callback to handle auth completion
      setAuthCompleteCallback(async (subscription) => {
        // Save subscription to settings
        await getSettingsStore().update({ claudeSubscription: subscription });
        
        // Refresh providers
        getOrchestrator()?.refreshProviders();
        
        // Emit settings update
        emitToRenderer({ type: 'settings-update', settings: getSettingsStore().get() });
        
        logger.info('Claude auth completed via file watcher', { tier: subscription.tier });
      });
      
      return await launchClaudeAuthentication();
    } catch (error) {
      logger.error('Failed to launch Claude authentication', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Launch failed' };
    }
  });

  // ==========================================================================
};
