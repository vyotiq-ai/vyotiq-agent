/**
 * Workspace Module Index
 * 
 * Central export point for workspace management system.
 */

export { WorkspaceManager } from './workspaceManager';
export {
  initFileWatcher,
  watchWorkspace,
  stopWatching,
  getFileWatcher,
  getCurrentWorkspacePath,
  setLSPChangeHandler,
  setFileCacheChangeHandler,
} from './fileWatcher';
export {
  MultiWorkspaceFileWatcher,
  getMultiWorkspaceFileWatcher,
  initMultiWorkspaceFileWatcher,
  disposeMultiWorkspaceFileWatcher,
  type MultiWatcherConfig as MultiWorkspaceFileWatcherConfig,
  type WorkspaceWatcherState as WorkspaceWatchConfig,
  type FileChangeEvent as MultiWorkspaceFileEvent,
} from './MultiWorkspaceFileWatcher';
