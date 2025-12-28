/**
 * Code Action Provider
 *
 * Provides code actions to agents, including refactoring,
 * quick fixes, and source actions.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import type { EditorBridge } from './EditorBridge';
import type { Diagnostic } from './DiagnosticsCollector';

// =============================================================================
// Types
// =============================================================================

export type CodeActionKind =
  | 'quickfix'
  | 'refactor'
  | 'refactor.extract'
  | 'refactor.inline'
  | 'refactor.rewrite'
  | 'source'
  | 'source.organizeImports'
  | 'source.fixAll';

export interface CodeAction {
  id: string;
  title: string;
  kind: CodeActionKind;
  description?: string;
  isPreferred?: boolean;
  disabled?: { reason: string };
  edit?: CodeActionEdit;
  command?: CodeActionCommand;
  diagnostics?: Diagnostic[];
}

export interface CodeActionEdit {
  changes: Array<{
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
}

export interface CodeActionCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface CodeActionContext {
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  diagnostics?: Diagnostic[];
  only?: CodeActionKind[];
  triggerKind?: 'invoked' | 'automatic';
}

export interface CodeActionProviderConfig {
  enableQuickFixes: boolean;
  enableRefactorings: boolean;
  enableSourceActions: boolean;
  maxActionsPerRequest: number;
}

export const DEFAULT_CODE_ACTION_PROVIDER_CONFIG: CodeActionProviderConfig = {
  enableQuickFixes: true,
  enableRefactorings: true,
  enableSourceActions: true,
  maxActionsPerRequest: 20,
};

// =============================================================================
// CodeActionProvider
// =============================================================================

export class CodeActionProvider extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: CodeActionProviderConfig;
  private readonly editorBridge: EditorBridge;
  private readonly registeredActions = new Map<string, CodeAction>();
  private readonly actionHistory: Array<{ actionId: string; agentId: string; timestamp: number }> = [];

  constructor(
    logger: Logger,
    editorBridge: EditorBridge,
    config: Partial<CodeActionProviderConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.editorBridge = editorBridge;
    this.config = { ...DEFAULT_CODE_ACTION_PROVIDER_CONFIG, ...config };

    // Register built-in actions
    this.registerBuiltInActions();
  }

  /**
   * Get available code actions for a context
   */
  async getCodeActions(
    agentId: string,
    context: CodeActionContext
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Filter by kind if specified
    const kindFilter = context.only || [];

    // Get quick fixes for diagnostics
    if (this.config.enableQuickFixes && context.diagnostics?.length) {
      if (kindFilter.length === 0 || kindFilter.includes('quickfix')) {
        const quickFixes = await this.getQuickFixes(agentId, context);
        actions.push(...quickFixes);
      }
    }

    // Get refactoring actions
    if (this.config.enableRefactorings) {
      const refactorKinds: CodeActionKind[] = ['refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite'];
      if (kindFilter.length === 0 || kindFilter.some(k => refactorKinds.includes(k))) {
        const refactorings = this.getRefactoringActions(context);
        actions.push(...refactorings);
      }
    }

    // Get source actions
    if (this.config.enableSourceActions) {
      const sourceKinds: CodeActionKind[] = ['source', 'source.organizeImports', 'source.fixAll'];
      if (kindFilter.length === 0 || kindFilter.some(k => sourceKinds.includes(k))) {
        const sourceActions = this.getSourceActions(context);
        actions.push(...sourceActions);
      }
    }

    // Add registered custom actions
    for (const action of this.registeredActions.values()) {
      if (kindFilter.length === 0 || kindFilter.includes(action.kind)) {
        actions.push(action);
      }
    }

    // Limit and sort
    return actions
      .sort((a, b) => {
        // Preferred actions first
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        // Quick fixes before refactorings
        if (a.kind === 'quickfix' && b.kind !== 'quickfix') return -1;
        if (a.kind !== 'quickfix' && b.kind === 'quickfix') return 1;
        return 0;
      })
      .slice(0, this.config.maxActionsPerRequest);
  }

  /**
   * Execute a code action
   */
  async executeAction(
    agentId: string,
    actionId: string,
    context: CodeActionContext
  ): Promise<{ success: boolean; error?: string }> {
    const action = this.registeredActions.get(actionId);

    // Record in history
    this.actionHistory.push({
      actionId,
      agentId,
      timestamp: Date.now(),
    });

    // Keep history bounded
    if (this.actionHistory.length > 1000) {
      this.actionHistory.splice(0, 100);
    }

    if (!action) {
      // Try to execute as a dynamic action
      return this.executeDynamicAction(agentId, actionId, context);
    }

    try {
      // Execute command if present
      if (action.command) {
        this.emit('command', {
          agentId,
          command: action.command.command,
          arguments: action.command.arguments,
        });
      }

      // Apply edit if present
      if (action.edit) {
        // Edits would be applied by the caller
        this.emit('edit', {
          agentId,
          actionId,
          edit: action.edit,
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Register a custom code action
   */
  registerAction(action: Omit<CodeAction, 'id'>): string {
    const id = randomUUID();
    this.registeredActions.set(id, { ...action, id });
    return id;
  }

  /**
   * Unregister a code action
   */
  unregisterAction(actionId: string): boolean {
    return this.registeredActions.delete(actionId);
  }

  /**
   * Get action history for an agent
   */
  getActionHistory(agentId?: string, limit: number = 50): Array<{ actionId: string; agentId: string; timestamp: number }> {
    let history = this.actionHistory;
    if (agentId) {
      history = history.filter(h => h.agentId === agentId);
    }
    return history.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats(): CodeActionProviderStats {
    return {
      registeredActions: this.registeredActions.size,
      totalExecutions: this.actionHistory.length,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private registerBuiltInActions(): void {
    // Organize imports
    this.registerAction({
      title: 'Organize Imports',
      kind: 'source.organizeImports',
      description: 'Sort and remove unused imports',
      command: {
        title: 'Organize Imports',
        command: 'editor.action.organizeImports',
      },
    });

    // Fix all
    this.registerAction({
      title: 'Fix All',
      kind: 'source.fixAll',
      description: 'Apply all auto-fixable changes',
      command: {
        title: 'Fix All',
        command: 'editor.action.fixAll',
      },
    });
  }

  private async getQuickFixes(
    agentId: string,
    context: CodeActionContext
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    if (!context.diagnostics?.length) return actions;

    for (const diagnostic of context.diagnostics) {
      try {
        const result = await this.editorBridge.requestQuickFixes(agentId, {
          filePath: context.filePath,
          codeContext: '', // Would need actual code context
          diagnostic: {
            message: diagnostic.message,
            line: diagnostic.line,
            column: diagnostic.column,
            endLine: diagnostic.endLine,
            endColumn: diagnostic.endColumn,
            source: diagnostic.source,
          },
        });

        for (const fix of result.fixes) {
          actions.push({
            id: randomUUID(),
            title: fix.title,
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [diagnostic],
            edit: {
              changes: [{
                filePath: context.filePath,
                edits: [{
                  range: {
                    startLine: diagnostic.line,
                    startColumn: diagnostic.column,
                    endLine: diagnostic.endLine || diagnostic.line,
                    endColumn: diagnostic.endColumn || diagnostic.column + 10,
                  },
                  newText: fix.code,
                }],
              }],
            },
          });
        }
      } catch (error) {
        this.logger.debug('Failed to get quick fixes', {
          diagnostic: diagnostic.message,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return actions;
  }

  private getRefactoringActions(context: CodeActionContext): CodeAction[] {
    const actions: CodeAction[] = [];
    const hasSelection = context.range.startLine !== context.range.endLine ||
                         context.range.startColumn !== context.range.endColumn;

    if (hasSelection) {
      // Extract actions
      actions.push({
        id: randomUUID(),
        title: 'Extract to Function',
        kind: 'refactor.extract',
        description: 'Extract selected code to a new function',
        command: {
          title: 'Extract to Function',
          command: 'editor.action.extractFunction',
        },
      });

      actions.push({
        id: randomUUID(),
        title: 'Extract to Variable',
        kind: 'refactor.extract',
        description: 'Extract selected expression to a variable',
        command: {
          title: 'Extract to Variable',
          command: 'editor.action.extractVariable',
        },
      });
    }

    // Inline action
    actions.push({
      id: randomUUID(),
      title: 'Inline Variable',
      kind: 'refactor.inline',
      description: 'Inline variable at cursor',
      command: {
        title: 'Inline Variable',
        command: 'editor.action.inlineVariable',
      },
    });

    // Rename
    actions.push({
      id: randomUUID(),
      title: 'Rename Symbol',
      kind: 'refactor.rewrite',
      description: 'Rename symbol at cursor',
      command: {
        title: 'Rename Symbol',
        command: 'editor.action.rename',
      },
    });

    return actions;
  }

  private getSourceActions(_context: CodeActionContext): CodeAction[] {
    // Return registered source actions
    return Array.from(this.registeredActions.values())
      .filter(a => a.kind.startsWith('source'));
  }

  private async executeDynamicAction(
    agentId: string,
    actionId: string,
    context: CodeActionContext
  ): Promise<{ success: boolean; error?: string }> {
    // Dynamic actions would be handled by the editor
    this.emit('dynamic-action', {
      agentId,
      actionId,
      context,
    });

    return { success: true };
  }
}

// =============================================================================
// Types
// =============================================================================

interface CodeActionProviderStats {
  registeredActions: number;
  totalExecutions: number;
}
