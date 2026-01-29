/**
 * Terminal Integration Module
 *
 * Provides basic terminal integration including:
 * - Terminal management
 * - Command execution
 * - Output handling
 */

import type { Logger } from '../../logger';
import { ProcessTerminalManager } from '../../tools/terminalManager';

let terminalManagerInstance: ProcessTerminalManager | null = null;

/**
 * Initialize terminal integration
 */
export async function initTerminal(
  logger: Logger,
  terminalManager: ProcessTerminalManager
): Promise<void> {
  terminalManagerInstance = terminalManager;
  logger.info('Terminal integration initialized');
}

/**
 * Get terminal manager instance
 */
export function getTerminalManager(): ProcessTerminalManager | null {
  return terminalManagerInstance;
}

/**
 * Reset terminal integration
 */
export function resetTerminal(): void {
  terminalManagerInstance = null;
}