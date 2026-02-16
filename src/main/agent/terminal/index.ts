/**
 * Terminal Integration Module
 *
 * Provides basic terminal integration including:
 * - Terminal management
 * - Command execution
 * - Output handling via OutputAggregator
 */

import type { Logger } from '../../logger';
import { ProcessTerminalManager } from '../../tools/terminalManager';
import { OutputAggregator } from './OutputAggregator';

let terminalManagerInstance: ProcessTerminalManager | null = null;
let outputAggregatorInstance: OutputAggregator | null = null;

/**
 * Initialize terminal integration
 */
export async function initTerminal(
  logger: Logger,
  terminalManager: ProcessTerminalManager
): Promise<void> {
  terminalManagerInstance = terminalManager;

  // Initialize output aggregator to capture and route terminal output
  outputAggregatorInstance = new OutputAggregator(logger);
  outputAggregatorInstance.initialize();

  // Wire terminal output events into the aggregator
  // ProcessTerminalManager emits 'stdout' events with { pid, chunk } payloads
  terminalManager.on('stdout', (payload: {
    pid: number;
    chunk: string;
  }) => {
    if (outputAggregatorInstance) {
      outputAggregatorInstance.addOutput(
        'agent',                    // agentId
        'default',                  // sessionId — overridden by callers if needed
        String(payload.pid),        // terminalId (convert number to string)
        payload.chunk,
        'stdout'
      );
    }
  });

  // Also capture stderr if ProcessTerminalManager ever emits it separately
  terminalManager.on('stderr', (payload: {
    pid: number;
    chunk: string;
  }) => {
    if (outputAggregatorInstance) {
      outputAggregatorInstance.addOutput(
        'agent',
        'default',
        String(payload.pid),
        payload.chunk,
        'stderr'
      );
    }
  });

  logger.info('Terminal integration initialized with OutputAggregator');
}

/**
 * Get terminal manager instance
 */
export function getTerminalManager(): ProcessTerminalManager | null {
  return terminalManagerInstance;
}

/**
 * Get output aggregator instance for subscribing to terminal output
 */
export function getOutputAggregator(): OutputAggregator | null {
  return outputAggregatorInstance;
}

/**
 * Reset terminal integration
 */
export function resetTerminal(): void {
  if (outputAggregatorInstance) {
    outputAggregatorInstance.shutdown();
    outputAggregatorInstance = null;
  }
  terminalManagerInstance = null;
}