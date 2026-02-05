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
    getSessionsByWorkspace: vi.fn().mockResolvedValue([]),
    getSessionSummaries: vi.fn().mockResolvedValue([]),
    getActiveWorkspaceSessions: vi.fn().mockResolvedValue([]),
    regenerate: vi.fn(),
    renameSession: vi.fn(),
    getAvailableProviders: vi.fn().mockResolvedValue([]),
    hasAvailableProviders: vi.fn().mockResolvedValue(false),
    getProvidersCooldown: vi.fn().mockResolvedValue({}),
    editMessage: vi.fn(),
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
    deleteBranch: vi.fn(),
    updateEditorState: vi.fn(),
    addReaction: vi.fn(),
    onEvent: vi.fn().mockReturnValue(() => {}),
  },

  // Workspace API - Workspace management
  workspace: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
    setActive: vi.fn(),
    getActive: vi.fn().mockResolvedValue(null),
    getInfo: vi.fn(),
    getStructure: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    refreshStructure: vi.fn(),
    getDiagnostics: vi.fn().mockResolvedValue([]),
    getRecentFiles: vi.fn().mockResolvedValue([]),
    onDiagnosticsUpdate: vi.fn().mockReturnValue(() => {}),
    onFileDiagnostics: vi.fn().mockReturnValue(() => {}),
  },

  // Settings API
  settings: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
    reset: vi.fn(),
    export: vi.fn(),
    import: vi.fn(),
    getProviderSettings: vi.fn(),
    setProviderSettings: vi.fn(),
    onSettingsChanged: vi.fn().mockReturnValue(() => {}),
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
    getProcesses: vi.fn().mockResolvedValue([]),
    getOutput: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {}),
  },

  // Editor AI API
  editorAI: {
    complete: vi.fn(),
    explain: vi.fn(),
    refactor: vi.fn(),
    fix: vi.fn(),
    generate: vi.fn(),
    getConfig: vi.fn(),
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
    rename: vi.fn(),
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

  // Cache API
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ hits: 0, misses: 0 }),
  },

  // Undo API
  undo: {
    getHistory: vi.fn().mockResolvedValue([]),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn().mockResolvedValue(false),
    canRedo: vi.fn().mockResolvedValue(false),
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
