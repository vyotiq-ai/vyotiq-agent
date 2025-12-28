/**
 * Shared Utilities
 * 
 * Common utility functions shared across main and renderer processes.
 */

// Error handling utilities
export {
  withErrorHandling,
  withErrorHandlingResult,
  withErrorHandlingSync,
  withTimeout,
  isRetryableError,
  isRateLimitError,
  isAuthError,
  isValidationError,
  createTimeoutError,
  aggregateErrors,
  ContextualError,
  RetryExhaustedError,
} from './errorHandling';

export type {
  ErrorContext,
  ErrorHandlingOptions,
  ErrorHandlingResult,
} from './errorHandling';

// Path utilities
export {
  normalizePath,
  normalizePathPreserveTrailing,
  isWithinDirectory,
  pathsEqual,
  comparePaths,
  getRelativePath,
  getExtension,
  getBasename,
  getDirname,
  getFilename,
  joinPaths,
  resolvePath,
  ensureTrailingSlash,
  removeTrailingSlash,
  detectLanguage,
  isTextFile,
  isBinaryFile,
  isAbsolutePath,
  isValidPath,
  isHidden,
  globToRegex,
  matchesGlob,
  filterPaths,
  excludePaths,
  PathUtils,
} from './pathUtils';

// Token counting utilities
export {
  getTokenCounter,
  countTokens,
  countTokensFast,
  countMessageTokens,
  truncateToTokenLimit,
  fitsWithinTokenLimit,
  useTokenCounter,
  useTokenCount,
} from './tokenCounter';

export type {
  TokenizerModel,
  TokenCountResult,
  TokenizerOptions,
} from './tokenCounter';

// Tool utilities
export {
  categorizeToolName,
  isFileOperation,
  isTerminalOperation,
  isDangerousTool,
  getToolTarget,
  extractToolTarget,
  extractToolDetail,
  extractFilePath,
  extractContent,
  getToolExecutionResult,
  formatToolName,
  getFileName,
  formatPath,
  formatDuration,
  formatToolDuration,
  formatRelativeTime,
  formatElapsedTime,
  isToolError,
  isDestructiveTool,
  groupToolMessages,
  ToolUtils,
} from './toolUtils';

export type {
  ToolCategory,
  ToolAction,
  ToolGroup,
} from './toolUtils';
