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
