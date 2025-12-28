/**
 * Tool System Setup
 * 
 * Central entry point for initializing the tool system.
 * Creates and configures all tool-related components.
 */
import { ToolRegistry } from './registry';
import { ALL_TOOLS } from './implementations';
import { ProcessTerminalManager } from './terminalManager';
import type { ToolLogger, TerminalManager } from './types';
import { createLogger } from '../logger';

const logger = createLogger('ToolSystem');

export interface ToolingConfig {
  logger: ToolLogger;
}

export interface ToolingSystem {
  registry: ToolRegistry;
  terminalManager: TerminalManager;
}

// Track whether the tooling system has been initialized to detect multiple initializations
let toolingSystemInitCount = 0;

/**
 * Build and configure the complete tooling system
 */
export function buildToolingSystem(config: ToolingConfig): ToolingSystem {
  toolingSystemInitCount++;
  
  if (toolingSystemInitCount > 1) {
    // Log a warning but don't throw - this could happen on macOS app reactivation
    logger.warn('Tool system initialized multiple times. This may indicate the AgentOrchestrator is being recreated unexpectedly.', {
      initializationCount: toolingSystemInitCount,
    });
  }
  
  const registry = new ToolRegistry();
  const terminalManager = new ProcessTerminalManager();
  
  // Log tool system initialization
  config.logger.info('Initializing tool system', { 
    toolCount: ALL_TOOLS.length,
    initializationCount: toolingSystemInitCount,
  });

  // Register all tools
  for (const tool of ALL_TOOLS) {
    registry.register(tool);
  }

  // Register common aliases for compatibility
  registry.registerAlias('read_file', 'read');
  registry.registerAlias('write_file', 'write');
  registry.registerAlias('edit_file', 'edit');
  registry.registerAlias('replace_string_in_file', 'edit');
  registry.registerAlias('create_file', 'write');
  registry.registerAlias('list_dir', 'ls');
  registry.registerAlias('list_directory', 'ls');
  registry.registerAlias('search', 'grep');
  registry.registerAlias('run_terminal_command', 'run');
  registry.registerAlias('bash', 'run');
  registry.registerAlias('shell', 'run');
  
  // Web search aliases
  registry.registerAlias('google', 'web_search');
  registry.registerAlias('search_web', 'web_search');
  registry.registerAlias('research', 'deep_research');
  
  // New tool aliases
  registry.registerAlias('fetch', 'live_fetch');
  registry.registerAlias('fetch_url', 'live_fetch');
  registry.registerAlias('get_page', 'live_fetch');
  
  return {
    registry,
    terminalManager,
  };
}

// Re-export types and components for external use
export * from './types';
export * from './registry';
export * from './executor';
