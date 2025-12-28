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
import { registerIpcHandlers } from './main/ipc';

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
const logger = new ConsoleLogger('Vyotiq');

const emitToRenderer = (event: RendererEvent): void => {
  if (!mainWindow) return;

  // Primary event stream for the renderer (AgentProvider subscribes here)
  mainWindow.webContents.send('agent:event', event);

  // Compatibility stream for the embedded terminal panel.
  // The terminal UI listens on these channels via preload (window.vyotiq.terminal.on*).
  // Without this, terminal:run works but the UI never receives streaming output.
  if (event.type === 'terminal-output') {
    const payload = event as unknown as { pid: number; data: string; stream: 'stdout' | 'stderr' };
    mainWindow.webContents.send('terminal:output', {
      pid: payload.pid,
      data: payload.data,
      stream: payload.stream,
    });
  } else if (event.type === 'terminal-exit') {
    const payload = event as unknown as { pid: number; code: number };
    mainWindow.webContents.send('terminal:exit', { pid: payload.pid, code: payload.code });
  } else if (event.type === 'terminal-error') {
    const payload = event as unknown as { pid: number; error: string };
    mainWindow.webContents.send('terminal:error', { pid: payload.pid, error: payload.error });
  } else if (event.type === 'browser-state') {
    // Real-time browser state updates for the browser panel
    mainWindow.webContents.send('browser:state-changed', event.state);
  } else if (event.type === 'file-changed') {
    // Real-time file change events for file tree updates
    const payload = event as unknown as { changeType: string; path: string; oldPath?: string };
    mainWindow.webContents.send('files:changed', {
      type: payload.changeType,
      path: payload.path,
      ...(payload.oldPath && { oldPath: payload.oldPath }),
    });
  }
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
    
    // Create orchestrator AFTER settings are fully loaded
    orchestrator = new AgentOrchestrator({ 
      settingsStore, 
      workspaceManager, 
      logger,
      sessionsPath: path.join(userData, 'sessions.json')
    });
    
    // Initialize orchestrator (load sessions, validate configuration)
    await orchestrator.init();
    
    // Initialize LSP manager for multi-language code intelligence
    const { initLSPManager, getLSPManager, initLSPBridge, getLSPBridge } = await import('./main/lsp');
    initLSPManager(logger);
    logger.info('LSP manager initialized');
    
    // Initialize memory storage for persistent agent memory
    const { initMemoryStorage } = await import('./main/agent/memory');
    await initMemoryStorage();
    logger.info('Memory storage initialized');
    
    // Initialize LSP bridge for real-time file change synchronization
    const lspBridge = initLSPBridge(logger);
    
    // Initialize LSP for active workspace if one exists
    const activeWorkspace = workspaceManager.getActive();
    if (activeWorkspace?.path) {
      const lspManager = getLSPManager();
      if (lspManager) {
        await lspManager.initialize(activeWorkspace.path);
        logger.info('LSP manager initialized for active workspace', { workspacePath: activeWorkspace.path });
      }
      
      // Initialize TypeScript diagnostics service for the workspace
      const { initTypeScriptDiagnosticsService } = await import('./main/agent/workspace/TypeScriptDiagnosticsService');
      const tsDiagnosticsService = initTypeScriptDiagnosticsService(logger);
      await tsDiagnosticsService.initialize(activeWorkspace.path);
      
      // Forward diagnostics events to renderer
      tsDiagnosticsService.on('diagnostics', (event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('diagnostics:updated', event);
        }
      });
      
      logger.info('TypeScript diagnostics service initialized');
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
    
    // Setup event forwarding AFTER initialization is complete
    orchestrator.on('event', (event) => emitToRenderer(event));
    
    infraInitialized = true;
    logger.info('Infrastructure fully initialized', {
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
    },
  });

  mainWindow.setMenu(null);

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
    await watchWorkspace(activeWorkspace.path);
  }
  logger.info('File watcher initialized');

  // Setup browser state event forwarding for real-time UI updates
  const browserManager = getBrowserManager();
  browserManager.on('state-changed', (state: BrowserState) => {
    emitToRenderer({ type: 'browser-state', state });
  });

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

  emitToRenderer({ type: 'workspace-update', workspaces: workspaceManager.list() });
  emitToRenderer({ type: 'settings-update', settings: settingsStore.get() });
  emitToRenderer({ type: 'sessions-update', sessions: orchestrator!.getSessions() });
  if (!ipcRegistered) {
    registerIpcHandlers({
      getOrchestrator: () => orchestrator,
      getSettingsStore: () => settingsStore,
      getWorkspaceManager: () => workspaceManager,
      getMainWindow: () => mainWindow,
      emitToRenderer,
    });
    ipcRegistered = true;
  }
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
      // Stop file watcher
      await stopWatching();
      logger.info('File watcher stopped');
      
      // Shutdown LSP manager
      const { shutdownLSPManager } = await import('./main/lsp');
      await shutdownLSPManager();
      logger.info('LSP manager shutdown complete');
      
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
