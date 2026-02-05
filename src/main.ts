import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { AgentOrchestrator } from './main/agent/orchestrator';
import { ConsoleLogger } from './main/logger';
import { SettingsStore } from './main/agent/settingsStore';
import { WorkspaceManager } from './main/workspaces/workspaceManager';
import { getToolResultCache, getContextCache } from './main/agent/cache';
import { initBrowserManager, getBrowserManager } from './main/browser';
import { initFileWatcher, watchWorkspace, stopWatching } from './main/workspaces/fileWatcher';
import type { RendererEvent, BrowserState } from './shared/types';
import { registerIpcHandlers, IpcEventBatcher, type EventPriority as _EventPriority } from './main/ipc';
import { getSessionHealthMonitor } from './main/agent/sessionHealth';
import { initThrottleController, getThrottleController } from './main/agent/performance/BackgroundThrottleController';
import { getThrottleEventLogger } from './main/agent/performance/ThrottleEventLogger';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Suppress benign Chromium/DevTools errors that don't affect functionality:
// - Autofill.enable/setAddresses: DevTools Protocol errors when DevTools is open
// - GPU cache errors: Harmless disk cache permission issues on Windows
app.commandLine.appendSwitch('disable-features', 'AutofillEnableAccountWalletStorage,AutofillServerCommunication');
// Disable GPU shader disk cache to prevent "Unable to create cache" errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow: BrowserWindow | null = null;
let orchestrator: AgentOrchestrator | null = null;
let settingsStore: SettingsStore;
let workspaceManager: WorkspaceManager;
let infraInitialized = false;
let ipcRegistered = false;
let eventBatcher: IpcEventBatcher | null = null;
const logger = new ConsoleLogger('Vyotiq');

/**
 * High-performance event emission with batching for high-frequency events.
 * Uses IpcEventBatcher for streaming deltas and other frequent updates.
 */
const emitToRenderer = (event: RendererEvent): void => {
  if (!mainWindow) return;

  // Use batcher for high-frequency events when available
  if (eventBatcher) {
    eventBatcher.send('agent:event', event);
  } else {
    // Fallback to direct send before batcher is initialized
    mainWindow.webContents.send('agent:event', event);
  }

  if (event.type === 'browser-state') {
    // Real-time browser state updates for the browser panel
    if (eventBatcher) {
      eventBatcher.send('browser:state-changed', event.state);
    } else {
      mainWindow.webContents.send('browser:state-changed', event.state);
    }
  } else if (event.type === 'file-changed') {
    // Real-time file change events for file tree updates
    const payload = event as unknown as { changeType: string; path: string; oldPath?: string };
    mainWindow.webContents.send('files:changed', {
      type: payload.changeType,
      path: payload.path,
      ...(payload.oldPath && { oldPath: payload.oldPath }),
    });
  } else if (event.type === 'session-health-update') {
    // Session health update events for real-time monitoring
    const healthEvent = event as unknown as { sessionId: string; data: unknown };
    mainWindow.webContents.send('session-health:update', {
      sessionId: healthEvent.sessionId,
      status: healthEvent.data,
    });
  }
};

/**
 * Initialize heavy services (LSP, TypeScript diagnostics) in background
 * Called after window is shown to prevent UI freeze
 */
const initializeDeferredServices = async () => {
  const activeWorkspace = workspaceManager.getActive();
  
  // Initialize LSP manager for multi-language code intelligence
  const { initLSPManager, getLSPManager, initLSPBridge, getLSPBridge } = await import('./main/lsp');
  initLSPManager(logger);
  logger.info('LSP manager initialized');

  // Initialize LSP bridge for real-time file change synchronization
  const lspBridge = initLSPBridge(logger);

  // Initialize LSP for active workspace if one exists (runs async checks now)
  if (activeWorkspace?.path) {
    const lspManager = getLSPManager();
    if (lspManager) {
      // Non-blocking - uses async exec now
      lspManager.initialize(activeWorkspace.path).then(() => {
        logger.info('LSP manager initialized for active workspace', { workspacePath: activeWorkspace.path });
      }).catch((err) => {
        logger.warn('LSP initialization failed', { error: err instanceof Error ? err.message : String(err) });
      });

      // Forward LSPManager diagnostics events to renderer (real-time push from language servers)
      lspManager.on('diagnostics', ({ uri, diagnostics, language }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Convert file:// URI to file path
          let filePath = uri;
          try {
            if (uri.startsWith('file://')) {
              filePath = new URL(uri).pathname;
              // Handle Windows paths (remove leading slash)
              if (process.platform === 'win32' && filePath.startsWith('/')) {
                filePath = filePath.slice(1);
              }
            }
          } catch {
            // Keep original URI if parsing fails
          }
          
          mainWindow.webContents.send('lsp:diagnostics-updated', {
            filePath,
            diagnostics,
            source: 'lsp',
            language,
            timestamp: Date.now(),
          });
        }
      });
    }

    // Initialize TypeScript diagnostics service for the workspace (non-blocking)
    const { initTypeScriptDiagnosticsService } = await import('./main/agent/workspace/TypeScriptDiagnosticsService');
    const tsDiagnosticsService = initTypeScriptDiagnosticsService(logger);
    
    // Run in background - don't await
    tsDiagnosticsService.initialize(activeWorkspace.path).then(() => {
      logger.info('TypeScript diagnostics service initialized');
    }).catch((err) => {
      logger.debug('TypeScript diagnostics not available', { error: err instanceof Error ? err.message : String(err) });
    });

    // Forward diagnostics events to renderer in the expected format
    tsDiagnosticsService.on('diagnostics', (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
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
      }
    });
  }

  // Connect file watcher to LSP bridge for real-time updates
  const { setLSPChangeHandler } = await import('./main/workspaces/fileWatcher');
  setLSPChangeHandler((filePath, changeType) => {
    const bridge = getLSPBridge();
    if (bridge) {
      bridge.onFileChanged(filePath, changeType);
    }
  });

  // Forward LSP diagnostics updates to renderer
  lspBridge.on('diagnostics', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lsp:diagnostics-updated', event);
    }
  });

  logger.info('LSP bridge connected to file watcher');
  
  logger.info('Deferred services initialization complete');
};

const bootstrapInfrastructure = async () => {
  if (infraInitialized) return;

  try {
    const userData = app.getPath('userData');

    // Initialize all services
    settingsStore = new SettingsStore(path.join(userData, 'settings.json'));
    workspaceManager = new WorkspaceManager(path.join(userData, 'workspaces.json'));

    // Load all data in parallel
    await Promise.all([settingsStore.load(), workspaceManager.load()]);

    // Apply cache settings from persisted settings
    const settings = settingsStore.get();
    if (settings.cacheSettings) {
      const toolCache = getToolResultCache();
      const contextCache = getContextCache();

      // Apply tool cache settings
      if (settings.cacheSettings.toolCache) {
        toolCache.updateConfig({
          maxAge: settings.cacheSettings.toolCache.defaultTtlMs,
          maxSize: settings.cacheSettings.toolCache.maxEntries,
          enableLRU: settings.cacheSettings.enableLruEviction,
        });
      }

      // Apply context cache settings
      if (settings.cacheSettings.contextCache) {
        contextCache.setConfig({
          maxSizeBytes: settings.cacheSettings.contextCache.maxSizeMb * 1024 * 1024,
          defaultTTL: settings.cacheSettings.contextCache.defaultTtlMs,
          enableTTL: settings.cacheSettings.contextCache.enabled,
        });
      }

      logger.info('Cache settings applied', {
        toolCacheEnabled: settings.cacheSettings.toolCache?.enabled,
        contextCacheEnabled: settings.cacheSettings.contextCache?.enabled,
        strategy: settings.cacheSettings.promptCacheStrategy,
      });
    }

    // Auto-import Claude Code credentials in BACKGROUND (don't block startup)
    // This does network requests which can be slow
    setImmediate(async () => {
      try {
        const { autoImportCredentials, startBackgroundRefresh, setSubscriptionUpdateCallback, setStatusChangeCallback } = await import('./main/agent/claudeAuth');

        // Set callback to emit status changes to renderer
        setStatusChangeCallback((event) => {
          emitToRenderer({
            type: 'claude-subscription',
            eventType: event.type,
            message: event.message,
            tier: event.tier,
          });
        });

        setSubscriptionUpdateCallback(async (updated) => {
          await settingsStore.update({ claudeSubscription: updated });
          emitToRenderer({ type: 'settings-update', settings: settingsStore.get() });
          logger.debug('Claude subscription auto-updated after refresh');
        });

        const currentSettings = settingsStore.get();
        if (!currentSettings.claudeSubscription) {
          const subscription = await autoImportCredentials();
          if (subscription) {
            await settingsStore.update({ claudeSubscription: subscription });
            logger.info('Claude Code credentials auto-imported', { tier: subscription.tier });
          }
        } else {
          // Start background refresh for existing subscription
          startBackgroundRefresh(currentSettings.claudeSubscription);
          logger.info('Claude Code background refresh started');
        }
      } catch (err) {
        logger.debug('Claude Code auth setup skipped', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });

    // Create orchestrator AFTER settings are fully loaded
    orchestrator = new AgentOrchestrator({
      settingsStore,
      workspaceManager,
      logger,
      sessionsPath: path.join(userData, 'sessions.json')
    });

    // Initialize orchestrator (load sessions, validate configuration)
    await orchestrator.init();

    // Setup event forwarding AFTER initialization is complete
    orchestrator.on('event', (event) => emitToRenderer(event));

    // Wire up session health monitor to emit IPC events
    const healthMonitor = getSessionHealthMonitor();
    healthMonitor.setEventEmitter((event) => {
      emitToRenderer(event as unknown as RendererEvent);
    });
    logger.info('Session health monitor connected to IPC');

    infraInitialized = true;
    logger.info('Infrastructure initialized (deferred services pending)', {
      hasProviders: orchestrator?.hasAvailableProviders() ?? false,
    });
  } catch (error) {
    logger.error('Failed to initialize infrastructure', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't throw - allow the app to start even if some services fail
    // The UI will show appropriate error messages
    infraInitialized = true; // Mark as initialized to prevent retry loops
  }
};

const createWindow = async () => {
  await bootstrapInfrastructure();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#71717a',
      height: 32,
    },
    backgroundColor: '#050506',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Disable Chromium's background throttling to ensure agent continues
      // running at full speed when window is not focused
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenu(null);

  // Initialize IPC event batcher for high-frequency event optimization
  eventBatcher = new IpcEventBatcher(() => mainWindow, { 
    batchIntervalMs: 16, // ~60fps for smooth UI updates
    maxBatchSize: 50,
  });
  logger.info('IPC event batcher initialized');

  // Initialize background throttle controller for power/visibility state tracking
  // This coordinates with the event batcher to disable throttling when agent is running
  const throttleController = initThrottleController(mainWindow);
  const throttleLogger = getThrottleEventLogger();
  
  // Wire throttle controller to event batcher for coordinated throttling
  throttleController.on('state-changed', (event) => {
    const state = throttleController.getState();
    
    // Sync agent running state with event batcher
    if (state.agentRunning) {
      eventBatcher?.setAgentRunning(true);
    } else {
      eventBatcher?.setAgentRunning(false);
    }
    
    // Emit throttle state to renderer
    emitToRenderer({
      type: 'throttle-state-changed',
      state: {
        isThrottled: state.isThrottled,
        agentRunning: state.agentRunning,
        windowVisible: state.windowVisible,
        windowFocused: state.windowFocused,
        effectiveInterval: throttleController.getEffectiveInterval(),
      },
    } as unknown as RendererEvent);
    
    // Log state changes
    if (event.type === 'state-changed' && event.currentState.isThrottled !== undefined) {
      if (event.currentState.isThrottled) {
        throttleLogger.logThrottleActivated(
          Array.from(state.throttleReasons),
          event.metadata
        );
      } else {
        throttleLogger.logThrottleDeactivated(
          Array.from(state.bypassReasons),
          event.metadata?.durationMs as number | undefined
        );
      }
    }
  });
  
  // Log timing anomalies
  throttleController.on('timing-anomaly', (event) => {
    const metadata = event.metadata as { operationId?: string; durationMs?: number } | undefined;
    if (metadata?.operationId && metadata?.durationMs) {
      throttleLogger.logTimingAnomaly(
        metadata.operationId,
        metadata.durationMs,
        500, // threshold
        event.currentState.isThrottled ?? false
      );
    }
  });
  
  logger.info('Background throttle controller initialized');

  // Note: DevTools console errors (Autofill.enable, etc.) are benign and don't affect functionality.
  // They occur when DevTools probes unsupported CDP domains in Electron.

  // Initialize the embedded browser manager with settings
  const settings = settingsStore.get();
  initBrowserManager(mainWindow, settings.browserSettings);
  logger.info('Browser manager initialized with settings');

  // Initialize file watcher for real-time file tree updates
  initFileWatcher(mainWindow);
  const activeWorkspace = workspaceManager.getActive();
  if (activeWorkspace?.path) {
    // Start file watcher - non-blocking with setImmediate wrapper
    watchWorkspace(activeWorkspace.path).catch((err) => {
      logger.warn('File watcher setup failed', { error: err instanceof Error ? err.message : String(err) });
    });
  }
  logger.info('File watcher initialized');

  // Setup browser state event forwarding for real-time UI updates
  const browserManager = getBrowserManager();
  browserManager.on('state-changed', (state: BrowserState) => {
    emitToRenderer({ type: 'browser-state', state });
  });

  // CRITICAL: Register IPC handlers BEFORE loading the window URL.
  // This prevents race conditions where the renderer tries to call handlers
  // before they are registered (causing "No handler registered" errors).
  if (!ipcRegistered) {
    registerIpcHandlers({
      getOrchestrator: () => orchestrator,
      getSettingsStore: () => settingsStore,
      getWorkspaceManager: () => workspaceManager,
      getMainWindow: () => mainWindow,
      emitToRenderer,
    });
    ipcRegistered = true;
    logger.info('IPC handlers registered before window load');
  }

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Always open DevTools in development for debugging
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL || process.env.VYOTIQ_DEVTOOLS === 'true') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Send initial state to renderer after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    emitToRenderer({ type: 'workspace-update', workspaces: workspaceManager.list() });
    emitToRenderer({ type: 'settings-update', settings: settingsStore.get() });
    emitToRenderer({ type: 'sessions-update', sessions: orchestrator!.getSessions() });
    
    // Initialize heavy services in background AFTER UI is shown
    // This prevents "Not Responding" during startup
    setImmediate(() => {
      initializeDeferredServices().catch((err) => {
        logger.warn('Deferred services initialization failed (non-critical)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  });
};

app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up resources before quitting
app.on('before-quit', async (event) => {
  if (orchestrator) {
    event.preventDefault();
    try {
      // Stop Claude background refresh and file watcher
      const { stopBackgroundRefresh, stopCredentialsWatcher } = await import('./main/agent/claudeAuth');
      stopBackgroundRefresh();
      stopCredentialsWatcher();
      logger.info('Claude background refresh stopped');

      // Stop file watcher
      await stopWatching();
      logger.info('File watcher stopped');

      // Shutdown LSP manager
      const { shutdownLSPManager } = await import('./main/lsp');
      await shutdownLSPManager();
      logger.info('LSP manager shutdown complete');

      // Cleanup terminal sessions
      const { cleanupTerminalSessions } = await import('./main/ipc');
      cleanupTerminalSessions();
      logger.info('Terminal sessions cleaned up');

      await orchestrator.cleanup();
    } catch (error) {
      logger.error('Error during cleanup', { error: error instanceof Error ? error.message : String(error) });
    }
    // Remove the listener to prevent infinite loop and quit
    app.removeAllListeners('before-quit');
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
