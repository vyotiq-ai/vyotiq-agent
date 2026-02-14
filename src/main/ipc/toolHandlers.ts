/**
 * Tool IPC Handlers
 * 
 * Handles dynamic tool management IPC operations:
 * - List dynamic tools with filtering
 * - Get tool specification
 * - Update dynamic tool state
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import type {
  DynamicToolInfoIPC,
  DynamicToolListFilter,
  DynamicToolListResponse,
  DynamicToolSpecResponse,
} from '../../shared/ipcTypes';
import type { DynamicToolStatus } from '../../shared/types';

const logger = createLogger('IPC:Tools');

export function registerToolHandlers(context: IpcContext): void {
  const { getOrchestrator } = context;

  // ==========================================================================
  // Dynamic Tool Listing
  // ==========================================================================

  ipcMain.handle('dynamic-tool:list', async (_event, filter?: DynamicToolListFilter): Promise<DynamicToolListResponse> => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, tools: [], error: 'Orchestrator not initialized' };
      }

      const registry = orchestrator.getToolRegistry();
      const dynamicEntries = registry.listDynamic();

      let tools: DynamicToolInfoIPC[] = dynamicEntries.map(entry => ({
        id: entry.spec.id,
        name: entry.definition.name,
        description: entry.definition.description || '',
        status: entry.state.status === 'active' ? 'active' : 
                entry.state.status === 'expired' ? 'expired' : 'disabled',
        category: entry.definition.category,
        usageCount: entry.state.usageCount ?? 0,
        successRate: entry.state.usageCount
          ? (((entry.state.usageCount - entry.state.errorCount) / entry.state.usageCount) * 100)
          : 100,
        createdAt: Date.now(),
        lastUsedAt: entry.state.lastUsedAt,
      }));

      // Apply filters
      if (filter?.status) {
        tools = tools.filter(t => t.status === filter.status);
      }
      if (filter?.category) {
        tools = tools.filter(t => t.category === filter.category);
      }

      return { success: true, tools };
    } catch (error) {
      logger.error('Failed to list dynamic tools', { error });
      return { success: false, tools: [], error: String(error) };
    }
  });

  // ==========================================================================
  // Dynamic Tool Specification
  // ==========================================================================

  ipcMain.handle('dynamic-tool:spec', async (_event, toolName: string): Promise<DynamicToolSpecResponse> => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const registry = orchestrator.getToolRegistry();
      const entry = registry.getDynamicEntry(toolName);

      if (!entry) {
        return { success: false, error: `Dynamic tool '${toolName}' not found` };
      }

      return {
        success: true,
        spec: {
          name: entry.definition.name,
          description: entry.definition.description || '',
          inputSchema: entry.spec.inputSchema,
          executionType: entry.spec.executionType,
          requiredCapabilities: entry.spec.requiredCapabilities,
          riskLevel: entry.spec.riskLevel,
        },
      };
    } catch (error) {
      logger.error('Failed to get dynamic tool spec', { toolName, error });
      return { success: false, error: String(error) };
    }
  });

  // ==========================================================================
  // Dynamic Tool State Update
  // ==========================================================================

  ipcMain.handle('dynamic-tool:update-state', async (_event, toolName: string, updates: { status?: DynamicToolStatus }) => {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator) {
        return { success: false, error: 'Orchestrator not initialized' };
      }

      const registry = orchestrator.getToolRegistry();
      const updated = registry.updateDynamicState(toolName, updates);

      if (!updated) {
        return { success: false, error: `Dynamic tool '${toolName}' not found` };
      }

      logger.info('Dynamic tool state updated', { toolName, updates });
      return { success: true };
    } catch (error) {
      logger.error('Failed to update dynamic tool state', { toolName, error });
      return { success: false, error: String(error) };
    }
  });
}
