/**
 * Dynamic Tool Storage Module
 *
 * Persistent storage for dynamically created tools.
 * Handles saving, loading, updating, and lifecycle management
 * of tools created at runtime.
 */
import type {
  ToolSpecification,
  DynamicToolState,
  ToolTemplate,
} from '../../../shared/types';
import { getStorageManager, type StorageResult } from './StorageManager';
import { createLogger } from '../../logger';

const logger = createLogger('DynamicToolStorage');

/**
 * Stored dynamic tool with state
 */
export interface StoredDynamicTool {
  specification: ToolSpecification;
  state: DynamicToolState;
}

/**
 * Query options for searching tools
 */
export interface DynamicToolQuery {
  sessionId?: string;
  status?: DynamicToolState['status'];
  riskLevel?: ToolSpecification['riskLevel'];
  createdAfter?: number;
  createdBefore?: number;
}

/**
 * Dynamic Tool Storage Manager
 */
export class DynamicToolStorage {
  private readonly storage = getStorageManager();

  /**
   * Initialize storage
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    logger.info('Dynamic tool storage initialized');
  }

  /**
   * Save a new dynamic tool
   */
  async saveTool(tool: ToolSpecification): Promise<StorageResult<void>> {
    const state: DynamicToolState = {
      name: tool.name,
      status: 'active',
      usageCount: 0,
      errorCount: 0,
    };

    const stored: StoredDynamicTool = {
      specification: tool,
      state,
    };

    const result = await this.storage.write('dynamic-tool', tool.id, stored);
    if (result.success) {
      logger.info('Saved dynamic tool', { id: tool.id, name: tool.name });
    }
    return result;
  }

  /**
   * Load a dynamic tool by ID
   */
  async loadTool(id: string): Promise<StorageResult<StoredDynamicTool>> {
    return this.storage.read<StoredDynamicTool>('dynamic-tool', id);
  }

  /**
   * Load a dynamic tool by name
   */
  async loadToolByName(name: string): Promise<StorageResult<StoredDynamicTool>> {
    const listResult = await this.listTools();
    if (!listResult.success || !listResult.data) {
      return { success: false, error: 'Failed to list tools' };
    }

    for (const id of listResult.data) {
      const toolResult = await this.loadTool(id);
      if (toolResult.success && toolResult.data?.specification.name === name) {
        return toolResult;
      }
    }

    return { success: false, error: 'Tool not found' };
  }

  /**
   * Update a tool's specification
   */
  async updateTool(id: string, updates: Partial<ToolSpecification>): Promise<StorageResult<void>> {
    const existing = await this.loadTool(id);
    if (!existing.success || !existing.data) {
      return { success: false, error: 'Tool not found' };
    }

    const updated: StoredDynamicTool = {
      specification: {
        ...existing.data.specification,
        ...updates,
        version: existing.data.specification.version + 1,
      },
      state: existing.data.state,
    };

    return this.storage.write('dynamic-tool', id, updated);
  }

  /**
   * Update a tool's state
   */
  async updateState(id: string, stateUpdates: Partial<DynamicToolState>): Promise<StorageResult<void>> {
    const existing = await this.loadTool(id);
    if (!existing.success || !existing.data) {
      return { success: false, error: 'Tool not found' };
    }

    const updated: StoredDynamicTool = {
      specification: existing.data.specification,
      state: {
        ...existing.data.state,
        ...stateUpdates,
      },
    };

    return this.storage.write('dynamic-tool', id, updated);
  }

  /**
   * Record tool usage
   */
  async recordUsage(id: string, success: boolean, error?: string): Promise<StorageResult<void>> {
    const existing = await this.loadTool(id);
    if (!existing.success || !existing.data) {
      return { success: false, error: 'Tool not found' };
    }

    const stateUpdates: Partial<DynamicToolState> = {
      usageCount: existing.data.state.usageCount + 1,
      lastUsedAt: Date.now(),
    };

    if (!success) {
      stateUpdates.errorCount = existing.data.state.errorCount + 1;
      stateUpdates.lastError = error;
    }

    return this.updateState(id, stateUpdates);
  }

  /**
   * Delete a dynamic tool
   */
  async deleteTool(id: string): Promise<StorageResult<void>> {
    const result = await this.storage.delete('dynamic-tool', id);
    if (result.success) {
      logger.info('Deleted dynamic tool', { id });
    }
    return result;
  }

  /**
   * List all tool IDs
   */
  async listTools(): Promise<StorageResult<string[]>> {
    return this.storage.list('dynamic-tool');
  }

  /**
   * Search tools by query
   */
  async searchTools(query: DynamicToolQuery): Promise<StorageResult<StoredDynamicTool[]>> {
    const listResult = await this.listTools();
    if (!listResult.success || !listResult.data) {
      return { success: false, error: 'Failed to list tools' };
    }

    const tools: StoredDynamicTool[] = [];

    for (const id of listResult.data) {
      const toolResult = await this.loadTool(id);
      if (!toolResult.success || !toolResult.data) continue;

      const tool = toolResult.data;
      const spec = tool.specification;
      const state = tool.state;

      // Apply filters
      if (query.sessionId && spec.createdBy.sessionId !== query.sessionId) continue;
      if (query.status && state.status !== query.status) continue;
      if (query.riskLevel && spec.riskLevel !== query.riskLevel) continue;
      if (query.createdAfter && spec.createdAt < query.createdAfter) continue;
      if (query.createdBefore && spec.createdAt > query.createdBefore) continue;

      tools.push(tool);
    }

    return { success: true, data: tools };
  }

  /**
   * Disable a tool
   */
  async disableTool(id: string, reason?: string): Promise<StorageResult<void>> {
    return this.updateState(id, {
      status: 'disabled',
      lastError: reason,
    });
  }

  /**
   * Expire a tool
   */
  async expireTool(id: string): Promise<StorageResult<void>> {
    return this.updateState(id, { status: 'expired' });
  }

  /**
   * Get tool count
   */
  async getToolCount(): Promise<number> {
    const result = await this.listTools();
    return result.success ? (result.data?.length ?? 0) : 0;
  }

  // =========================================================================
  // Tool Template Storage
  // =========================================================================

  /**
   * Save a tool template
   */
  async saveTemplate(template: ToolTemplate): Promise<StorageResult<void>> {
    return this.storage.write('tool-template', template.id, template);
  }

  /**
   * Load a tool template
   */
  async loadTemplate(id: string): Promise<StorageResult<ToolTemplate>> {
    return this.storage.read<ToolTemplate>('tool-template', id);
  }

  /**
   * List all template IDs
   */
  async listTemplates(): Promise<StorageResult<string[]>> {
    return this.storage.list('tool-template');
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<StorageResult<void>> {
    return this.storage.delete('tool-template', id);
  }
}

// Singleton instance
let dynamicToolStorageInstance: DynamicToolStorage | null = null;

/**
 * Get or create the dynamic tool storage singleton
 */
export function getDynamicToolStorage(): DynamicToolStorage {
  if (!dynamicToolStorageInstance) {
    dynamicToolStorageInstance = new DynamicToolStorage();
  }
  return dynamicToolStorageInstance;
}
