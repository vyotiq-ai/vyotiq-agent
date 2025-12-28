/**
 * Editor Bridge
 *
 * Bridges between agents and editor features, providing
 * coordinated access to editor AI capabilities.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import type { EditorAIService } from './EditorAIService';
import type { EditorAIAction, EditorAIRequest, EditorAIResponse } from './types';

// =============================================================================
// Types
// =============================================================================

export interface EditorRequest {
  id: string;
  agentId: string;
  action: EditorAIAction;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: number;
  completedAt?: number;
  result?: EditorAIResponse;
}

export interface EditorBridgeEvent {
  type: 'request-started' | 'request-completed' | 'request-failed';
  requestId: string;
  agentId: string;
  action: EditorAIAction;
  timestamp: number;
}

export interface EditorBridgeConfig {
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  enableCaching: boolean;
  cacheTtlMs: number;
  rateLimitPerAgent: number;
  rateLimitWindowMs: number;
}

export const DEFAULT_EDITOR_BRIDGE_CONFIG: EditorBridgeConfig = {
  maxConcurrentRequests: 5,
  requestTimeoutMs: 60000,
  enableCaching: true,
  cacheTtlMs: 300000, // 5 minutes
  rateLimitPerAgent: 20,
  rateLimitWindowMs: 60000, // 1 minute
};

// =============================================================================
// EditorBridge
// =============================================================================

export class EditorBridge extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: EditorBridgeConfig;
  private readonly editorAIService: EditorAIService;
  private readonly requests = new Map<string, EditorRequest>();
  private readonly agentRequests = new Map<string, string[]>(); // agentId -> requestIds
  private readonly rateLimitCounters = new Map<string, { count: number; resetAt: number }>();
  private activeRequestCount = 0;

  constructor(
    logger: Logger,
    editorAIService: EditorAIService,
    config: Partial<EditorBridgeConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.editorAIService = editorAIService;
    this.config = { ...DEFAULT_EDITOR_BRIDGE_CONFIG, ...config };
  }

  /**
   * Request an editor AI action
   */
  async requestAction(
    agentId: string,
    action: EditorAIAction,
    options: {
      filePath: string;
      selectedCode?: string;
      fileContent?: string;
      language?: string;
      context?: Record<string, unknown>;
    }
  ): Promise<EditorAIResponse> {
    // Check rate limit
    if (!this.checkRateLimit(agentId)) {
      return {
        success: false,
        action,
        error: 'Rate limit exceeded',
      };
    }

    // Check concurrent request limit
    if (this.activeRequestCount >= this.config.maxConcurrentRequests) {
      return {
        success: false,
        action,
        error: 'Maximum concurrent requests reached',
      };
    }

    const request: EditorRequest = {
      id: randomUUID(),
      agentId,
      action,
      filePath: options.filePath,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.requests.set(request.id, request);
    this.trackAgentRequest(agentId, request.id);
    this.activeRequestCount++;

    this.emitEvent('request-started', request.id, agentId, action);

    try {
      request.status = 'processing';

      // Build the request
      const aiRequest: EditorAIRequest = {
        action,
        filePath: options.filePath,
        selectedCode: options.selectedCode,
        fileContent: options.fileContent,
        language: options.language || this.detectLanguage(options.filePath),
        context: options.context,
      };

      // Execute with timeout
      const timeoutPromise = new Promise<EditorAIResponse>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeoutMs);
      });

      const result = await Promise.race([
        this.editorAIService.executeAction(aiRequest),
        timeoutPromise,
      ]);

      request.status = 'completed';
      request.completedAt = Date.now();
      request.result = result;

      this.emitEvent('request-completed', request.id, agentId, action);
      return result;
    } catch (error) {
      request.status = 'failed';
      request.completedAt = Date.now();

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent('request-failed', request.id, agentId, action);

      return {
        success: false,
        action,
        error: errorMsg,
      };
    } finally {
      this.activeRequestCount--;
    }
  }

  /**
   * Request code completion
   */
  async requestCompletion(
    agentId: string,
    options: {
      filePath: string;
      prefix: string;
      suffix?: string;
      content?: string;
      line: number;
      column: number;
      language?: string;
      triggerKind?: 'automatic' | 'explicit';
    }
  ): Promise<{ text: string | null; error?: string }> {
    if (!this.checkRateLimit(agentId)) {
      return { text: null, error: 'Rate limit exceeded' };
    }

    try {
      const result = await this.editorAIService.getInlineCompletion({
        filePath: options.filePath,
        prefix: options.prefix,
        suffix: options.suffix || '',
        content: options.content || options.prefix + options.suffix,
        line: options.line,
        column: options.column,
        language: options.language || this.detectLanguage(options.filePath),
        triggerKind: options.triggerKind || 'explicit',
      });

      return { text: result.text, error: result.error };
    } catch (error) {
      return {
        text: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Request quick fixes for a diagnostic
   */
  async requestQuickFixes(
    agentId: string,
    options: {
      filePath: string;
      codeContext: string;
      diagnostic: {
        message: string;
        severity?: 'error' | 'warning' | 'info' | 'hint';
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
        source?: string;
      };
      language?: string;
    }
  ): Promise<{ fixes: Array<{ title: string; code: string }>; error?: string }> {
    if (!this.checkRateLimit(agentId)) {
      return { fixes: [], error: 'Rate limit exceeded' };
    }

    try {
      const result = await this.editorAIService.getQuickFixes({
        filePath: options.filePath,
        codeContext: options.codeContext,
        diagnostic: {
          ...options.diagnostic,
          severity: options.diagnostic.severity || 'error',
        },
        language: options.language || this.detectLanguage(options.filePath),
      });

      const fixes = result.fixes.map(fix => ({
        title: fix.title,
        code: fix.edits[0]?.newText || '',
      }));

      return { fixes, error: result.error };
    } catch (error) {
      return {
        fixes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get request by ID
   */
  getRequest(requestId: string): EditorRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get requests for an agent
   */
  getAgentRequests(agentId: string): EditorRequest[] {
    const requestIds = this.agentRequests.get(agentId) || [];
    return requestIds
      .map(id => this.requests.get(id))
      .filter((r): r is EditorRequest => r !== undefined);
  }

  /**
   * Cancel pending requests for an agent
   */
  cancelAgentRequests(agentId: string): number {
    const requestIds = this.agentRequests.get(agentId) || [];
    let cancelled = 0;

    for (const requestId of requestIds) {
      const request = this.requests.get(requestId);
      if (request && request.status === 'pending') {
        request.status = 'failed';
        request.completedAt = Date.now();
        cancelled++;
      }
    }

    return cancelled;
  }

  /**
   * Get statistics
   */
  getStats(): EditorBridgeStats {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const request of this.requests.values()) {
      switch (request.status) {
        case 'pending':
          pending++;
          break;
        case 'processing':
          processing++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      totalRequests: this.requests.size,
      pendingRequests: pending,
      processingRequests: processing,
      completedRequests: completed,
      failedRequests: failed,
      activeRequestCount: this.activeRequestCount,
      agentCount: this.agentRequests.size,
    };
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    for (const [id, request] of this.requests) {
      if (request.status === 'completed' || request.status === 'failed') {
        this.requests.delete(id);
      }
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private checkRateLimit(agentId: string): boolean {
    const now = Date.now();
    let counter = this.rateLimitCounters.get(agentId);

    if (!counter || now >= counter.resetAt) {
      counter = {
        count: 0,
        resetAt: now + this.config.rateLimitWindowMs,
      };
      this.rateLimitCounters.set(agentId, counter);
    }

    if (counter.count >= this.config.rateLimitPerAgent) {
      return false;
    }

    counter.count++;
    return true;
  }

  private trackAgentRequest(agentId: string, requestId: string): void {
    let requests = this.agentRequests.get(agentId);
    if (!requests) {
      requests = [];
      this.agentRequests.set(agentId, requests);
    }
    requests.push(requestId);

    // Keep only last 100 requests per agent
    if (requests.length > 100) {
      const removed = requests.shift();
      if (removed) {
        this.requests.delete(removed);
      }
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      sql: 'sql',
      sh: 'shellscript',
      bash: 'shellscript',
    };

    return languageMap[ext || ''] || 'plaintext';
  }

  private emitEvent(
    type: EditorBridgeEvent['type'],
    requestId: string,
    agentId: string,
    action: EditorAIAction
  ): void {
    const event: EditorBridgeEvent = {
      type,
      requestId,
      agentId,
      action,
      timestamp: Date.now(),
    };
    this.emit('editor', event);
  }
}

// =============================================================================
// Types
// =============================================================================

interface EditorBridgeStats {
  totalRequests: number;
  pendingRequests: number;
  processingRequests: number;
  completedRequests: number;
  failedRequests: number;
  activeRequestCount: number;
  agentCount: number;
}
