/**
 * LSP Module Index
 * 
 * Multi-language Language Server Protocol integration.
 * Provides code intelligence features for the agent and editor.
 */

export { LSPClient } from './LSPClient';
export { LSPManager, DEFAULT_LSP_MANAGER_CONFIG, type LSPManagerConfig } from './LSPManager';
export { LSPBridge, initLSPBridge, getLSPBridge, type DiagnosticsUpdateEvent } from './LSPBridge';
export {
  LANGUAGE_SERVER_CONFIGS,
  getLanguageFromExtension,
  getConfigForFile,
  isLanguageSupported,
  getSupportedLanguages,
  SYMBOL_KIND_NAMES,
  COMPLETION_KIND_NAMES,
} from './serverConfigs';
export * from './types';

// =============================================================================
// Singleton Instance
// =============================================================================

import type { Logger } from '../logger';
import { LSPManager, type LSPManagerConfig } from './LSPManager';

let instance: LSPManager | null = null;

/**
 * Initialize the global LSP manager
 */
export function initLSPManager(
  logger: Logger,
  config?: Partial<LSPManagerConfig>
): LSPManager {
  if (instance) {
    return instance;
  }
  instance = new LSPManager(logger, config);
  return instance;
}

/**
 * Get the global LSP manager instance
 */
export function getLSPManager(): LSPManager | null {
  return instance;
}

/**
 * Shutdown the global LSP manager
 */
export async function shutdownLSPManager(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}
