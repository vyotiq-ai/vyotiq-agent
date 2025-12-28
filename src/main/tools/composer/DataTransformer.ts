/**
 * Data Transformer
 *
 * Transforms data between workflow steps using JSONPath-like paths
 * and various transformation operations.
 */
import type { DataBinding, DataTransformType } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('DataTransformer');

/**
 * Data Transformer class
 */
export class DataTransformer {
  /**
   * Extract value from object using a path
   */
  extractValue(data: unknown, path: string): unknown {
    if (path === '' || path === '.') {
      return data;
    }

    // Handle special paths
    if (path === 'input') {
      return data;
    }

    const parts = this.parsePath(path);
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof part === 'number') {
        // Array index
        if (Array.isArray(current)) {
          current = current[part];
        } else {
          return undefined;
        }
      } else {
        // Object property
        if (typeof current === 'object') {
          current = (current as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
    }

    return current;
  }

  /**
   * Parse a path string into parts
   */
  private parsePath(path: string): Array<string | number> {
    const parts: Array<string | number> = [];
    const regex = /\.?([^.[\]]+)|\[(\d+)\]/g;
    let match;

    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) {
        parts.push(match[1]);
      } else if (match[2] !== undefined) {
        parts.push(parseInt(match[2], 10));
      }
    }

    return parts;
  }

  /**
   * Apply a data binding to extract and transform data
   */
  applyBinding(
    binding: DataBinding,
    context: Record<string, unknown>
  ): unknown {
    // Get source data
    const sourceData = context[binding.source];
    if (sourceData === undefined && binding.source !== 'input') {
      logger.warn('Binding source not found', { source: binding.source });
      return undefined;
    }

    // Extract value from source
    let value = this.extractValue(sourceData, binding.sourcePath);

    // Apply transformation if specified
    if (binding.transform && binding.transform !== 'identity') {
      value = this.transform(value, binding.transform);
    }

    return value;
  }

  /**
   * Apply a transformation to a value
   */
  transform(value: unknown, transformType: DataTransformType): unknown {
    switch (transformType) {
      case 'identity':
        return value;

      case 'json_parse':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            logger.warn('Failed to parse JSON', { value });
            return value;
          }
        }
        return value;

      case 'json_stringify':
        return JSON.stringify(value);

      case 'split':
        if (typeof value === 'string') {
          return value.split('\n');
        }
        return value;

      case 'join':
        if (Array.isArray(value)) {
          return value.join('\n');
        }
        return value;

      case 'map':
        // Map requires additional config, return as-is
        return value;

      case 'filter':
        // Filter requires additional config, return as-is
        return value;

      case 'flatten':
        if (Array.isArray(value)) {
          return value.flat();
        }
        return value;

      case 'first':
        if (Array.isArray(value)) {
          return value[0];
        }
        return value;

      case 'last':
        if (Array.isArray(value)) {
          return value[value.length - 1];
        }
        return value;

      case 'count':
        if (Array.isArray(value)) {
          return value.length;
        }
        if (typeof value === 'string') {
          return value.length;
        }
        return 0;

      case 'extract_property':
        // Needs property name, handled elsewhere
        return value;

      default:
        logger.warn('Unknown transform type', { transformType });
        return value;
    }
  }

  /**
   * Resolve all bindings for a step
   */
  resolveBindings(
    bindings: DataBinding[],
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const binding of bindings) {
      const value = this.applyBinding(binding, context);
      result[binding.target] = value;
    }

    return result;
  }

  /**
   * Merge static args with resolved bindings
   */
  mergeArgs(
    staticArgs: Record<string, unknown> | undefined,
    resolvedBindings: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...staticArgs,
      ...resolvedBindings,
    };
  }

  /**
   * Set a value at a path in an object (for output)
   */
  setValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = this.parsePath(path);
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      const isNextArray = typeof nextPart === 'number';

      if (typeof part === 'number') {
        // Current is array
        const arr = current as unknown as unknown[];
        if (arr[part] === undefined) {
          arr[part] = isNextArray ? [] : {};
        }
        current = arr[part] as Record<string, unknown>;
      } else {
        // Current is object
        if (current[part] === undefined) {
          current[part] = isNextArray ? [] : {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }

    const lastPart = parts[parts.length - 1];
    if (typeof lastPart === 'number') {
      (current as unknown as unknown[])[lastPart] = value;
    } else if (typeof lastPart === 'string') {
      current[lastPart] = value;
    }
  }

  /**
   * Create a deep copy of data
   */
  deepCopy<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Check if a value is truthy for conditional evaluation
   */
  isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false) {
      return false;
    }
    if (typeof value === 'number' && value === 0) {
      return false;
    }
    if (typeof value === 'string' && value === '') {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }
    if (typeof value === 'object' && Object.keys(value as object).length === 0) {
      return false;
    }
    return true;
  }

  /**
   * Evaluate a simple condition expression
   */
  evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    // Simple condition format: "variableName" (truthy check)
    // Or: "variableName.property == value"
    // Or: "variableName.length > 0"
    
    const trimmed = condition.trim();

    // Simple truthy check
    if (!trimmed.includes('==') && !trimmed.includes('!=') && 
        !trimmed.includes('>') && !trimmed.includes('<')) {
      const value = this.extractValue(context, trimmed);
      return this.isTruthy(value);
    }

    // Parse comparison
    const operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
    for (const op of operators) {
      if (trimmed.includes(op)) {
        const [leftPath, rightValue] = trimmed.split(op).map(s => s.trim());
        const leftVal = this.extractValue(context, leftPath);
        let rightVal: unknown = rightValue;

        // Try to parse right value
        if (rightValue === 'true') rightVal = true;
        else if (rightValue === 'false') rightVal = false;
        else if (rightValue === 'null') rightVal = null;
        else if (/^\d+$/.test(rightValue)) rightVal = parseInt(rightValue, 10);
        else if (/^\d+\.\d+$/.test(rightValue)) rightVal = parseFloat(rightValue);
        else if (rightValue.startsWith('"') && rightValue.endsWith('"')) {
          rightVal = rightValue.slice(1, -1);
        }

        switch (op) {
          case '===': return leftVal === rightVal;
          case '!==': return leftVal !== rightVal;
          case '==': return leftVal == rightVal;
          case '!=': return leftVal != rightVal;
          case '>=': return (leftVal as number) >= (rightVal as number);
          case '<=': return (leftVal as number) <= (rightVal as number);
          case '>': return (leftVal as number) > (rightVal as number);
          case '<': return (leftVal as number) < (rightVal as number);
        }
      }
    }

    logger.warn('Could not evaluate condition', { condition });
    return false;
  }
}

// Singleton instance
let transformerInstance: DataTransformer | null = null;

/**
 * Get or create the data transformer singleton
 */
export function getDataTransformer(): DataTransformer {
  if (!transformerInstance) {
    transformerInstance = new DataTransformer();
  }
  return transformerInstance;
}
