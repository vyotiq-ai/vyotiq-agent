/**
 * Tool Schema Validator
 * 
 * Runtime JSON Schema validation for tool arguments before execution.
 * Provides clear error messages for invalid tool calls and supports
 * type coercion for common LLM output quirks.
 */

import type { ToolSchema, SchemaProperty } from '../tools/types';
import { createLogger } from '../logger';

const logger = createLogger('SchemaValidator');

// =============================================================================
// Types
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Validated and potentially coerced arguments */
  coercedArgs?: Record<string, unknown>;
}

export interface ValidationError {
  path: string;
  message: string;
  code: ValidationErrorCode;
  expected?: string;
  received?: string;
}

export type ValidationErrorCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_ENUM'
  | 'INVALID_ARRAY_ITEMS'
  | 'INVALID_OBJECT_PROPERTIES'
  | 'ADDITIONAL_PROPERTIES'
  | 'COERCION_FAILED';

export interface ValidationOptions {
  /** Whether to allow type coercion (e.g., "true" → true) */
  coerce?: boolean;
  /** Whether to strip additional properties not in schema */
  stripAdditional?: boolean;
  /** Whether to use default values for missing optional properties */
  useDefaults?: boolean;
  /** Whether to validate strictly (fail on any extra properties) */
  strict?: boolean;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  coerce: true,
  stripAdditional: false,
  useDefaults: true,
  strict: false,
};

// =============================================================================
// Schema Validator
// =============================================================================

/**
 * Validate tool arguments against a JSON Schema
 */
export function validateToolArguments(
  args: unknown,
  schema: ToolSchema,
  toolName: string,
  options: ValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: ValidationError[] = [];

  // Handle null/undefined args
  if (args === null || args === undefined) {
    if (schema.required && schema.required.length > 0) {
      errors.push({
        path: '',
        message: `Missing required arguments for tool '${toolName}'`,
        code: 'MISSING_REQUIRED',
        expected: 'object',
        received: String(args),
      });
      return { valid: false, errors };
    }
    return { valid: true, errors: [], coercedArgs: {} };
  }

  // Ensure args is an object
  if (typeof args !== 'object' || Array.isArray(args)) {
    errors.push({
      path: '',
      message: `Arguments must be an object, got ${typeof args}`,
      code: 'INVALID_TYPE',
      expected: 'object',
      received: typeof args,
    });
    return { valid: false, errors };
  }

  const typedArgs = args as Record<string, unknown>;
  const coercedArgs: Record<string, unknown> = {};

  // Check required properties
  if (schema.required) {
    for (const requiredProp of schema.required) {
      if (!(requiredProp in typedArgs) || typedArgs[requiredProp] === undefined) {
        // Check if there's a default value
        const propSchema = schema.properties[requiredProp];
        if (opts.useDefaults && propSchema?.default !== undefined) {
          coercedArgs[requiredProp] = propSchema.default;
        } else {
          errors.push({
            path: requiredProp,
            message: `Missing required property '${requiredProp}'`,
            code: 'MISSING_REQUIRED',
          });
        }
      }
    }
  }

  // Validate each property
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const value = typedArgs[propName];

    // Skip undefined optional properties
    if (value === undefined) {
      if (opts.useDefaults && propSchema.default !== undefined) {
        coercedArgs[propName] = propSchema.default;
      }
      continue;
    }

    const propResult = validateProperty(
      value,
      propSchema,
      propName,
      opts
    );

    if (!propResult.valid) {
      errors.push(...propResult.errors);
    } else {
      coercedArgs[propName] = propResult.coercedValue ?? value;
    }
  }

  // Check for additional properties in strict mode
  if (opts.strict) {
    for (const propName of Object.keys(typedArgs)) {
      if (!(propName in schema.properties)) {
        errors.push({
          path: propName,
          message: `Unknown property '${propName}'`,
          code: 'ADDITIONAL_PROPERTIES',
        });
      }
    }
  } else if (!opts.stripAdditional) {
    // Preserve additional properties if not stripping
    for (const [propName, value] of Object.entries(typedArgs)) {
      if (!(propName in schema.properties) && !(propName in coercedArgs)) {
        coercedArgs[propName] = value;
      }
    }
  }

  if (errors.length > 0) {
    logger.warn('Tool argument validation failed', {
      toolName,
      errorCount: errors.length,
      errors: errors.map(e => ({ path: e.path, message: e.message })),
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    coercedArgs: errors.length === 0 ? coercedArgs : undefined,
  };
}

interface PropertyValidationResult {
  valid: boolean;
  errors: ValidationError[];
  coercedValue?: unknown;
}

/**
 * Validate a single property against its schema
 */
function validateProperty(
  value: unknown,
  schema: SchemaProperty,
  path: string,
  options: ValidationOptions
): PropertyValidationResult {
  const errors: ValidationError[] = [];

  // Type validation with optional coercion
  const { valid: typeValid, coercedValue } = validateAndCoerceType(
    value,
    schema.type,
    path,
    options.coerce ?? true
  );

  if (!typeValid) {
    errors.push({
      path,
      message: `Expected ${schema.type}, got ${typeof value}`,
      code: 'INVALID_TYPE',
      expected: schema.type,
      received: typeof value,
    });
    return { valid: false, errors };
  }

  const finalValue = coercedValue ?? value;

  // Enum validation
  if (schema.enum && !schema.enum.includes(String(finalValue))) {
    errors.push({
      path,
      message: `Value '${String(finalValue)}' is not one of allowed values: ${schema.enum.join(', ')}`,
      code: 'INVALID_ENUM',
      expected: schema.enum.join(' | '),
      received: String(finalValue),
    });
    return { valid: false, errors };
  }

  // Array items validation
  if (schema.type === 'array' && schema.items && Array.isArray(finalValue)) {
    const arrayErrors: ValidationError[] = [];
    const coercedArray: unknown[] = [];

    for (let i = 0; i < finalValue.length; i++) {
      const itemResult = validateProperty(
        finalValue[i],
        schema.items,
        `${path}[${i}]`,
        options
      );

      if (!itemResult.valid) {
        arrayErrors.push(...itemResult.errors);
      } else {
        coercedArray.push(itemResult.coercedValue ?? finalValue[i]);
      }
    }

    if (arrayErrors.length > 0) {
      return { valid: false, errors: arrayErrors };
    }

    return { valid: true, errors: [], coercedValue: coercedArray };
  }

  // Nested object validation
  if (schema.type === 'object' && schema.properties && typeof finalValue === 'object' && finalValue !== null) {
    const objValue = finalValue as Record<string, unknown>;
    const coercedObj: Record<string, unknown> = {};
    const objErrors: ValidationError[] = [];

    // Check required properties
    if (schema.required) {
      for (const reqProp of schema.required) {
        if (!(reqProp in objValue) || objValue[reqProp] === undefined) {
          objErrors.push({
            path: `${path}.${reqProp}`,
            message: `Missing required property '${reqProp}'`,
            code: 'MISSING_REQUIRED',
          });
        }
      }
    }

    // Validate each property
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in objValue) {
        const propResult = validateProperty(
          objValue[propName],
          propSchema,
          `${path}.${propName}`,
          options
        );

        if (!propResult.valid) {
          objErrors.push(...propResult.errors);
        } else {
          coercedObj[propName] = propResult.coercedValue ?? objValue[propName];
        }
      }
    }

    if (objErrors.length > 0) {
      return { valid: false, errors: objErrors };
    }

    return { valid: true, errors: [], coercedValue: coercedObj };
  }

  return { valid: true, errors: [], coercedValue: finalValue };
}

/**
 * Validate and optionally coerce a value to the expected type
 */
function validateAndCoerceType(
  value: unknown,
  expectedType: SchemaProperty['type'],
  path: string,
  coerce: boolean
): { valid: boolean; coercedValue?: unknown } {
  const actualType = getActualType(value);

  // Direct type match
  if (actualType === expectedType) {
    return { valid: true, coercedValue: value };
  }

  // Type coercion
  if (coerce) {
    switch (expectedType) {
      case 'string':
        // Coerce to string
        if (value !== null && value !== undefined) {
          return { valid: true, coercedValue: String(value) };
        }
        break;

      case 'number':
        // Coerce string to number
        if (typeof value === 'string') {
          const num = Number(value);
          if (!isNaN(num)) {
            return { valid: true, coercedValue: num };
          }
        }
        break;

      case 'boolean':
        // Coerce string to boolean
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1') {
            return { valid: true, coercedValue: true };
          }
          if (lower === 'false' || lower === '0') {
            return { valid: true, coercedValue: false };
          }
        }
        if (typeof value === 'number') {
          return { valid: true, coercedValue: value !== 0 };
        }
        break;

      case 'array':
        // Coerce single value to array
        if (!Array.isArray(value)) {
          return { valid: true, coercedValue: [value] };
        }
        break;

      case 'object':
        // Try to parse string as JSON object
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              return { valid: true, coercedValue: parsed };
            }
          } catch {
            // Not valid JSON
          }
        }
        break;
    }
  }

  return { valid: false };
}

/**
 * Get the JSON Schema type of a value
 */
function getActualType(value: unknown): SchemaProperty['type'] | 'null' | 'undefined' {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'object';
}

// =============================================================================
// Format Validation Error Messages
// =============================================================================

/**
 * Format validation errors into a human-readable message for the LLM
 */
export function formatValidationErrors(
  errors: ValidationError[],
  toolName: string
): string {
  if (errors.length === 0) return '';

  const lines = [
    `Invalid arguments for tool '${toolName}':`,
    '',
  ];

  for (const error of errors) {
    const pathStr = error.path ? `'${error.path}'` : 'root';
    lines.push(`• ${pathStr}: ${error.message}`);
    if (error.expected && error.received) {
      lines.push(`  Expected: ${error.expected}, Got: ${error.received}`);
    }
  }

  lines.push('');
  lines.push('Please correct the arguments and try again.');

  return lines.join('\n');
}

// =============================================================================
// Quick Validation Helpers
// =============================================================================

/**
 * Quick validation for required string fields
 */
export function isValidString(value: unknown, minLength = 0): value is string {
  return typeof value === 'string' && value.length >= minLength;
}

/**
 * Quick validation for required number fields
 */
export function isValidNumber(value: unknown, min?: number, max?: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

/**
 * Quick validation for file paths
 */
export function isValidFilePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  // Block obvious path traversal attempts
  if (value.includes('..') && (value.includes('/..') || value.includes('\\..'))) {
    return false;
  }
  return true;
}

/**
 * Quick validation for arrays
 */
export function isValidArray(value: unknown, minLength = 0): value is unknown[] {
  return Array.isArray(value) && value.length >= minLength;
}
