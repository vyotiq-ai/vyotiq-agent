import type {
  AgentSessionState,
  AgentSettings,
  AttachmentPayload,
  BulkOperation as _BulkOperation,
  BulkOperationResult as _BulkOperationResult,
  ConfirmToolPayload,
  DiagnosticInfo as _DiagnosticInfo,
  DiagnosticsSummary as _DiagnosticsSummary,
  FileChangeEvent as _FileChangeEvent,
  FileTreeNode as _FileTreeNode,
  HoverInfo as _HoverInfo,
  RendererEvent,
  SendMessagePayload,
  SessionSummary,
  StartSessionPayload,
  SymbolInfo as _SymbolInfo,
  SymbolKind as _SymbolKind,
  SymbolLocation as _SymbolLocation,
  UpdateConfigPayload,
  WatcherStatus as _WatcherStatus,
  WatchOptions as _WatchOptions,
  WorkspaceEntry,
  GitRepoStatus,
  GitCommit,
  GitBranch,
  GitStash,
  GitRemote,
  GitBlameEntry,
  CompletionContext,
  CompletionItem,
  CompletionResult,
  InlineCompletionContext,
  InlineCompletionResult,
  CompletionServiceConfig,
  TraceStepDetail,
} from '../../shared/types';

// Trace types for debug API
interface TraceData {
  traceId: string;
  sessionId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  steps: TraceStepDetail[];
  metrics: {
    totalSteps: number;
    llmCalls: number;
    toolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalDurationMs: number;
    avgLLMDurationMs: number;
    avgToolDurationMs: number;
    toolUsage: Record<string, number>;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
    vyotiq: {
      agent: {
        startSession: (payload: StartSessionPayload) => Promise<AgentSessionState | undefined>;
        sendMessage: (payload: SendMessagePayload) => Promise<void>;
        confirmTool: (payload: ConfirmToolPayload) => Promise<void>;
        updateConfig: (payload: UpdateConfigPayload) => Promise<void>;
        cancelRun: (sessionId: string) => Promise<void>;
        pauseRun: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        resumeRun: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        isRunPaused: (sessionId: string) => Promise<boolean>;
        deleteSession: (sessionId: string) => Promise<void>;
        getSessions: () => Promise<AgentSessionState[]>;
        getSessionsByWorkspace: (workspaceId: string) => Promise<AgentSessionState[]>;
        getSessionSummaries: (workspaceId?: string) => Promise<SessionSummary[]>;
        getActiveWorkspaceSessions: () => Promise<AgentSessionState[]>;
        onEvent: (handler: (event: RendererEvent) => void) => () => void;
        regenerate: (sessionId: string) => Promise<void>;
        renameSession: (sessionId: string, title: string) => Promise<void>;
        // Provider info
        getAvailableProviders: () => Promise<string[]>;
        hasAvailableProviders: () => Promise<boolean>;
        getProvidersCooldown: () => Promise<Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null>>;
        // Message editing
        editMessage: (sessionId: string, messageIndex: number, newContent: string) => Promise<{ success: boolean; error?: string }>;
        // Branch management
        createBranch: (sessionId: string, messageId: string, name?: string) => Promise<{ success: boolean; branchId?: string; error?: string }>;
        switchBranch: (sessionId: string, branchId: string | null) => Promise<{ success: boolean; error?: string }>;
        deleteBranch: (sessionId: string, branchId: string) => Promise<{ success: boolean; error?: string }>;
        updateEditorState: (state: {
          openFiles: string[];
          activeFile: string | null;
          cursorPosition: { lineNumber: number; column: number } | null;
          diagnostics?: Array<{
            filePath: string;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            source?: string;
            code?: string | number;
          }>;
        }) => Promise<{ success: boolean; error?: string }>;
        addReaction: (sessionId: string, messageId: string, reaction: 'up' | 'down' | null) => Promise<{ success: boolean; error?: string }>;
      };
      workspace: {
        list: () => Promise<WorkspaceEntry[]>;
        add: () => Promise<WorkspaceEntry[]>;
        setActive: (workspaceId: string) => Promise<WorkspaceEntry[]>;
        remove: (workspaceId: string) => Promise<WorkspaceEntry[]>;
        /**
         * Get all TypeScript/ESLint diagnostics from the entire workspace codebase.
         * Returns errors and warnings from all files, not just open ones.
         */
        getDiagnostics: (options?: { forceRefresh?: boolean }) => Promise<{
          success: boolean;
          diagnostics?: Array<{
            filePath: string;
            line: number;
            column: number;
            severity: 'error' | 'warning' | 'info' | 'hint';
            message: string;
            source: string;
            code?: string | number;
            endLine?: number;
            endColumn?: number;
          }>;
          errorCount?: number;
          warningCount?: number;
          filesWithErrors?: string[];
          collectedAt?: number;
          error?: string;
          message?: string;
        }>;
        /**
         * Subscribe to real-time diagnostics updates.
         * Returns immediately and pushes updates via onDiagnosticsChange.
         */
        subscribeToDiagnostics: () => Promise<{ success: boolean; error?: string }>;
        /**
         * Unsubscribe from real-time diagnostics updates.
         */
        unsubscribeFromDiagnostics: () => Promise<{ success: boolean; error?: string }>;
        /**
         * Subscribe to real-time diagnostics update events.
         * Called whenever workspace diagnostics change (file saved, errors fixed, etc.)
         */
        onDiagnosticsChange: (handler: (event: {
          diagnostics: Array<{
            filePath: string;
            fileName: string;
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            source: string;
            code?: string | number;
          }>;
          errorCount: number;
          warningCount: number;
          filesWithErrors: string[];
          timestamp: number;
        }) => void) => () => void;
        /**
         * Subscribe to file-specific diagnostics updates.
         */
        onFileDiagnosticsChange: (handler: (event: {
          filePath: string;
          diagnostics: Array<{
            filePath: string;
            fileName: string;
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            source: string;
            code?: string | number;
          }>;
        }) => void) => () => void;
        /**
         * Subscribe to diagnostics cleared events.
         */
        onDiagnosticsCleared: (handler: () => void) => () => void;
      };
      settings: {
        get: () => Promise<AgentSettings>;
        update: (payload: Partial<AgentSettings>) => Promise<AgentSettings>;
      };
      openrouter: {
        fetchModels: () => Promise<{
          success: boolean;
          models: Array<{
            id: string;
            name: string;
            created: number;
            pricing: { prompt: string; completion: string; request: string; image: string };
            context_length: number;
            architecture: {
              modality: string;
              input_modalities: string[];
              output_modalities: string[];
              tokenizer: string;
              instruct_type: string;
            };
            top_provider: { is_moderated: boolean; context_length: number; max_completion_tokens: number };
            supported_parameters?: string[];
            description?: string;
          }>;
          error?: string;
        }>;
      };
      anthropic: {
        fetchModels: () => Promise<{
          success: boolean;
          models: Array<{
            id: string;
            created_at: string;
            display_name: string;
            type: 'model';
          }>;
          error?: string;
        }>;
      };
      openai: {
        fetchModels: () => Promise<{
          success: boolean;
          models: Array<{
            id: string;
            object: 'model';
            created: number;
            owned_by: string;
          }>;
          error?: string;
        }>;
      };
      deepseek: {
        fetchModels: () => Promise<{
          success: boolean;
          models: Array<{
            id: string;
            object: 'model';
            owned_by: string;
          }>;
          error?: string;
        }>;
      };
      gemini: {
        fetchModels: () => Promise<{
          success: boolean;
          models: Array<{
            name: string;
            displayName: string;
            description: string;
            version: string;
            inputTokenLimit: number;
            outputTokenLimit: number;
            supportedGenerationMethods: string[];
          }>;
          error?: string;
        }>;
      };
      debug: {
        // Get all traces for a session
        getTraces: (sessionId: string) => Promise<TraceData[]>;
        // Get the currently active trace
        getActiveTrace: () => Promise<TraceData | null>;
        // Get a specific trace by ID
        getTrace: (traceId: string) => Promise<TraceData | null>;
        // Enable or disable debug mode
        setEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        // Export trace to a format
        exportTrace: (traceId: string, format?: 'json' | 'markdown' | 'html') => Promise<{ success: boolean; content?: string; error?: string }>;
        // Update debug configuration
        updateConfig: (config: {
          verbose?: boolean;
          captureFullPayloads?: boolean;
          stepMode?: boolean;
          exportOnError?: boolean;
          exportFormat?: 'json' | 'markdown';
        }) => Promise<{ success: boolean; error?: string }>;
        // Clear traces for a session
        clearTraces: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        // Save trace to file (opens save dialog)
        saveTraceToFile: (traceId: string, format?: 'json' | 'markdown') => Promise<{ success: boolean; path?: string; error?: string }>;
        // Get current debug configuration
        getConfig: () => Promise<{
          verbose: boolean;
          captureFullPayloads: boolean;
          stepMode: boolean;
          exportOnError: boolean;
          exportFormat: 'json' | 'markdown';
        } | null>;
      };
      files: {
        select: () => Promise<AttachmentPayload[]>;
        read: (paths: string[]) => Promise<AttachmentPayload[]>;
        open: (path: string) => Promise<{ success: boolean; error?: string }>;
        reveal: (path: string) => Promise<{ success: boolean }>;
        listDir: (dirPath: string, options?: {
          showHidden?: boolean;
          recursive?: boolean;
          maxDepth?: number;
        }) => Promise<{
          success: boolean;
          files?: Array<{
            name: string;
            path: string;
            type: 'file' | 'directory';
            language?: string;
            children?: Array<unknown>;
          }>;
          error?: string;
        }>;
        saveAs: (content: string, options?: {
          defaultPath?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
          title?: string;
        }) => Promise<{
          success: boolean;
          path?: string;
          error?: string;
        }>;
        create: (filePath: string, content?: string) => Promise<{
          success: boolean;
          path?: string;
          size?: number;
          modifiedAt?: number;
          language?: string;
          error?: string;
        }>;
        write: (filePath: string, content?: string) => Promise<{
          success: boolean;
          path?: string;
          size?: number;
          modifiedAt?: number;
          language?: string;
          error?: string;
        }>;
        createDir: (dirPath: string) => Promise<{
          success: boolean;
          path?: string;
          error?: string;
        }>;
        delete: (filePath: string) => Promise<{
          success: boolean;
          path?: string;
          error?: string;
        }>;
        rename: (oldPath: string, newPath: string) => Promise<{
          success: boolean;
          oldPath?: string;
          newPath?: string;
          error?: string;
        }>;
        stat: (filePath: string) => Promise<{
          success: boolean;
          path?: string;
          name?: string;
          size?: number;
          isFile?: boolean;
          isDirectory?: boolean;
          createdAt?: number;
          modifiedAt?: number;
          language?: string;
          error?: string;
        }>;
        /** Subscribe to file change events from the main process */
        onFileChange: (handler: (event: {
          type: 'create' | 'write' | 'delete' | 'rename' | 'createDir';
          path: string;
          oldPath?: string;
        }) => void) => () => void;
      };

      undo: {
        // Get all file changes for a session
        getHistory: (sessionId: string) => Promise<Array<{
          id: string;
          sessionId: string;
          runId: string;
          filePath: string;
          changeType: 'create' | 'modify' | 'delete';
          previousContent: string | null;
          newContent: string | null;
          toolName: string;
          description: string;
          timestamp: number;
          status: 'undoable' | 'undone' | 'redoable';
        }>>;
        // Get changes grouped by run
        getGroupedHistory: (sessionId: string) => Promise<Array<{
          runId: string;
          changes: Array<{
            id: string;
            sessionId: string;
            runId: string;
            filePath: string;
            changeType: 'create' | 'modify' | 'delete';
            previousContent: string | null;
            newContent: string | null;
            toolName: string;
            description: string;
            timestamp: number;
            status: 'undoable' | 'undone' | 'redoable';
          }>;
          startTime: number;
          endTime: number;
          fileCount: number;
        }>>;
        // Undo a specific change
        undoChange: (sessionId: string, changeId: string) => Promise<{
          success: boolean;
          message: string;
          filePath?: string;
          newStatus?: 'undoable' | 'undone' | 'redoable';
        }>;
        // Redo a previously undone change
        redoChange: (sessionId: string, changeId: string) => Promise<{
          success: boolean;
          message: string;
          filePath?: string;
          newStatus?: 'undoable' | 'undone' | 'redoable';
        }>;
        // Undo all changes from a run
        undoRun: (sessionId: string, runId: string) => Promise<{
          success: boolean;
          message: string;
          count: number;
          results: Array<{
            success: boolean;
            message: string;
            filePath?: string;
            newStatus?: 'undoable' | 'undone' | 'redoable';
          }>;
        }>;
        // Get count of undoable changes
        getUndoableCount: (sessionId: string) => Promise<number>;
        // Clear undo history for a session
        clearHistory: (sessionId: string) => Promise<{ success: boolean }>;
      };

      git: {
        // Repository status
        status: () => Promise<GitRepoStatus | { error: string }>;
        isRepo: () => Promise<{ isRepo: boolean; error?: string }>;
        currentBranch: () => Promise<string | { error: string }>;
        // Get file content from git at a specific ref
        showFile: (filePath: string, ref?: string) => Promise<{ content: string | null; error?: string }>;
        // Staging operations
        stage: (paths: string[]) => Promise<{ success: boolean; error?: string }>;
        unstage: (paths: string[]) => Promise<{ success: boolean; error?: string }>;
        discard: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        // Commit operations
        commit: (message: string, options?: { amend?: boolean; all?: boolean }) => Promise<{ success: boolean; commit?: GitCommit; error?: string }>;
        log: (options?: { maxCount?: number; skip?: number; filePath?: string }) => Promise<GitCommit[] | { error: string }>;
        // Branch operations
        branches: (all?: boolean) => Promise<GitBranch[] | { error: string }>;
        createBranch: (name: string, startPoint?: string) => Promise<{ success: boolean; error?: string }>;
        deleteBranch: (name: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
        checkout: (ref: string, options?: { create?: boolean }) => Promise<{ success: boolean; error?: string }>;
        // Remote operations
        remotes: () => Promise<GitRemote[] | { error: string }>;
        fetch: (remote?: string, prune?: boolean) => Promise<{ success: boolean; error?: string }>;
        pull: (remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
        push: (remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }) => Promise<{ success: boolean; error?: string }>;
        // Stash operations
        stash: (message?: string) => Promise<{ success: boolean; error?: string }>;
        stashPop: (index?: number) => Promise<{ success: boolean; error?: string }>;
        stashApply: (index?: number) => Promise<{ success: boolean; error?: string }>;
        stashDrop: (index?: number) => Promise<{ success: boolean; error?: string }>;
        stashList: () => Promise<GitStash[] | { error: string }>;
        // History and blame
        blame: (filePath: string) => Promise<GitBlameEntry[] | { error: string }>;
        // Merge operations
        merge: (branch: string, options?: { noFf?: boolean; squash?: boolean }) => Promise<{ success: boolean; error?: string }>;
        // Event handlers
        onStatusChange: (handler: (status: GitRepoStatus) => void) => () => void;
        onBranchChange: (handler: (data: { from: string; to: string }) => void) => () => void;
        onOperationComplete: (handler: (data: { operation: string; success: boolean; message?: string }) => void) => () => void;
        onError: (handler: (data: { operation: string; error: string }) => void) => () => void;
        onEvent: (handler: (event: RendererEvent) => void) => () => void;
      };
      completion: {
        // Get code completions
        get: (context: CompletionContext) => Promise<CompletionResult & { error?: string }>;
        // Get inline completion (ghost text)
        inline: (context: InlineCompletionContext) => Promise<InlineCompletionResult | null>;
        // Cancel pending request
        cancel: () => Promise<{ success: boolean }>;
        // Clear cache
        clearCache: () => Promise<{ success: boolean }>;
        // Get trigger characters for a language
        getTriggerCharacters: (language: string) => Promise<string[]>;
        // Set config
        setConfig: (config: Partial<CompletionServiceConfig>) => Promise<{ success: boolean }>;
        // Get config
        getConfig: () => Promise<CompletionServiceConfig>;
        // Accept a completion item (for analytics tracking)
        acceptCompletion: (item: CompletionItem) => Promise<{ success: boolean }>;
      };
      cache: {
        // Get all cache statistics
        getStats: () => Promise<{
          prompt: {
            totalHits: number;
            totalMisses: number;
            hitRate: number;
            tokensSaved: number;
            costSaved: number;
            creations: number;
            byProvider: Record<string, { hits: number; misses: number; tokensSaved: number; costSaved: number }>;
          };
          toolResult: {
            size: number;
            maxSize: number;
            hits: number;
            misses: number;
            hitRate: number;
            byTool: Record<string, number>;
          };
          context: {
            entries: number;
            sizeBytes: number;
            hits: number;
            misses: number;
            hitRate: number;
            evictions: number;
            expirations: number;
          };
        }>;
        // Clear cache(s)
        clear: (type?: 'prompt' | 'tool' | 'context' | 'all') => Promise<{ success: boolean; cleared: string[] }>;
        // Update tool result cache configuration
        updateToolConfig: (config: { maxAge?: number; maxSize?: number }) => Promise<{ success: boolean }>;
        // Cleanup expired tool results (aggressive clearing)
        cleanupToolResults: () => Promise<{ success: boolean; removed: number }>;
        // Invalidate tool results for a specific path
        invalidatePath: (path: string) => Promise<{ success: boolean; invalidated: number }>;
      };
      editorAI: {
        // Get inline code completion (ghost text)
        inlineCompletion: (payload: {
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
        }) => Promise<{
          text: string | null;
          range?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
          provider?: string;
          modelId?: string;
          latencyMs?: number;
          cached?: boolean;
          error?: string;
        }>;
        // Execute an AI action on code
        executeAction: (payload: {
          action: string;
          filePath: string;
          language: string;
          selectedCode?: string;
          fileContent?: string;
          cursorPosition?: { line: number; column: number };
          selectionRange?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
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
        }) => Promise<{
          success: boolean;
          action: string;
          result?: {
            text?: string;
            code?: string;
            edits?: Array<{
              range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
              newText: string;
              description?: string;
            }>;
            suggestions?: Array<{
              title: string;
              description: string;
              severity: 'high' | 'medium' | 'low';
              line?: number;
              fix?: string;
            }>;
          };
          error?: string;
          provider?: string;
          modelId?: string;
          latencyMs?: number;
        }>;
        // Get AI-powered quick fixes
        quickFix: (payload: {
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
        }) => Promise<{
          fixes: Array<{
            title: string;
            description?: string;
            edits: Array<{
              range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
              newText: string;
            }>;
            isPreferred?: boolean;
            kind?: string;
          }>;
          provider?: string;
          latencyMs?: number;
          error?: string;
        }>;
        // Cancel pending requests
        cancel: () => Promise<{ success: boolean; error?: string }>;
        // Clear the cache
        clearCache: () => Promise<{ success: boolean; error?: string }>;
        // Get cache statistics
        getCacheStats: () => Promise<{ hits: number; misses: number; hitRate: number }>;
        // Get service status for debugging
        getStatus: () => Promise<{
          initialized: boolean;
          error?: string;
          providers: Array<{ name: string; enabled: boolean; hasApiKey: boolean }>;
          config: unknown;
          hasProviders?: boolean;
          enabledProviders?: number;
        }>;
      };
      browser: {
        // Navigation
        navigate: (url: string) => Promise<{ success: boolean; url: string; title: string; error?: string; loadTime?: number }>;
        back: () => Promise<boolean>;
        forward: () => Promise<boolean>;
        reload: () => Promise<{ success: boolean }>;
        stop: () => Promise<{ success: boolean }>;
        // State & View Management
        state: () => Promise<{
          id: string;
          url: string;
          title: string;
          isLoading: boolean;
          canGoBack: boolean;
          canGoForward: boolean;
          error?: string;
        }>;
        // Real-time state change listener for instant UI updates
        onStateChange: (handler: (state: {
          id: string;
          url: string;
          title: string;
          isLoading: boolean;
          canGoBack: boolean;
          canGoForward: boolean;
          error?: string;
        }) => void) => () => void;
        attach: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; error?: string }>;
        detach: () => Promise<{ success: boolean }>;
        setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean }>;
        // Content Extraction
        extract: (options?: { includeHtml?: boolean; maxLength?: number }) => Promise<{
          url: string;
          title: string;
          text: string;
          html?: string;
          metadata: {
            description?: string;
            keywords?: string[];
            author?: string;
            ogTitle?: string;
            ogDescription?: string;
            ogImage?: string;
          };
          links: Array<{ text: string; href: string; isExternal: boolean }>;
          images: Array<{ src: string; alt?: string; width?: number; height?: number }>;
        }>;
        screenshot: (options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }) => Promise<string>;
        // Interaction
        click: (selector: string) => Promise<boolean>;
        type: (selector: string, text: string) => Promise<boolean>;
        hover: (selector: string) => Promise<boolean>;
        fill: (selector: string, value: string) => Promise<boolean>;
        scroll: (direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => Promise<{ success: boolean }>;
        // Query & Evaluate
        query: (selector: string, limit?: number) => Promise<Array<{
          tag: string;
          id?: string;
          className?: string;
          text?: string;
          attributes: Record<string, string>;
          rect: { x: number; y: number; width: number; height: number };
        }>>;
        waitForElement: (selector: string, timeout?: number) => Promise<boolean>;
        evaluate: <T = unknown>(script: string) => Promise<T>;
        // Utilities
        clearData: () => Promise<{ success: boolean }>;
        // Behavior settings (apply dynamically)
        applyBehaviorSettings: (settings: {
          navigationTimeout?: number;
          maxContentLength?: number;
          customUserAgent?: string;
          enableJavaScript?: boolean;
          enableCookies?: boolean;
          clearDataOnExit?: boolean;
        }) => Promise<{ success: boolean; error?: string }>;
        // Security
        security: {
          getConfig: () => Promise<{
            urlFilteringEnabled: boolean;
            popupBlockingEnabled: boolean;
            adBlockingEnabled: boolean;
            downloadProtectionEnabled: boolean;
            trackerBlockingEnabled: boolean;
            blockMixedContent: boolean;
            trustedLocalhostPorts: number[];
            allowList: string[];
            customBlockList: string[];
          }>;
          updateConfig: (config: Partial<{
            urlFilteringEnabled: boolean;
            popupBlockingEnabled: boolean;
            adBlockingEnabled: boolean;
            downloadProtectionEnabled: boolean;
            trackerBlockingEnabled: boolean;
            blockMixedContent: boolean;
            trustedLocalhostPorts: number[];
            allowList: string[];
            customBlockList: string[];
          }>) => Promise<{ success: boolean }>;
          getStats: () => Promise<{
            blockedUrls: number;
            blockedPopups: number;
            blockedAds: number;
            blockedTrackers: number;
            blockedDownloads: number;
            warnings: number;
          }>;
          getEvents: (limit?: number) => Promise<Array<{
            type: 'blocked' | 'warning' | 'allowed';
            category: 'phishing' | 'malware' | 'popup' | 'ad' | 'tracker' | 'dangerous' | 'suspicious' | 'download';
            url: string;
            reason: string;
            timestamp: number;
          }>>;
          checkUrl: (url: string) => Promise<{
            safe: boolean;
            warnings: string[];
            riskScore: number;
          }>;
          addToAllowList: (pattern: string) => Promise<{ success: boolean }>;
          removeFromAllowList: (pattern: string) => Promise<{ success: boolean }>;
          addToBlockList: (pattern: string) => Promise<{ success: boolean }>;
          removeFromBlockList: (pattern: string) => Promise<{ success: boolean }>;
          resetStats: () => Promise<{ success: boolean }>;
        };
        // Console logs (debugging)
        console: {
          getLogs: (options?: {
            level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
            limit?: number;
            filter?: string;
          }) => Promise<{
            success: boolean;
            logs: Array<{
              level: 'error' | 'warning' | 'info' | 'debug' | 'log';
              message: string;
              timestamp: number;
              source?: string;
              line?: number;
            }>;
            error?: string;
          }>;
          clear: () => Promise<{ success: boolean; error?: string }>;
        };
        // Network requests (debugging)
        network: {
          getRequests: (options?: {
            type?: string;
            status?: string;
            limit?: number;
            urlPattern?: string;
          }) => Promise<{
            success: boolean;
            requests: Array<{
              id: string;
              url: string;
              method: string;
              resourceType: string;
              status: number | null;
              statusText: string;
              startTime: number;
              endTime?: number;
              duration?: number;
              size?: number;
              error?: string;
            }>;
            error?: string;
          }>;
          clear: () => Promise<{ success: boolean; error?: string }>;
        };
      };

      // ========================================================================
      // Autonomous Agent System APIs (Phase 1 Foundation)
      // ========================================================================

      /**
       * Dynamic Tool API - Manage dynamically created tools
       */
      dynamicTool: {
        /**
         * List all dynamically created tools
         */
        list: (filter?: {
          status?: string;
          category?: string;
        }) => Promise<{
          success: boolean;
          tools: Array<{
            id: string;
            name: string;
            description: string;
            status: string;
            usageCount: number;
            successRate: number;
          }>;
          error?: string;
        }>;

        /**
         * Get specification for a dynamic tool
         */
        getSpec: (toolName: string) => Promise<{
          success: boolean;
          specification?: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
            implementation?: string;
          };
          state?: {
            status: string;
            usageCount: number;
            lastUsedAt?: number;
          };
          error?: string;
        }>;

        /**
         * Disable a dynamic tool
         */
        disable: (toolName: string, reason?: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Promote a dynamic tool to persistent
         */
        promote: (toolName: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * List custom tools (user-defined composite tools)
         */
        listCustom: () => Promise<{
          success: boolean;
          customTools: Array<{
            id: string;
            name: string;
            description: string;
            steps: Array<{
              id: string;
              toolName: string;
              input: Record<string, unknown>;
              condition?: string;
              onError: 'stop' | 'continue';
            }>;
            enabled: boolean;
            requiresConfirmation: boolean;
            createdAt: number;
            updatedAt: number;
            usageCount: number;
          }>;
          error?: string;
        }>;

        /**
         * Create a custom tool
         */
        createCustom: (config: {
          name: string;
          description: string;
          steps: Array<{
            id: string;
            toolName: string;
            input: Record<string, unknown>;
            condition?: string;
            onError: 'stop' | 'continue';
          }>;
          enabled: boolean;
          requiresConfirmation: boolean;
        }) => Promise<{
          success: boolean;
          tool?: {
            id: string;
            name: string;
            description: string;
            steps: Array<{
              id: string;
              toolName: string;
              input: Record<string, unknown>;
              condition?: string;
              onError: 'stop' | 'continue';
            }>;
            enabled: boolean;
            requiresConfirmation: boolean;
            createdAt: number;
            updatedAt: number;
            usageCount: number;
          };
          error?: string;
        }>;

        /**
         * Update a custom tool
         */
        updateCustom: (id: string, updates: Partial<{
          name: string;
          description: string;
          steps: Array<{
            id: string;
            toolName: string;
            input: Record<string, unknown>;
            condition?: string;
            onError: 'stop' | 'continue';
          }>;
          enabled: boolean;
          requiresConfirmation: boolean;
        }>) => Promise<{
          success: boolean;
          tool?: {
            id: string;
            name: string;
            description: string;
            steps: Array<{
              id: string;
              toolName: string;
              input: Record<string, unknown>;
              condition?: string;
              onError: 'stop' | 'continue';
            }>;
            enabled: boolean;
            requiresConfirmation: boolean;
            createdAt: number;
            updatedAt: number;
            usageCount: number;
          };
          error?: string;
        }>;

        /**
         * Delete a custom tool
         */
        deleteCustom: (id: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * List available tools for custom tool creation
         */
        listAvailable: () => Promise<{
          success: boolean;
          tools: Array<{
            name: string;
            description: string;
            category: string;
            riskLevel: string;
          }>;
          error?: string;
        }>;
      };

      /**
       * Task API - Manage task plans
       */
      task: {
        /**
         * Get current task plan for a session
         */
        getPlan: (sessionId: string) => Promise<{
          success: boolean;
          plan?: {
            id: string;
            sessionId: string;
            totalSteps: number;
            completedSteps: number;
            currentStep?: string;
            estimatedTimeMs: number;
            steps?: Array<{
              id: string;
              name: string;
              description?: string;
              status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
              progress?: number;
            }>;
          };
          error?: string;
        }>;

        /**
         * Get task plan history for a session
         */
        getHistory: (sessionId: string, limit?: number) => Promise<{
          success: boolean;
          plans: Array<{
            id: string;
            sessionId: string;
            totalSteps: number;
            completedSteps: number;
            status: 'planning' | 'executing' | 'completed' | 'failed';
            createdAt: number;
            completedAt?: number;
          }>;
          error?: string;
        }>;

        /**
         * Skip a task step
         */
        skipStep: (planId: string, stepId: string, reason?: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Retry a failed task step
         */
        retryStep: (planId: string, stepId: string) => Promise<{
          success: boolean;
          error?: string;
        }>;
      };

      /**
       * Metrics API - Metrics and observability (Phase 10)
       */
      metrics: {
        /**
         * Get metrics dashboard data
         */
        getDashboard: (period?: 'hour' | 'day' | 'week' | 'month') => Promise<{
          success: boolean;
          dashboard?: {
            widgets: Array<{
              id: string;
              type: string;
              title: string;
              value: unknown;
              unit?: string;
              trend?: string;
              status?: string;
            }>;
            lastUpdated: number;
            period: string;
          };
          summary?: {
            tools: {
              totalExecutions: number;
              successRate: number;
              avgDurationMs: number;
              topTools: Array<{ name: string; count: number; successRate: number }>;
              failingTools: Array<{ name: string; failureRate: number; errorCount: number }>;
            };
            agents: {
              totalSpawned: number;
              completionRate: number;
              avgDurationMs: number;
              avgTokensPerAgent: number;
              bySpecialization: Array<{ specialization: string; count: number; successRate: number }>;
            };
            costs: {
              totalTokens: number;
              totalCostUsd: number;
              byProvider: Array<{ provider: string; tokens: number; costUsd: number }>;
              avgCostPerTask: number;
            };
            quality: {
              taskSuccessRate: number;
              errorRate: number;
              userSatisfaction: number;
            };
          };
          alerts?: Array<{
            severity: 'info' | 'warning' | 'error';
            message: string;
            timestamp: number;
          }>;
          error?: string;
        }>;

        /**
         * Get metrics summary
         */
        getSummary: (period?: 'hour' | 'day' | 'week' | 'month') => Promise<{
          success: boolean;
          summary?: unknown;
          error?: string;
        }>;

        /**
         * Export metrics data
         */
        export: (format?: 'json' | 'csv' | 'prometheus', period?: 'hour' | 'day' | 'week' | 'month') => Promise<{
          success: boolean;
          data?: string;
          format?: string;
          error?: string;
        }>;

        /**
         * Get performance report
         */
        getPerformanceReport: (periodMs?: number) => Promise<{
          success: boolean;
          report?: {
            generatedAt: number;
            periodMs: number;
            summary: {
              totalOperations: number;
              avgDurationMs: number;
              p95DurationMs: number;
              p99DurationMs: number;
              slowestOperation: string;
              fastestOperation: string;
            };
            bottlenecks: Array<{
              type: string;
              severity: string;
              operation: string;
              description: string;
              recommendation: string;
            }>;
            recommendations: string[];
          };
          error?: string;
        }>;

        /**
         * Clear all metrics data
         */
        clear: () => Promise<{
          success: boolean;
          error?: string;
        }>;
      };

      /**
       * Safety API - Safety monitoring and control (Phase 10)
       */
      safety: {
        /**
         * Get safety state
         */
        getState: () => Promise<{
          success: boolean;
          state?: {
            status: {
              isActive: boolean;
              emergencyStopTriggered: boolean;
              lastCheck: number;
              overallHealth: 'healthy' | 'warning' | 'critical';
            };
            limits: {
              maxTokensPerRun: number;
              maxApiCallsPerRun: number;
              maxConcurrentAgents: number;
              maxFilesPerRun: number;
              maxBytesPerRun: number;
            };
            usage: {
              tokensUsed: number;
              apiCallsUsed: number;
              activeAgents: number;
              filesModified: number;
              bytesWritten: number;
            };
            recentViolations: Array<{
              id: string;
              type: string;
              severity: 'low' | 'medium' | 'high' | 'critical';
              message: string;
              agentId?: string;
              action?: string;
              timestamp: number;
              wasBlocked: boolean;
            }>;
            blockedActions: number;
            allowedActions: number;
          };
          error?: string;
        }>;

        /**
         * Trigger emergency stop
         */
        emergencyStop: () => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Reset safety state
         */
        reset: () => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Update safety limits
         */
        updateLimits: (limits: Record<string, number>) => Promise<{
          success: boolean;
          error?: string;
        }>;
      };

      /**
       * LSP API - Language Server Protocol features for multi-language code intelligence
       */
      lsp: {
        /**
         * Initialize LSP manager for a workspace
         */
        initialize: (workspacePath: string) => Promise<{
          success: boolean;
          availableServers?: string[];
          error?: string;
        }>;

        /**
         * Get info about active LSP clients
         */
        getClients: () => Promise<{
          success: boolean;
          clients: Array<{
            language: string;
            state: 'stopped' | 'starting' | 'running' | 'error';
            capabilities: Record<string, unknown> | null;
            error?: string;
          }>;
          error?: string;
        }>;

        /**
         * Get available language servers
         */
        getAvailableServers: () => Promise<{
          success: boolean;
          servers: string[];
          error?: string;
        }>;

        /**
         * Start a specific language server
         */
        startServer: (language: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Stop a specific language server
         */
        stopServer: (language: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Get hover information at a position
         */
        hover: (filePath: string, line: number, column: number) => Promise<{
          success: boolean;
          hover?: {
            contents: string;
            range?: {
              startLine: number;
              startColumn: number;
              endLine: number;
              endColumn: number;
            };
          } | null;
          error?: string;
        }>;

        /**
         * Get definition location(s)
         */
        definition: (filePath: string, line: number, column: number) => Promise<{
          success: boolean;
          locations?: Array<{
            filePath: string;
            line: number;
            column: number;
            endLine: number;
            endColumn: number;
          }>;
          error?: string;
        }>;

        /**
         * Get references to a symbol
         */
        references: (filePath: string, line: number, column: number, includeDeclaration?: boolean) => Promise<{
          success: boolean;
          locations?: Array<{
            filePath: string;
            line: number;
            column: number;
            endLine: number;
            endColumn: number;
          }>;
          error?: string;
        }>;

        /**
         * Get document symbols (outline)
         */
        documentSymbols: (filePath: string) => Promise<{
          success: boolean;
          symbols?: Array<{
            name: string;
            kind: string;
            filePath: string;
            line: number;
            column: number;
            endLine: number;
            endColumn: number;
            containerName?: string;
            children?: unknown[];
          }>;
          error?: string;
        }>;

        /**
         * Search workspace symbols
         */
        workspaceSymbols: (query: string) => Promise<{
          success: boolean;
          symbols?: Array<{
            name: string;
            kind: string;
            filePath: string;
            line: number;
            column: number;
            endLine: number;
            endColumn: number;
            containerName?: string;
          }>;
          error?: string;
        }>;

        /**
         * Get completions at a position
         */
        completions: (filePath: string, line: number, column: number) => Promise<{
          success: boolean;
          completions?: Array<{
            label: string;
            kind: string;
            detail?: string;
            documentation?: string;
            insertText?: string;
            sortText?: string;
          }>;
          error?: string;
        }>;

        /**
         * Get diagnostics for a file or all files
         */
        diagnostics: (filePath?: string) => Promise<{
          success: boolean;
          diagnostics?: Array<{
            filePath: string;
            line: number;
            column: number;
            endLine?: number;
            endColumn?: number;
            message: string;
            severity: 'error' | 'warning' | 'info' | 'hint';
            source?: string;
            code?: string | number;
          }>;
          error?: string;
        }>;

        /**
         * Get code actions for a range
         */
        codeActions: (filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number) => Promise<{
          success: boolean;
          actions?: Array<{
            title: string;
            kind?: string;
            isPreferred?: boolean;
            edits?: Array<{
              filePath: string;
              range: {
                startLine: number;
                startColumn: number;
                endLine: number;
                endColumn: number;
              };
              newText: string;
            }>;
          }>;
          error?: string;
        }>;

        /**
         * Get signature help at a position
         */
        signatureHelp: (filePath: string, line: number, column: number) => Promise<{
          success: boolean;
          signatureHelp?: {
            signatures: Array<{
              label: string;
              documentation?: string;
              parameters?: Array<{
                label: string;
                documentation?: string;
              }>;
            }>;
            activeSignature?: number;
            activeParameter?: number;
          } | null;
          error?: string;
        }>;

        /**
         * Format a document
         */
        format: (filePath: string) => Promise<{
          success: boolean;
          edits?: Array<{
            range: {
              startLine: number;
              startColumn: number;
              endLine: number;
              endColumn: number;
            };
            newText: string;
          }>;
          error?: string;
        }>;

        /**
         * Rename a symbol
         */
        rename: (filePath: string, line: number, column: number, newName: string) => Promise<{
          success: boolean;
          edits?: Array<{
            filePath: string;
            edits: Array<{
              range: {
                startLine: number;
                startColumn: number;
                endLine: number;
                endColumn: number;
              };
              newText: string;
            }>;
          }>;
          error?: string;
        }>;

        /**
         * Open a document in the language server
         */
        openDocument: (filePath: string, content?: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Update a document in the language server
         */
        updateDocument: (filePath: string, content: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Close a document in the language server
         */
        closeDocument: (filePath: string) => Promise<{
          success: boolean;
          error?: string;
        }>;

        /**
         * Shutdown LSP manager
         */
        shutdown: () => Promise<{
          success: boolean;
          error?: string;
        }>;
      };

      // Session Health Monitoring API
      sessionHealth: {
        /**
         * Get health status for a session
         */
        getStatus: (sessionId: string) => Promise<{
          sessionId: string;
          status: 'healthy' | 'warning' | 'critical' | 'unknown';
          healthScore: number;
          currentIteration: number;
          maxIterations: number;
          iterationProgress: number;
          tokenUsage: {
            totalInput: number;
            totalOutput: number;
            estimatedCost: number;
            utilizationPercent: number;
          };
          issues: Array<{
            type: string;
            severity: 'info' | 'warning' | 'error';
            message: string;
            detectedAt: number;
            context?: Record<string, unknown>;
          }>;
          recommendations: string[];
          lastUpdated: number;
        } | null>;

        /**
         * Get all active monitored sessions
         */
        getActiveSessions: () => Promise<string[]>;

        /**
         * Subscribe to session health updates
         */
        onHealthUpdate: (handler: (data: {
          sessionId: string;
          status: {
            sessionId: string;
            status: 'healthy' | 'warning' | 'critical' | 'unknown';
            healthScore: number;
            currentIteration: number;
            maxIterations: number;
            iterationProgress: number;
            tokenUsage: {
              totalInput: number;
              totalOutput: number;
              estimatedCost: number;
              utilizationPercent: number;
            };
            issues: Array<{
              type: string;
              severity: 'info' | 'warning' | 'error';
              message: string;
              detectedAt: number;
            }>;
            recommendations: string[];
            lastUpdated: number;
          };
        }) => void) => () => void;
      };

      // Model Quality Tracking API
      modelQuality: {
        /**
         * Get quality metrics for a specific model
         */
        getMetrics: (modelId: string, provider: string) => Promise<{
          modelId: string;
          provider: string;
          totalRequests: number;
          successfulCompletions: number;
          failedRequests: number;
          successRate: number;
          avgResponseTimeMs: number;
          avgTokensPerRequest: number;
          loopTriggers: number;
          complianceViolations: number;
          thumbsUp: number;
          thumbsDown: number;
          qualityScore: number;
          lastUpdated: number;
          firstSeen: number;
        } | null>;

        /**
         * Get all models ranked by quality score
         */
        getRankedModels: () => Promise<Array<{
          modelId: string;
          provider: string;
          totalRequests: number;
          successfulCompletions: number;
          failedRequests: number;
          successRate: number;
          avgResponseTimeMs: number;
          avgTokensPerRequest: number;
          loopTriggers: number;
          complianceViolations: number;
          thumbsUp: number;
          thumbsDown: number;
          qualityScore: number;
          lastUpdated: number;
          firstSeen: number;
        }>>;

        /**
         * Get global model quality statistics
         */
        getStats: () => Promise<{
          totalModels: number;
          totalRequests: number;
          avgQualityScore: number;
          topPerformers: string[];
          lowPerformers: string[];
        } | null>;

        /**
         * Record user reaction for model quality tracking
         */
        recordReaction: (modelId: string, provider: string, reaction: 'up' | 'down') => Promise<{
          success: boolean;
          error?: string;
        }>;
      };

      // Loop Detection API
      loopDetection: {
        /**
         * Get loop detection state for a run
         */
        getState: (runId: string) => Promise<{
          runId: string;
          sessionId: string;
          consecutiveIdenticalCalls: number;
          circuitBreakerTriggered: boolean;
          warningIssued: boolean;
        } | null>;

        /**
         * Check if circuit breaker is triggered for a run
         */
        isCircuitBreakerTriggered: (runId: string) => Promise<boolean>;
      };

      /**
       * Claude Code Subscription API
       */
      claude: {
        /**
         * Import credentials from Claude Code CLI
         */
        startOAuth: () => Promise<{
          success: boolean;
          subscription?: {
            accessToken: string;
            refreshToken: string;
            expiresAt: number;
            tier: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
            organizationId?: string;
            email?: string;
            connectedAt: number;
          };
          error?: string;
        }>;

        /**
         * Disconnect Claude Code subscription
         */
        disconnect: () => Promise<{ success: boolean; error?: string }>;

        /**
         * Get current subscription status
         */
        getSubscriptionStatus: () => Promise<{
          connected: boolean;
          tier?: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
          email?: string;
          expiresAt?: number;
          isExpired?: boolean;
          expiresIn?: string;
        }>;

        /**
         * Refresh expired access token
         */
        refreshToken: () => Promise<{
          success: boolean;
          subscription?: {
            accessToken: string;
            refreshToken: string;
            expiresAt: number;
            tier: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
            organizationId?: string;
            email?: string;
            connectedAt: number;
          };
          error?: string;
        }>;

        /**
         * Check if Claude Code CLI is installed
         */
        checkInstalled: () => Promise<{
          installed: boolean;
          hasCredentials: boolean;
          cliAvailable: boolean;
        }>;

        /**
         * Launch Claude Code CLI authentication (opens terminal)
         */
        launchAuth: () => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export { };
