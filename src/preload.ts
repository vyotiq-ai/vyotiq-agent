import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
	AgentSettings,
	AttachmentPayload,
	ConfirmToolPayload,
	RendererEvent,
	SendMessagePayload,
	StartSessionPayload,
	UpdateConfigPayload,
} from './shared/types';

// ==========================================================================
// Agent API
// ==========================================================================

const agentAPI = {
	startSession: (payload: StartSessionPayload) => ipcRenderer.invoke('agent:start-session', payload),
	sendMessage: (payload: SendMessagePayload) => ipcRenderer.invoke('agent:send-message', payload),
	confirmTool: (payload: ConfirmToolPayload) => ipcRenderer.invoke('agent:confirm-tool', payload),
	updateConfig: (payload: UpdateConfigPayload) => ipcRenderer.invoke('agent:update-config', payload),
	cancelRun: (sessionId: string) => ipcRenderer.invoke('agent:cancel-run', sessionId),
	pauseRun: (sessionId: string) => ipcRenderer.invoke('agent:pause-run', sessionId),
	resumeRun: (sessionId: string) => ipcRenderer.invoke('agent:resume-run', sessionId),
	isRunPaused: (sessionId: string) => ipcRenderer.invoke('agent:is-run-paused', sessionId),
	deleteSession: (sessionId: string) => ipcRenderer.invoke('agent:delete-session', sessionId),
	getSessions: () => ipcRenderer.invoke('agent:get-sessions'),
	getSessionsByWorkspace: (workspaceId: string) => ipcRenderer.invoke('agent:get-sessions-by-workspace', workspaceId),
	getSessionSummaries: (workspaceId?: string) => ipcRenderer.invoke('agent:get-session-summaries', workspaceId),
	getActiveWorkspaceSessions: () => ipcRenderer.invoke('agent:get-active-workspace-sessions'),
	regenerate: (sessionId: string) => ipcRenderer.invoke('agent:regenerate', sessionId),
	renameSession: (sessionId: string, title: string) => ipcRenderer.invoke('agent:rename-session', sessionId, title),
	getAvailableProviders: () => ipcRenderer.invoke('agent:get-available-providers'),
	hasAvailableProviders: () => ipcRenderer.invoke('agent:has-available-providers'),
	getProvidersCooldown: () => ipcRenderer.invoke('agent:get-providers-cooldown'),
	editMessage: (sessionId: string, messageIndex: number, newContent: string) =>
		ipcRenderer.invoke('agent:edit-message', sessionId, messageIndex, newContent),
	createBranch: (sessionId: string, messageId: string, name?: string) =>
		ipcRenderer.invoke('agent:create-branch', sessionId, messageId, name),
	switchBranch: (sessionId: string, branchId: string | null) =>
		ipcRenderer.invoke('agent:switch-branch', sessionId, branchId),
	deleteBranch: (sessionId: string, branchId: string) =>
		ipcRenderer.invoke('agent:delete-branch', sessionId, branchId),
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
	}) => ipcRenderer.invoke('agent:update-editor-state', state),
	addReaction: (sessionId: string, messageId: string, reaction: 'up' | 'down' | null) =>
		ipcRenderer.invoke('agent:add-reaction', sessionId, messageId, reaction),
	onEvent: (handler: (event: RendererEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: RendererEvent) => handler(data);
		ipcRenderer.on('agent:event', listener);
		return () => ipcRenderer.removeListener('agent:event', listener);
	},
};

// ==========================================================================
// Workspace Diagnostics Types
// ==========================================================================

interface WorkspaceDiagnostic {
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
}

interface DiagnosticsUpdateEvent {
	diagnostics: WorkspaceDiagnostic[];
	errorCount: number;
	warningCount: number;
	filesWithErrors: string[];
	timestamp: number;
}

interface FileDiagnosticsEvent {
	filePath: string;
	diagnostics: WorkspaceDiagnostic[];
}

// ==========================================================================
// Workspace API
// ==========================================================================

const workspaceAPI = {
	list: () => ipcRenderer.invoke('workspace:list'),
	add: () => ipcRenderer.invoke('workspace:add'),
	setActive: (workspaceId: string) => ipcRenderer.invoke('workspace:set-active', workspaceId),
	remove: (workspaceId: string) => ipcRenderer.invoke('workspace:remove', workspaceId),
	/**
	 * Get all TypeScript diagnostics from the entire workspace codebase.
	 * Returns errors and warnings from all files, not just open ones.
	 */
	getDiagnostics: (options?: { forceRefresh?: boolean }) =>
		ipcRenderer.invoke('workspace:get-diagnostics', options),
	/**
	 * Subscribe to real-time diagnostics updates.
	 * Use onDiagnosticsChange to receive the updates.
	 */
	subscribeToDiagnostics: () => ipcRenderer.invoke('workspace:diagnostics-subscribe'),
	/**
	 * Unsubscribe from real-time diagnostics updates.
	 */
	unsubscribeFromDiagnostics: () => ipcRenderer.invoke('workspace:diagnostics-unsubscribe'),
	/**
	 * Subscribe to real-time diagnostics update events.
	 * Called whenever workspace diagnostics change (file saved, errors fixed, etc.)
	 */
	onDiagnosticsChange: (handler: (event: DiagnosticsUpdateEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: DiagnosticsUpdateEvent) => handler(data);
		ipcRenderer.on('diagnostics:updated', listener);
		return () => ipcRenderer.removeListener('diagnostics:updated', listener);
	},
	/**
	 * Subscribe to file-specific diagnostics updates.
	 * More granular than onDiagnosticsChange, useful for editor integration.
	 */
	onFileDiagnosticsChange: (handler: (event: FileDiagnosticsEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: FileDiagnosticsEvent) => handler(data);
		ipcRenderer.on('diagnostics:file-updated', listener);
		return () => ipcRenderer.removeListener('diagnostics:file-updated', listener);
	},
	/**
	 * Subscribe to diagnostics cleared events.
	 * Called when all diagnostics are cleared (e.g., workspace change).
	 */
	onDiagnosticsCleared: (handler: () => void) => {
		const listener = () => handler();
		ipcRenderer.on('diagnostics:cleared', listener);
		return () => ipcRenderer.removeListener('diagnostics:cleared', listener);
	},
};

// ==========================================================================
// Settings API
// ==========================================================================

const settingsAPI = {
	get: (): Promise<AgentSettings> => ipcRenderer.invoke('settings:get'),
	update: (payload: Partial<AgentSettings>): Promise<AgentSettings> =>
		ipcRenderer.invoke('settings:update', { settings: payload }),
};

// ==========================================================================
// OpenRouter API
// ==========================================================================

interface OpenRouterModel {
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
}

const openrouterAPI = {
	fetchModels: (): Promise<{ success: boolean; models: OpenRouterModel[]; error?: string }> =>
		ipcRenderer.invoke('openrouter:fetch-models'),
};

// ==========================================================================
// Anthropic API
// ==========================================================================

interface AnthropicModel {
	id: string;
	created_at: string;
	display_name: string;
	type: 'model';
}

const anthropicAPI = {
	fetchModels: (): Promise<{ success: boolean; models: AnthropicModel[]; error?: string }> =>
		ipcRenderer.invoke('anthropic:fetch-models'),
};

// ==========================================================================
// OpenAI API
// ==========================================================================

interface OpenAIModel {
	id: string;
	object: 'model';
	created: number;
	owned_by: string;
}

const openaiAPI = {
	fetchModels: (): Promise<{ success: boolean; models: OpenAIModel[]; error?: string }> =>
		ipcRenderer.invoke('openai:fetch-models'),
};

// ==========================================================================
// DeepSeek API
// ==========================================================================

interface DeepSeekModel {
	id: string;
	object: 'model';
	owned_by: string;
}

const deepseekAPI = {
	fetchModels: (): Promise<{ success: boolean; models: DeepSeekModel[]; error?: string }> =>
		ipcRenderer.invoke('deepseek:fetch-models'),
};

// ==========================================================================
// Gemini API
// ==========================================================================

interface GeminiModel {
	name: string;
	displayName: string;
	description: string;
	version: string;
	inputTokenLimit: number;
	outputTokenLimit: number;
	supportedGenerationMethods: string[];
}

const geminiAPI = {
	fetchModels: (): Promise<{ success: boolean; models: GeminiModel[]; error?: string }> =>
		ipcRenderer.invoke('gemini:fetch-models'),
};

// ==========================================================================
// GLM API
// ==========================================================================

interface GLMModel {
	id: string;
	object: string;
	created?: number;
	owned_by?: string;
}

interface GLMSubscriptionStatus {
	connected: boolean;
	tier?: 'lite' | 'pro';
	useCodingEndpoint: boolean;
}

interface GLMConnectParams {
	apiKey: string;
	tier: 'lite' | 'pro';
	useCodingEndpoint: boolean;
}

const glmAPI = {
	fetchModels: (): Promise<{ success: boolean; models: GLMModel[]; error?: string }> =>
		ipcRenderer.invoke('glm:fetch-models'),

	// GLM Subscription methods
	connect: (params: GLMConnectParams): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('glm:connect', params),

	disconnect: (): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('glm:disconnect'),

	getSubscriptionStatus: (): Promise<GLMSubscriptionStatus> =>
		ipcRenderer.invoke('glm:get-subscription-status'),

	updateSettings: (settings: { useCodingEndpoint?: boolean }): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('glm:update-settings', settings),
};

// ==========================================================================
// Files API
// ==========================================================================

interface FileWriteResult {
	success: boolean;
	path?: string;
	size?: number;
	modifiedAt?: number;
	language?: string;
	error?: string;
}

interface FileStatResult {
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
}

/** File change event data emitted when files are created, modified, deleted, or renamed */
interface FileChangeEvent {
	type: 'create' | 'write' | 'delete' | 'rename' | 'createDir';
	path: string;
	oldPath?: string; // For rename operations
}

const fileAPI = {
	select: (): Promise<AttachmentPayload[]> => ipcRenderer.invoke('files:select'),
	read: (paths: string[]): Promise<AttachmentPayload[]> => ipcRenderer.invoke('files:read', paths),
	open: (path: string) => ipcRenderer.invoke('files:open', path),
	reveal: (path: string) => ipcRenderer.invoke('files:reveal', path),
	listDir: (dirPath: string, options?: { showHidden?: boolean; recursive?: boolean; maxDepth?: number }) =>
		ipcRenderer.invoke('files:list-dir', dirPath, options),
	saveAs: (content: string, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }>; title?: string }) =>
		ipcRenderer.invoke('files:saveAs', content, options),
	create: (filePath: string, content?: string): Promise<FileWriteResult> =>
		ipcRenderer.invoke('files:create', filePath, content ?? ''),
	write: (filePath: string, content?: string): Promise<FileWriteResult> =>
		ipcRenderer.invoke('files:write', filePath, content ?? ''),
	createDir: (dirPath: string): Promise<{ success: boolean; path?: string; error?: string }> =>
		ipcRenderer.invoke('files:createDir', dirPath),
	delete: (filePath: string): Promise<{ success: boolean; path?: string; error?: string }> =>
		ipcRenderer.invoke('files:delete', filePath),
	rename: (oldPath: string, newPath: string): Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }> =>
		ipcRenderer.invoke('files:rename', oldPath, newPath),
	stat: (filePath: string): Promise<FileStatResult> =>
		ipcRenderer.invoke('files:stat', filePath),
	// File change event subscription - subscribe to file system changes
	onFileChange: (handler: (event: FileChangeEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: FileChangeEvent) => handler(data);
		ipcRenderer.on('files:changed', listener);
		return () => ipcRenderer.removeListener('files:changed', listener);
	},
};

// ==========================================================================
// Undo API
// ==========================================================================

const undoAPI = {
	getHistory: (sessionId: string) => ipcRenderer.invoke('undo:get-history', sessionId),
	getGroupedHistory: (sessionId: string) => ipcRenderer.invoke('undo:get-grouped-history', sessionId),
	undoChange: (sessionId: string, changeId: string) => ipcRenderer.invoke('undo:undo-change', sessionId, changeId),
	redoChange: (sessionId: string, changeId: string) => ipcRenderer.invoke('undo:redo-change', sessionId, changeId),
	undoRun: (sessionId: string, runId: string) => ipcRenderer.invoke('undo:undo-run', sessionId, runId),
	getUndoableCount: (sessionId: string) => ipcRenderer.invoke('undo:get-undoable-count', sessionId),
	clearHistory: (sessionId: string) => ipcRenderer.invoke('undo:clear-history', sessionId),
};

// ==========================================================================
// Cache API
// ==========================================================================

interface CacheStatsResponse {
	promptCache: {
		hits: number;
		misses: number;
		hitRate: number;
		tokensSaved: number;
		costSaved: number;
	};
	toolCache: {
		size: number;
		maxSize: number;
		hits: number;
		misses: number;
		hitRate: number;
		evictions: number;
		expirations: number;
	};
}

const cacheAPI = {
	// Get all cache statistics
	getStats: (): Promise<CacheStatsResponse> =>
		ipcRenderer.invoke('cache:get-stats'),

	// Clear cache(s)
	clear: (type?: 'prompt' | 'tool' | 'context' | 'all'): Promise<{ success: boolean; cleared: string[] }> =>
		ipcRenderer.invoke('cache:clear', type),

	// Update tool result cache configuration
	updateToolConfig: (config: { maxAge?: number; maxSize?: number }): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('cache:update-tool-config', config),

	// Cleanup expired tool results (aggressive clearing)
	cleanupToolResults: (): Promise<{ success: boolean; removed: number }> =>
		ipcRenderer.invoke('cache:cleanup-tool-results'),

	// Invalidate tool results for a specific path (when file changes)
	invalidatePath: (path: string): Promise<{ success: boolean; invalidated: number }> =>
		ipcRenderer.invoke('cache:invalidate-path', path),
};

// ==========================================================================
// Debug API
// ==========================================================================

interface DebugTraceData {
	traceId: string;
	sessionId: string;
	runId: string;
	status: 'running' | 'completed' | 'failed' | 'paused';
	startedAt: number;
	completedAt?: number;
	durationMs?: number;
	steps: Array<{
		stepId: string;
		stepNumber: number;
		type: string;
		startedAt: number;
		completedAt: number;
		durationMs: number;
		llmRequest?: unknown;
		llmResponse?: unknown;
		toolCall?: unknown;
		toolResult?: unknown;
		error?: unknown;
	}>;
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

const debugAPI = {
	// Get all traces for a session
	getTraces: (sessionId: string): Promise<DebugTraceData[]> =>
		ipcRenderer.invoke('debug:get-traces', sessionId),

	// Get the currently active trace
	getActiveTrace: (): Promise<DebugTraceData | null> =>
		ipcRenderer.invoke('debug:get-active-trace'),

	// Get a specific trace by ID
	getTrace: (traceId: string): Promise<DebugTraceData | null> =>
		ipcRenderer.invoke('debug:get-trace', traceId),

	// Enable or disable debug mode
	setEnabled: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('debug:set-enabled', enabled),

	// Export trace to a format
	exportTrace: (traceId: string, format: 'json' | 'markdown' | 'html' = 'json'): Promise<{ success: boolean; content?: string; error?: string }> =>
		ipcRenderer.invoke('debug:export-trace', traceId, format),

	// Update debug configuration
	updateConfig: (config: {
		verbose?: boolean;
		captureFullPayloads?: boolean;
		stepMode?: boolean;
		exportOnError?: boolean;
		exportFormat?: 'json' | 'markdown';
	}): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('debug:update-config', config),

	// Clear traces for a session
	clearTraces: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('debug:clear-traces', sessionId),

	// Save trace to file (opens save dialog)
	saveTraceToFile: (traceId: string, format: 'json' | 'markdown' = 'json'): Promise<{ success: boolean; path?: string; error?: string }> =>
		ipcRenderer.invoke('debug:save-trace-to-file', traceId, format),

	// Get current debug configuration
	getConfig: (): Promise<{
		verbose: boolean;
		captureFullPayloads: boolean;
		stepMode: boolean;
		exportOnError: boolean;
		exportFormat: 'json' | 'markdown';
	} | null> =>
		ipcRenderer.invoke('debug:get-config'),
};

/// ==========================================================================
// Git API
// ==========================================================================

const gitAPI = {
	status: () => ipcRenderer.invoke('git:status'),
	isRepo: () => ipcRenderer.invoke('git:is-repo'),
	currentBranch: () => ipcRenderer.invoke('git:current-branch'),
	showFile: (filePath: string, ref?: string) => ipcRenderer.invoke('git:show-file', filePath, ref),
	stage: (paths: string[]) => ipcRenderer.invoke('git:stage', paths),
	unstage: (paths: string[]) => ipcRenderer.invoke('git:unstage', paths),
	discard: (filePath: string) => ipcRenderer.invoke('git:discard', filePath),
	commit: (message: string, options?: { amend?: boolean; all?: boolean }) => ipcRenderer.invoke('git:commit', message, options),
	log: (options?: { maxCount?: number; skip?: number; filePath?: string }) => ipcRenderer.invoke('git:log', options),
	branches: (all?: boolean) => ipcRenderer.invoke('git:branches', all),
	createBranch: (name: string, startPoint?: string) => ipcRenderer.invoke('git:create-branch', name, startPoint),
	deleteBranch: (name: string, force?: boolean) => ipcRenderer.invoke('git:delete-branch', name, force),
	checkout: (ref: string, options?: { create?: boolean }) => ipcRenderer.invoke('git:checkout', ref, options),
	remotes: () => ipcRenderer.invoke('git:remotes'),
	fetch: (remote?: string, prune?: boolean) => ipcRenderer.invoke('git:fetch', remote, prune),
	pull: (remote?: string, branch?: string) => ipcRenderer.invoke('git:pull', remote, branch),
	push: (remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }) => ipcRenderer.invoke('git:push', remote, branch, options),
	stash: (message?: string) => ipcRenderer.invoke('git:stash', message),
	stashPop: (index?: number) => ipcRenderer.invoke('git:stash-pop', index),
	stashApply: (index?: number) => ipcRenderer.invoke('git:stash-apply', index),
	stashDrop: (index?: number) => ipcRenderer.invoke('git:stash-drop', index),
	stashList: () => ipcRenderer.invoke('git:stash-list'),
	blame: (filePath: string) => ipcRenderer.invoke('git:blame', filePath),
	merge: (branch: string, options?: { noFf?: boolean; squash?: boolean }) => ipcRenderer.invoke('git:merge', branch, options),
	// Event handlers - these need special handling
	onStatusChange: (handler: (status: unknown) => void) => {
		const listener = (_event: IpcRendererEvent, status: unknown) => handler(status);
		ipcRenderer.on('git:status-changed', listener);
		return () => ipcRenderer.removeListener('git:status-changed', listener);
	},
	onBranchChange: (handler: (data: { from: string; to: string }) => void) => {
		const listener = (_event: IpcRendererEvent, data: { from: string; to: string }) => handler(data);
		ipcRenderer.on('git:branch-changed', listener);
		return () => ipcRenderer.removeListener('git:branch-changed', listener);
	},
	onOperationComplete: (handler: (data: { operation: string; success: boolean; message?: string }) => void) => {
		const listener = (_event: IpcRendererEvent, data: { operation: string; success: boolean; message?: string }) => handler(data);
		ipcRenderer.on('git:operation-complete', listener);
		return () => ipcRenderer.removeListener('git:operation-complete', listener);
	},
	onError: (handler: (data: { operation: string; error: string }) => void) => {
		const listener = (_event: IpcRendererEvent, data: { operation: string; error: string }) => handler(data);
		ipcRenderer.on('git:error', listener);
		return () => ipcRenderer.removeListener('git:error', listener);
	},
	onEvent: (handler: (event: unknown) => void) => {
		const listener = (_event: IpcRendererEvent, data: unknown) => handler(data);
		ipcRenderer.on('git:event', listener);
		return () => ipcRenderer.removeListener('git:event', listener);
	},
};

// ==========================================================================
// Browser API
// ==========================================================================

interface BrowserBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface NavigationResult {
	success: boolean;
	url: string;
	title: string;
	error?: string;
	loadTime?: number;
}

interface BrowserState {
	id: string;
	url: string;
	title: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	error?: string;
}

interface PageContent {
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
}

interface ElementInfo {
	tag: string;
	id?: string;
	className?: string;
	text?: string;
	attributes: Record<string, string>;
	rect: { x: number; y: number; width: number; height: number };
}

const browserAPI = {
	// Navigation
	navigate: (url: string): Promise<NavigationResult> =>
		ipcRenderer.invoke('browser:navigate', url),
	back: (): Promise<boolean> =>
		ipcRenderer.invoke('browser:back'),
	forward: (): Promise<boolean> =>
		ipcRenderer.invoke('browser:forward'),
	reload: (): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:reload'),
	stop: (): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:stop'),

	// State & View Management
	state: (): Promise<BrowserState> =>
		ipcRenderer.invoke('browser:state'),

	// Real-time state change listener for instant UI updates
	onStateChange: (handler: (state: BrowserState) => void) => {
		const listener = (_event: IpcRendererEvent, state: BrowserState) => handler(state);
		ipcRenderer.on('browser:state-changed', listener);
		return () => ipcRenderer.removeListener('browser:state-changed', listener);
	},
	attach: (bounds: BrowserBounds): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('browser:attach', bounds),
	detach: (): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:detach'),
	setBounds: (bounds: BrowserBounds): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:setBounds', bounds),

	// Content Extraction
	extract: (options?: { includeHtml?: boolean; maxLength?: number }): Promise<PageContent> =>
		ipcRenderer.invoke('browser:extract', options),
	screenshot: (options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }): Promise<string> =>
		ipcRenderer.invoke('browser:screenshot', options),

	// Interaction
	click: (selector: string): Promise<boolean> =>
		ipcRenderer.invoke('browser:click', selector),
	type: (selector: string, text: string): Promise<boolean> =>
		ipcRenderer.invoke('browser:type', selector, text),
	hover: (selector: string): Promise<boolean> =>
		ipcRenderer.invoke('browser:hover', selector),
	fill: (selector: string, value: string): Promise<boolean> =>
		ipcRenderer.invoke('browser:fill', selector, value),
	scroll: (direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:scroll', direction, amount),

	// Query & Evaluate
	query: (selector: string, limit?: number): Promise<ElementInfo[]> =>
		ipcRenderer.invoke('browser:query', selector, limit),
	waitForElement: (selector: string, timeout?: number): Promise<boolean> =>
		ipcRenderer.invoke('browser:waitForElement', selector, timeout),
	evaluate: <T = unknown>(script: string): Promise<T> =>
		ipcRenderer.invoke('browser:evaluate', script),

	// Utilities
	clearData: (): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('browser:clearData'),

	// Security
	security: {
		getConfig: (): Promise<{
			urlFilteringEnabled: boolean;
			popupBlockingEnabled: boolean;
			adBlockingEnabled: boolean;
			downloadProtectionEnabled: boolean;
			trackerBlockingEnabled: boolean;
			allowList: string[];
			customBlockList: string[];
		}> => ipcRenderer.invoke('browser:security:getConfig'),

		updateConfig: (config: Record<string, unknown>): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:updateConfig', config),

		getStats: (): Promise<{
			blockedUrls: number;
			blockedPopups: number;
			blockedAds: number;
			blockedTrackers: number;
			blockedDownloads: number;
			warnings: number;
		}> => ipcRenderer.invoke('browser:security:getStats'),

		getEvents: (limit?: number): Promise<Array<{
			type: 'blocked' | 'warning' | 'allowed';
			category: string;
			url: string;
			reason: string;
			timestamp: number;
		}>> => ipcRenderer.invoke('browser:security:getEvents', limit),

		checkUrl: (url: string): Promise<{
			safe: boolean;
			warnings: string[];
			riskScore: number;
		}> => ipcRenderer.invoke('browser:security:checkUrl', url),

		addToAllowList: (url: string): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:addToAllowList', url),

		removeFromAllowList: (url: string): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:removeFromAllowList', url),

		addToBlockList: (url: string): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:addToBlockList', url),

		removeFromBlockList: (url: string): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:removeFromBlockList', url),

		resetStats: (): Promise<{ success: boolean }> =>
			ipcRenderer.invoke('browser:security:resetStats'),
	},

	// Console logs (debugging)
	console: {
		getLogs: (options?: {
			level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
			limit?: number;
			filter?: string;
		}): Promise<{
			success: boolean;
			logs: Array<{
				level: 'error' | 'warning' | 'info' | 'debug' | 'log';
				message: string;
				timestamp: number;
				source?: string;
				line?: number;
			}>;
			error?: string;
		}> => ipcRenderer.invoke('browser:console:getLogs', options),

		clear: (): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke('browser:console:clear'),
	},

	// Network requests (debugging)
	network: {
		getRequests: (options?: {
			type?: string;
			status?: string;
			limit?: number;
			urlPattern?: string;
		}): Promise<{
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
		}> => ipcRenderer.invoke('browser:network:getRequests', options),

		clear: (): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke('browser:network:clear'),
	},

	// Apply behavior settings dynamically
	applyBehaviorSettings: (settings: {
		navigationTimeout?: number;
		maxContentLength?: number;
		customUserAgent?: string;
		enableJavaScript?: boolean;
		enableCookies?: boolean;
		clearDataOnExit?: boolean;
	}): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('browser:applyBehaviorSettings', settings),
};

// ==========================================================================
// Editor AI API
// ==========================================================================

interface EditorAIDiagnostic {
	message: string;
	severity: 'error' | 'warning' | 'info' | 'hint';
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	source?: string;
	code?: string | number;
}

interface EditorAIResult {
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
}

const editorAIAPI = {
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
	}): Promise<{
		text: string | null;
		range?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
		provider?: string;
		modelId?: string;
		latencyMs?: number;
		cached?: boolean;
		error?: string;
	}> => ipcRenderer.invoke('editor-ai:inline-completion', payload),

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
			diagnostics?: EditorAIDiagnostic[];
			userInstructions?: string;
		};
	}): Promise<{
		success: boolean;
		action: string;
		result?: EditorAIResult;
		error?: string;
		provider?: string;
		modelId?: string;
		latencyMs?: number;
	}> => ipcRenderer.invoke('editor-ai:execute-action', payload),

	// Get AI-powered quick fixes for a diagnostic
	quickFix: (payload: {
		filePath: string;
		language: string;
		diagnostic: EditorAIDiagnostic;
		codeContext: string;
		fileContent?: string;
	}): Promise<{
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
	}> => ipcRenderer.invoke('editor-ai:quick-fix', payload),

	// Cancel pending requests
	cancel: (): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('editor-ai:cancel'),

	// Clear the cache
	clearCache: (): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('editor-ai:clear-cache'),

	// Get cache statistics
	getCacheStats: (): Promise<{
		hits: number;
		misses: number;
		hitRate: number;
	}> => ipcRenderer.invoke('editor-ai:get-cache-stats'),

	// Get service status for debugging
	getStatus: (): Promise<{
		initialized: boolean;
		error?: string;
		providers: Array<{ name: string; enabled: boolean; hasApiKey: boolean }>;
		config: unknown;
		hasProviders?: boolean;
		enabledProviders?: number;
	}> => ipcRenderer.invoke('editor-ai:get-status'),
};



// ==========================================================================
// LSP (Language Server Protocol) API
// ==========================================================================

/** Normalized diagnostic from LSP */
interface LSPDiagnostic {
	filePath: string;
	fileName?: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	message: string;
	severity: 'error' | 'warning' | 'info' | 'hint';
	source: string;
	code?: string | number;
}

/** Normalized location from LSP */
interface LSPLocation {
	filePath: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
}

/** Normalized symbol from LSP */
interface LSPSymbol {
	name: string;
	kind: string;
	filePath: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	containerName?: string;
	children?: LSPSymbol[];
}

/** Normalized completion from LSP */
interface LSPCompletion {
	label: string;
	kind: string;
	detail?: string;
	documentation?: string;
	insertText?: string;
	sortText?: string;
}

/** Normalized code action from LSP */
interface LSPCodeAction {
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
}

/** Normalized hover from LSP */
interface LSPHover {
	contents: string;
	range?: {
		startLine: number;
		startColumn: number;
		endLine: number;
		endColumn: number;
	};
}

/** Normalized signature help from LSP */
interface LSPSignatureHelp {
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
}

/** LSP client info */
interface LSPClientInfo {
	language: string;
	state: 'stopped' | 'starting' | 'running' | 'error';
	capabilities: Record<string, unknown> | null;
	error?: string;
}

/**
 * API for Language Server Protocol features
 */
const lspAPI = {
	/**
	 * Initialize LSP manager for a workspace
	 */
	initialize: (workspacePath: string): Promise<{
		success: boolean;
		availableServers?: string[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:initialize', workspacePath),

	/**
	 * Get info about active LSP clients
	 */
	getClients: (): Promise<{
		success: boolean;
		clients: LSPClientInfo[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:get-clients'),

	/**
	 * Get available language servers
	 */
	getAvailableServers: (): Promise<{
		success: boolean;
		servers: string[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:get-available-servers'),

	/**
	 * Start a specific language server
	 */
	startServer: (language: string): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:start-server', language),

	/**
	 * Stop a specific language server
	 */
	stopServer: (language: string): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:stop-server', language),

	/**
	 * Get hover information at a position
	 */
	hover: (filePath: string, line: number, column: number): Promise<{
		success: boolean;
		hover?: LSPHover | null;
		error?: string;
	}> => ipcRenderer.invoke('lsp:hover', filePath, line, column),

	/**
	 * Get definition location(s)
	 */
	definition: (filePath: string, line: number, column: number): Promise<{
		success: boolean;
		locations?: LSPLocation[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:definition', filePath, line, column),

	/**
	 * Get references to a symbol
	 */
	references: (filePath: string, line: number, column: number, includeDeclaration?: boolean): Promise<{
		success: boolean;
		locations?: LSPLocation[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:references', filePath, line, column, includeDeclaration),

	/**
	 * Get document symbols (outline)
	 */
	documentSymbols: (filePath: string): Promise<{
		success: boolean;
		symbols?: LSPSymbol[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:document-symbols', filePath),

	/**
	 * Search workspace symbols
	 */
	workspaceSymbols: (query: string): Promise<{
		success: boolean;
		symbols?: LSPSymbol[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:workspace-symbols', query),

	/**
	 * Get completions at a position
	 */
	completions: (filePath: string, line: number, column: number): Promise<{
		success: boolean;
		completions?: LSPCompletion[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:completions', filePath, line, column),

	/**
	 * Get diagnostics for a file or all files
	 */
	diagnostics: (filePath?: string): Promise<{
		success: boolean;
		diagnostics?: LSPDiagnostic[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:diagnostics', filePath),

	/**
	 * Get code actions for a range
	 */
	codeActions: (filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number): Promise<{
		success: boolean;
		actions?: LSPCodeAction[];
		error?: string;
	}> => ipcRenderer.invoke('lsp:code-actions', filePath, startLine, startColumn, endLine, endColumn),

	/**
	 * Get signature help at a position
	 */
	signatureHelp: (filePath: string, line: number, column: number): Promise<{
		success: boolean;
		signatureHelp?: LSPSignatureHelp | null;
		error?: string;
	}> => ipcRenderer.invoke('lsp:signature-help', filePath, line, column),

	/**
	 * Format a document
	 */
	format: (filePath: string): Promise<{
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
	}> => ipcRenderer.invoke('lsp:format', filePath),

	/**
	 * Rename a symbol
	 */
	rename: (filePath: string, line: number, column: number, newName: string): Promise<{
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
	}> => ipcRenderer.invoke('lsp:rename', filePath, line, column, newName),

	/**
	 * Open a document in the language server
	 */
	openDocument: (filePath: string, content?: string): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:open-document', filePath, content),

	/**
	 * Update a document in the language server
	 */
	updateDocument: (filePath: string, content: string): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:update-document', filePath, content),

	/**
	 * Close a document in the language server
	 */
	closeDocument: (filePath: string): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:close-document', filePath),

	/**
	 * Shutdown LSP manager
	 */
	shutdown: (): Promise<{
		success: boolean;
		error?: string;
	}> => ipcRenderer.invoke('lsp:shutdown'),

	/**
	 * Subscribe to real-time LSP diagnostics updates
	 */
	onDiagnosticsUpdated: (handler: (event: {
		filePath: string;
		diagnostics: LSPDiagnostic[];
		source: 'lsp' | 'typescript';
		timestamp: number;
	}) => void) => {
		const listener = (_event: IpcRendererEvent, data: {
			filePath: string;
			diagnostics: LSPDiagnostic[];
			source: 'lsp' | 'typescript';
			timestamp: number;
		}) => handler(data);
		ipcRenderer.on('lsp:diagnostics-updated', listener);
		return () => ipcRenderer.removeListener('lsp:diagnostics-updated', listener);
	},

	/**
	 * Refresh all diagnostics (TypeScript + LSP)
	 */
	refreshDiagnostics: (): Promise<{
		success: boolean;
		typescript?: { errorCount: number; warningCount: number; diagnosticsCount: number } | null;
		lsp?: { diagnosticsCount: number };
		error?: string;
	}> => ipcRenderer.invoke('lsp:refresh-diagnostics'),

	/**
	 * Restart TypeScript Language Server
	 * Fully reinitializes the TypeScript service to pick up new type definitions.
	 */
	restartTypeScriptServer: (): Promise<{
		success: boolean;
		diagnostics?: { errorCount: number; warningCount: number; diagnosticsCount: number };
		error?: string;
	}> => ipcRenderer.invoke('lsp:restart-typescript-server'),
};

// ==========================================================================
// Session Health API
// ==========================================================================

interface SessionHealthIssue {
	type: 'loop-detected' | 'high-token-usage' | 'slow-response' | 'compliance-violation' | 'approaching-limit' | 'stalled';
	severity: 'info' | 'warning' | 'error';
	message: string;
	detectedAt: number;
	context?: Record<string, unknown>;
}

interface SessionHealthStatus {
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
	issues: SessionHealthIssue[];
	recommendations: string[];
	lastUpdated: number;
}

const sessionHealthAPI = {
	/**
	 * Get health status for a session
	 */
	getStatus: (sessionId: string): Promise<SessionHealthStatus | null> =>
		ipcRenderer.invoke('agent:get-session-health', sessionId),

	/**
	 * Get all active monitored sessions
	 */
	getActiveSessions: (): Promise<string[]> =>
		ipcRenderer.invoke('agent:get-active-health-sessions'),

	/**
	 * Subscribe to session health updates
	 */
	onHealthUpdate: (handler: (data: { sessionId: string; status: SessionHealthStatus }) => void) => {
		const listener = (_event: IpcRendererEvent, data: { sessionId: string; status: SessionHealthStatus }) => handler(data);
		ipcRenderer.on('session-health:update', listener);
		return () => ipcRenderer.removeListener('session-health:update', listener);
	},
};

// ==========================================================================
// Model Quality API
// ==========================================================================

interface ModelQualityMetrics {
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
}

interface ModelQualityStats {
	totalModels: number;
	totalRequests: number;
	avgQualityScore: number;
	topPerformers: string[];
	lowPerformers: string[];
}

const modelQualityAPI = {
	/**
	 * Get quality metrics for a specific model
	 */
	getMetrics: (modelId: string, provider: string): Promise<ModelQualityMetrics | null> =>
		ipcRenderer.invoke('agent:get-model-quality', modelId, provider),

	/**
	 * Get all models ranked by quality score
	 */
	getRankedModels: (): Promise<ModelQualityMetrics[]> =>
		ipcRenderer.invoke('agent:get-ranked-models'),

	/**
	 * Get global model quality statistics
	 */
	getStats: (): Promise<ModelQualityStats | null> =>
		ipcRenderer.invoke('agent:get-model-quality-stats'),

	/**
	 * Record user reaction for model quality tracking
	 */
	recordReaction: (modelId: string, provider: string, reaction: 'up' | 'down'): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('agent:record-model-reaction', modelId, provider, reaction),
};

// ==========================================================================
// Loop Detection API
// ==========================================================================

interface LoopDetectionState {
	runId: string;
	sessionId: string;
	consecutiveIdenticalCalls: number;
	circuitBreakerTriggered: boolean;
	warningIssued: boolean;
}

const loopDetectionAPI = {
	/**
	 * Get loop detection state for a run
	 */
	getState: (runId: string): Promise<LoopDetectionState | null> =>
		ipcRenderer.invoke('agent:get-loop-detection-state', runId),

	/**
	 * Check if circuit breaker is triggered for a run
	 */
	isCircuitBreakerTriggered: (runId: string): Promise<boolean> =>
		ipcRenderer.invoke('agent:is-circuit-breaker-triggered', runId),
};

// ==========================================================================
// Claude Code Subscription OAuth API
// ==========================================================================

interface ClaudeSubscriptionStatus {
	connected: boolean;
	tier?: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
	email?: string;
	expiresAt?: number;
	isExpired?: boolean;
	expiresIn?: string;
}

interface ClaudeSubscription {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	tier: 'free' | 'pro' | 'max' | 'team' | 'enterprise';
	organizationId?: string;
	email?: string;
	connectedAt: number;
}

interface ClaudeInstallStatus {
	installed: boolean;
	hasCredentials: boolean;
	cliAvailable: boolean;
}

const claudeAPI = {
	/**
	 * Import credentials from Claude Code CLI
	 */
	startOAuth: (): Promise<{ success: boolean; subscription?: ClaudeSubscription; error?: string }> =>
		ipcRenderer.invoke('claude:start-oauth'),

	/**
	 * Disconnect Claude Code subscription
	 */
	disconnect: (): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('claude:disconnect'),

	/**
	 * Get current subscription status
	 */
	getSubscriptionStatus: (): Promise<ClaudeSubscriptionStatus> =>
		ipcRenderer.invoke('claude:get-subscription-status'),

	/**
	 * Refresh expired access token
	 */
	refreshToken: (): Promise<{ success: boolean; subscription?: ClaudeSubscription; error?: string }> =>
		ipcRenderer.invoke('claude:refresh-token'),

	/**
	 * Check if Claude Code CLI is installed
	 */
	checkInstalled: (): Promise<ClaudeInstallStatus> =>
		ipcRenderer.invoke('claude:check-installed'),

	/**
	 * Launch Claude Code CLI authentication (opens terminal)
	 */
	launchAuth: (): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('claude:launch-auth'),
};

// ==========================================================================
// Integrated Terminal API
// ==========================================================================

interface TerminalSpawnOptions {
	id: string;
	cwd?: string;
}

interface TerminalDataEvent {
	id: string;
	data: string;
}

interface TerminalExitEvent {
	id: string;
	exitCode: number;
}

interface TerminalInfo {
	id: string;
	cwd: string;
}

const terminalAPI = {
	/**
	 * Spawn a new interactive terminal session
	 */
	spawn: (options: TerminalSpawnOptions): Promise<{ success: boolean; id?: string; cwd?: string; error?: string }> =>
		ipcRenderer.invoke('terminal:spawn', options),

	/**
	 * Write data to terminal (user input)
	 */
	write: (id: string, data: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('terminal:write', { id, data }),

	/**
	 * Resize terminal
	 */
	resize: (id: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('terminal:resize', { id, cols, rows }),

	/**
	 * Kill terminal session
	 */
	kill: (id: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('terminal:kill', id),

	/**
	 * List active terminal sessions
	 */
	list: (): Promise<{ success: boolean; terminals: TerminalInfo[] }> =>
		ipcRenderer.invoke('terminal:list'),

	/**
	 * Subscribe to terminal data events
	 */
	onData: (handler: (event: TerminalDataEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: TerminalDataEvent) => handler(data);
		ipcRenderer.on('terminal:data', listener);
		return () => ipcRenderer.removeListener('terminal:data', listener);
	},

	/**
	 * Subscribe to terminal exit events
	 */
	onExit: (handler: (event: TerminalExitEvent) => void) => {
		const listener = (_event: IpcRendererEvent, data: TerminalExitEvent) => handler(data);
		ipcRenderer.on('terminal:exit', listener);
		return () => ipcRenderer.removeListener('terminal:exit', listener);
	},
};


contextBridge.exposeInMainWorld('vyotiq', {
	agent: agentAPI,
	workspace: workspaceAPI,
	settings: settingsAPI,
	openrouter: openrouterAPI,
	anthropic: anthropicAPI,
	openai: openaiAPI,
	deepseek: deepseekAPI,
	gemini: geminiAPI,
	glm: glmAPI,
	debug: debugAPI,
	files: fileAPI,
	cache: cacheAPI,
	git: gitAPI,
	undo: undoAPI,
	browser: browserAPI,
	editorAI: editorAIAPI,

	// Language Server Protocol API
	lsp: lspAPI,

	// Session Health Monitoring API
	sessionHealth: sessionHealthAPI,

	// Model Quality Tracking API
	modelQuality: modelQualityAPI,

	// Loop Detection API
	loopDetection: loopDetectionAPI,

	// Claude Code Subscription OAuth API
	claude: claudeAPI,

	// Integrated Terminal API
	terminal: terminalAPI,
});
