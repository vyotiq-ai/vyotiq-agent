import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// ==========================================================================
// Mock Electron APIs - Comprehensive mocks matching preload.ts structure
// ==========================================================================

const mockVyotiq = {
  // Agent API - Session and message management
  agent: {
    startSession: vi.fn(),
    sendMessage: vi.fn(),
    confirmTool: vi.fn(),
    updateConfig: vi.fn(),
    cancelRun: vi.fn(),
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    isRunPaused: vi.fn(),
    deleteSession: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    getSessionSummaries: vi.fn().mockResolvedValue([]),
    regenerate: vi.fn(),
    renameSession: vi.fn(),
    getAvailableProviders: vi.fn().mockResolvedValue([]),
    hasAvailableProviders: vi.fn().mockResolvedValue(false),
    getProvidersCooldown: vi.fn().mockResolvedValue({}),
    editMessage: vi.fn(),
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
    deleteBranch: vi.fn(),
    addReaction: vi.fn(),
    onEvent: vi.fn().mockReturnValue(() => {}),
  },

  // Settings API - matches preload.ts settingsAPI
  settings: {
    get: vi.fn().mockResolvedValue({}),
    getSafe: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ success: true }),
    reset: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    export: vi.fn().mockResolvedValue({ success: true }),
    import: vi.fn().mockResolvedValue({ success: true }),
  },

  // Files API
  files: {
    read: vi.fn(),
    write: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    stat: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockResolvedValue([]),
    selectFolder: vi.fn(),
    saveDialog: vi.fn(),
    openExternal: vi.fn(),
    showInExplorer: vi.fn(),
  },

  // Browser API
  browser: {
    navigate: vi.fn(),
    extract: vi.fn(),
    screenshot: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    getState: vi.fn().mockResolvedValue({ url: '', title: '', isLoading: false }),
    attach: vi.fn(),
    detach: vi.fn(),
    setBounds: vi.fn(),
    click: vi.fn(),
    type: vi.fn(),
    hover: vi.fn(),
    fill: vi.fn(),
    scroll: vi.fn(),
    evaluate: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    waitForElement: vi.fn(),
    clearData: vi.fn(),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
  },

  // Terminal API
  terminal: {
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    rename: vi.fn(),
    getProcesses: vi.fn().mockResolvedValue([]),
    getOutput: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {}),
  },

  // LSP API
  lsp: {
    initialize: vi.fn(),
    getClients: vi.fn().mockResolvedValue({ clients: [] }),
    getAvailableServers: vi.fn().mockResolvedValue({ servers: [] }),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    hover: vi.fn(),
    definition: vi.fn(),
    references: vi.fn(),
    diagnostics: vi.fn(),
    symbols: vi.fn(),
    completions: vi.fn(),
    codeActions: vi.fn(),
  },

  // Git API
  git: {
    getStatus: vi.fn(),
    getDiff: vi.fn(),
    getLog: vi.fn(),
    getBranches: vi.fn().mockResolvedValue([]),
    getCurrentBranch: vi.fn(),
    checkout: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    discard: vi.fn(),
  },

  // Cache API - matches preload.ts cacheAPI
  cache: {
    getStats: vi.fn().mockResolvedValue({ promptCache: { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0, costSaved: 0 }, toolCache: { size: 0, maxSize: 0, hits: 0, misses: 0, hitRate: 0, evictions: 0, expirations: 0 } }),
    clear: vi.fn().mockResolvedValue({ success: true, cleared: [] }),
    updateToolConfig: vi.fn().mockResolvedValue({ success: true }),
    cleanupToolResults: vi.fn().mockResolvedValue({ success: true, removed: 0 }),
    invalidatePath: vi.fn().mockResolvedValue({ success: true, invalidated: 0 }),
  },

  // Undo API - matches preload.ts undoAPI
  undo: {
    getHistory: vi.fn().mockResolvedValue([]),
    getGroupedHistory: vi.fn().mockResolvedValue([]),
    undoChange: vi.fn().mockResolvedValue({ success: true }),
    redoChange: vi.fn().mockResolvedValue({ success: true }),
    undoRun: vi.fn().mockResolvedValue({ success: true }),
    getUndoableCount: vi.fn().mockResolvedValue(0),
    clearHistory: vi.fn().mockResolvedValue({ success: true }),
  },

  // MCP API
  mcp: {
    getServers: vi.fn().mockResolvedValue([]),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    getTools: vi.fn().mockResolvedValue([]),
    onToolsUpdated: vi.fn().mockReturnValue(() => {}),
    onEvent: vi.fn().mockReturnValue(() => {}),
  },

  // Workspace API - matches preload.ts workspaceAPI
  workspace: {
    getPath: vi.fn().mockResolvedValue({ success: true, path: '' }),
    setPath: vi.fn().mockResolvedValue({ success: true }),
    selectFolder: vi.fn().mockResolvedValue({ success: false }),
    close: vi.fn().mockResolvedValue({ success: true }),
    getRecent: vi.fn().mockResolvedValue({ success: true, paths: [] }),
    onWorkspaceChanged: vi.fn().mockReturnValue(() => {}),
  },

  // Throttle API - matches preload.ts throttleAPI
  throttle: {
    getState: vi.fn().mockResolvedValue(null),
    getStats: vi.fn().mockResolvedValue(null),
    getLogs: vi.fn().mockResolvedValue([]),
    getAnomalies: vi.fn().mockResolvedValue([]),
    startCriticalOperation: vi.fn().mockResolvedValue(true),
    endCriticalOperation: vi.fn().mockResolvedValue(true),
    getEffectiveInterval: vi.fn().mockResolvedValue(1000),
    shouldBypass: vi.fn().mockResolvedValue(false),
    exportLogs: vi.fn().mockResolvedValue(''),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
  },

  // Rust Backend API - matches preload.ts rustBackendAPI
  rustBackend: {
    health: vi.fn().mockResolvedValue({ success: true }),
    isAvailable: vi.fn().mockResolvedValue(false),
    getAuthToken: vi.fn().mockResolvedValue(''),
    listWorkspaces: vi.fn().mockResolvedValue({ success: true, workspaces: [] }),
    createWorkspace: vi.fn().mockResolvedValue({ success: true }),
    activateWorkspace: vi.fn().mockResolvedValue({ success: true }),
    removeWorkspace: vi.fn().mockResolvedValue({ success: true }),
    listFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
    readFile: vi.fn().mockResolvedValue({ success: true, content: '' }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
    search: vi.fn().mockResolvedValue({ success: true, results: [] }),
    grep: vi.fn().mockResolvedValue({ success: true, results: [] }),
    triggerIndex: vi.fn().mockResolvedValue({ success: true }),
    indexStatus: vi.fn().mockResolvedValue({ success: true }),
  },

  // Debug API
  debug: {
    getTraces: vi.fn().mockResolvedValue([]),
    clearTraces: vi.fn(),
    getState: vi.fn(),
    exportLogs: vi.fn(),
  },

  // Provider-specific APIs
  openrouter: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  anthropic: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  openai: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  deepseek: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  gemini: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  glm: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  xai: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },
  mistral: {
    fetchModels: vi.fn().mockResolvedValue([]),
  },

  // Claude OAuth API
  claude: {
    startAuth: vi.fn(),
    getAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
    logout: vi.fn(),
    onAuthStatusChanged: vi.fn().mockReturnValue(() => {}),
  },

  // Session Health API
  sessionHealth: {
    getMetrics: vi.fn(),
    resetMetrics: vi.fn(),
  },

  // Model Quality API
  modelQuality: {
    getStats: vi.fn(),
    recordFeedback: vi.fn(),
  },

  // Loop Detection API
  loopDetection: {
    getStatus: vi.fn(),
    reset: vi.fn(),
  },

  // Dynamic Tools API
  dynamicTools: {
    list: vi.fn().mockResolvedValue({ tools: [] }),
    getSpec: vi.fn().mockResolvedValue(null),
    updateState: vi.fn().mockResolvedValue({ success: true }),
  },

  // Logging bridge
  log: {
    report: vi.fn(),
  },
};

// Set up global mocks
Object.defineProperty(window, 'vyotiq', {
  value: mockVyotiq,
  writable: true,
});

// Export mock for use in tests
export { mockVyotiq };

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
