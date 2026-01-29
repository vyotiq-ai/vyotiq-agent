/**
 * LSP Bridge
 * 
 * Connects file system changes to LSP servers for real-time diagnostics.
 * Provides automatic document synchronization and diagnostics push.
 */

import { EventEmitter } from 'node:events';
import type { Logger } from '../logger';
import { getLSPManager } from './index';
import { getTypeScriptDiagnosticsService } from '../agent/workspace/TypeScriptDiagnosticsService';
import type { NormalizedDiagnostic } from './types';

export interface DiagnosticsUpdateEvent {
  filePath: string;
  diagnostics: NormalizedDiagnostic[];
  source: 'lsp' | 'typescript';
  timestamp: number;
}

export class LSPBridge extends EventEmitter {
  private readonly logger: Logger;
  private readonly debounceMs: number;
  private pendingChanges = new Map<string, { type: 'create' | 'change' | 'delete'; timestamp: number }>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(logger: Logger, debounceMs = 150) {
    super();
    this.logger = logger;
    this.debounceMs = debounceMs;
  }

  /**
   * Handle a file change event from the file watcher
   */
  onFileChanged(filePath: string, changeType: 'create' | 'change' | 'delete'): void {
    this.pendingChanges.set(filePath, { type: changeType, timestamp: Date.now() });
    this.scheduleProcessing();
  }

  /**
   * Force immediate processing of pending changes
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.processPendingChanges();
  }

  /**
   * Get current diagnostics for a file
   */
  async getDiagnostics(filePath: string): Promise<NormalizedDiagnostic[]> {
    const lspManager = getLSPManager();
    if (!lspManager) return [];

    try {
      return await lspManager.getDiagnostics(filePath);
    } catch (error) {
      this.logger.debug('Failed to get diagnostics', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get all workspace diagnostics
   */
  getAllDiagnostics(): NormalizedDiagnostic[] {
    const lspManager = getLSPManager();
    if (!lspManager) return [];
    return lspManager.getAllDiagnostics();
  }

  private scheduleProcessing(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges().catch(err => {
        this.logger.error('Failed to process pending changes', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.debounceMs);
  }

  private async processPendingChanges(): Promise<void> {
    if (this.isProcessing || this.pendingChanges.size === 0) return;

    this.isProcessing = true;
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    try {
      const lspManager = getLSPManager();
      const tsDiagnosticsService = getTypeScriptDiagnosticsService();

      for (const [filePath, { type }] of changes) {
        // Update LSP manager
        if (lspManager) {
          if (type === 'delete') {
            lspManager.closeDocument(filePath);
          } else {
            await lspManager.openDocument(filePath);
          }
        }

        // Update TypeScript diagnostics service
        if (tsDiagnosticsService?.isReady()) {
          tsDiagnosticsService.onFileChanged(filePath, type);
        }
      }

      // Emit diagnostics updates for changed files
      for (const [filePath, { type }] of changes) {
        if (type !== 'delete' && lspManager) {
          const diagnostics = await lspManager.getDiagnostics(filePath);
          this.emit('diagnostics', {
            filePath,
            diagnostics,
            source: 'lsp',
            timestamp: Date.now(),
          } as DiagnosticsUpdateEvent);
        }
      }

      this.logger.debug('Processed file changes for LSP', { fileCount: changes.size });
    } finally {
      this.isProcessing = false;
    }
  }
}

// Singleton instance
let instance: LSPBridge | null = null;

export function initLSPBridge(logger: Logger): LSPBridge {
  if (instance) {
    return instance;
  }
  instance = new LSPBridge(logger);
  return instance;
}

export function getLSPBridge(): LSPBridge | null {
  return instance;
}
