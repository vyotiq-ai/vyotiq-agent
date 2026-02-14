/**
 * Main Process Utilities
 * 
 * Common utilities for the main process.
 */

// File system utilities
export * from './fileSystem';

// MIME type utilities
export { guessMimeType } from './mime';

// JSON Schema utilities
export { normalizeStrictJsonSchema } from './jsonSchemaStrict';

// JSON parsing utilities (robust parsing with recovery for streaming)
export { parseJsonRobust, parseToolArguments, type JsonParseResult } from './jsonParser';

// Schema validation utilities
export {
  validateToolArguments,
  formatValidationErrors,
  isValidString,
  isValidNumber,
  isValidFilePath,
  isValidArray,
  type ValidationResult,
  type ValidationError,
  type ValidationErrorCode,
  type ValidationOptions,
} from './schemaValidator';

// Encoding detection and repair utilities
export { 
  hasMojibake, 
  repairMojibake, 
  hasUtf8Bom, 
  removeUtf8Bom, 
  detectEncoding, 
  decodeBuffer 
} from './encoding';

// Performance utilities (2026 best practices)
export {
  // Lazy loading with WeakRef
  createLazyModule,
  // Memory-sensitive caching
  MemorySensitiveCache,
  // Debounce/throttle with cancellation
  debounce,
  throttle,
  // Object pooling for reduced GC
  ObjectPool,
  // Performance metrics
  recordMetric,
  createTimer,
  getMetric,
  getAllMetrics,
  clearMetrics,
  // Streaming with backpressure
  StreamController,
  // Batch processing
  BatchProcessor,
  // Idle task scheduling
  scheduleIdleTask,
  cancelIdleTask,
} from './performance';

// Rust backend utilities (shared HTTP helper & workspace ID resolution)
export {
  rustRequest,
  resolveWorkspaceId,
  normalizePath,
  clearWorkspaceIdCache,
} from './rustBackend';
