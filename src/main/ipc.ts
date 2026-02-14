/**
 * IPC Handler Registration
 * 
 * This file serves as the entry point for all IPC handlers.
 * The handlers are organized into modular files in the `./ipc/` directory.
 */

import type { IpcContext } from './ipc/types';
import { registerIpcHandlers as registerModularHandlers, cleanupTerminalSessions } from './ipc/index';
import { createLogger } from './logger';

const logger = createLogger('IPC');

/**
 * Register all IPC handlers for the main process.
 * This function delegates to modular handlers in the `./ipc/` directory.
 */
export const registerIpcHandlers = (context: IpcContext) => {
  logger.info('Registering modular IPC handlers');
  registerModularHandlers(context);
  logger.info('IPC handlers registered successfully');
};

// Re-export cleanup function for use in app shutdown
export { cleanupTerminalSessions };

// Re-export event batcher for performance optimization
export {
  IpcEventBatcher,
  initIpcEventBatcher,
  getIpcEventBatcher,
  sendBatchedEvent,
  getEventPriority,
  EventPriority,
} from './ipc/eventBatcher';
