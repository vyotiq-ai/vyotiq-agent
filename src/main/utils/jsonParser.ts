/**
 * Robust JSON Parser for Streaming Tool Arguments
 * 
 * Handles malformed JSON that can occur during LLM streaming, including:
 * - Concatenated JSON objects: `{...}{...}`
 * - Trailing garbage after valid JSON
 * - Incomplete JSON with partial data
 * - Common escape sequence issues
 * 
 * @module jsonParser
 */

import { createLogger } from '../logger';

const logger = createLogger('JsonParser');

/**
 * Result of parsing attempt with metadata
 */
export interface JsonParseResult<T = unknown> {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Whether recovery was used */
  recovered?: boolean;
  /** Method used for recovery */
  recoveryMethod?: 'first-object' | 'bracket-matching' | 'truncated' | 'none';
}

/**
 * Extract the first valid JSON object from a string that may contain
 * concatenated JSON or trailing garbage.
 * 
 * This handles the common streaming artifact where multiple complete
 * JSON objects are sent without separation, producing strings like:
 * `{"path":"/foo"}{"oldString":"bar"}` 
 * 
 * @param input - Potentially malformed JSON string
 * @returns Extracted first JSON object string, or null if not found
 */
function extractFirstJsonObject(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  
  const openBracket = trimmed[0];
  const closeBracket = openBracket === '{' ? '}' : ']';
  
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) {
      continue;
    }
    
    if (char === openBracket) {
      depth++;
    } else if (char === closeBracket) {
      depth--;
      if (depth === 0) {
        // Found the end of the first complete object
        return trimmed.slice(0, i + 1);
      }
    }
  }
  
  // No complete object found
  return null;
}

/**
 * Attempt to repair common JSON issues from LLM streaming
 */
function attemptJsonRepair(input: string): string | null {
  let repaired = input.trim();
  let wasModified = false;
  
  // Remove trailing commas before closing brackets (common LLM mistake)
  const beforeTrailingComma = repaired;
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  if (repaired !== beforeTrailingComma) wasModified = true;
  
  // Remove BOM character
  if (repaired.includes('\uFEFF')) {
    repaired = repaired.replace(/\uFEFF/g, '');
    wasModified = true;
  }
  // Remove zero-width characters individually to avoid regex character class issues
  const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060'];
  for (const char of zeroWidthChars) {
    if (repaired.includes(char)) {
      repaired = repaired.split(char).join('');
      wasModified = true;
    }
  }
  
  // Fix truncated JSON - try to close unclosed strings/objects/arrays
  if (!repaired.endsWith('}') && !repaired.endsWith(']') && !repaired.endsWith('"')) {
    // Count brackets to understand structure
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString = false;
    let escaped = false;
    
    for (const char of repaired) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;
    }
    
    // If we're inside a string (odd number of unescaped quotes), try to close it
    if (inString) {
      repaired += '"';
      wasModified = true;
    }
    
    // Close unclosed brackets/braces
    while (bracketDepth > 0) {
      repaired += ']';
      bracketDepth--;
      wasModified = true;
    }
    while (braceDepth > 0) {
      repaired += '}';
      braceDepth--;
      wasModified = true;
    }
  }
  
  // Fix common escape sequence issues (unescaped newlines in strings)
  // Only do this if the JSON still fails to parse
  try {
    JSON.parse(repaired);
  } catch {
    // Try to fix newlines within strings
    const fixedNewlines = repaired.replace(/([^\\])\n/g, '$1\\n');
    if (fixedNewlines !== repaired) {
      try {
        JSON.parse(fixedNewlines);
        repaired = fixedNewlines;
        wasModified = true;
      } catch {
        // Didn't help
      }
    }
  }
  
  return wasModified ? repaired : null;
}

/**
 * Parse JSON with robust error recovery for streaming artifacts.
 * 
 * Tries multiple strategies to extract valid JSON from potentially
 * malformed input:
 * 1. Direct parse
 * 2. Extract first complete JSON object (handles concatenation)
 * 3. Basic repair attempts
 * 
 * @param input - JSON string to parse
 * @param options - Parsing options
 * @returns Parse result with recovery metadata
 */
export function parseJsonRobust<T = Record<string, unknown>>(
  input: string,
  options: {
    /** Log warnings on recovery */
    logRecovery?: boolean;
    /** Tool name for logging context */
    toolName?: string;
  } = {}
): JsonParseResult<T> {
  const { logRecovery = true, toolName } = options;
  
  if (typeof input !== 'string') {
    return {
      success: false,
      error: 'Input is not a string',
      recovered: false,
    };
  }
  
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      success: false,
      error: 'Input is empty',
      recovered: false,
    };
  }
  
  // Strategy 1: Direct parse
  try {
    const data = JSON.parse(trimmed) as T;
    return {
      success: true,
      data,
      recovered: false,
      recoveryMethod: 'none',
    };
  } catch {
    // Continue to recovery strategies
  }
  
  // Strategy 2: Extract first complete JSON object
  // This handles the common `{...}{...}` concatenation issue
  const firstObject = extractFirstJsonObject(trimmed);
  if (firstObject) {
    try {
      const data = JSON.parse(firstObject) as T;
      if (logRecovery) {
        logger.debug('Recovered JSON by extracting first object', {
          toolName,
          originalLength: input.length,
          extractedLength: firstObject.length,
          discardedLength: input.length - firstObject.length,
        });
      }
      return {
        success: true,
        data,
        recovered: true,
        recoveryMethod: 'first-object',
      };
    } catch {
      // First object extraction didn't help
    }
  }
  
  // Strategy 3: Attempt basic repairs
  const repaired = attemptJsonRepair(trimmed);
  if (repaired) {
    try {
      const data = JSON.parse(repaired) as T;
      if (logRecovery) {
        logger.debug('Recovered JSON via repair', {
          toolName,
          originalLength: input.length,
        });
      }
      return {
        success: true,
        data,
        recovered: true,
        recoveryMethod: 'truncated',
      };
    } catch {
      // Repair didn't help
    }
    
    // Try extracting first object from repaired string
    const firstFromRepaired = extractFirstJsonObject(repaired);
    if (firstFromRepaired) {
      try {
        const data = JSON.parse(firstFromRepaired) as T;
        if (logRecovery) {
          logger.debug('Recovered JSON by repair + extract', {
            toolName,
            originalLength: input.length,
            extractedLength: firstFromRepaired.length,
          });
        }
        return {
          success: true,
          data,
          recovered: true,
          recoveryMethod: 'first-object',
        };
      } catch {
        // All strategies failed
      }
    }
  }
  
  // All recovery strategies failed
  const errorPreview = trimmed.length > 100 
    ? `${trimmed.slice(0, 50)}...${trimmed.slice(-50)}`
    : trimmed;
  
  return {
    success: false,
    error: `Failed to parse JSON after recovery attempts. Preview: ${errorPreview}`,
    recovered: false,
  };
}

/**
 * Parse tool arguments with robust recovery.
 * 
 * This is the main entry point for parsing tool call arguments
 * from LLM responses, with built-in handling for common streaming issues.
 * 
 * @param argsJson - Raw arguments JSON string
 * @param toolName - Tool name for logging
 * @returns Parsed arguments or empty object on failure
 */
export function parseToolArguments(
  argsJson: string | undefined,
  toolName: string
): Record<string, unknown> {
  if (!argsJson) {
    logger.debug('parseToolArguments received empty input', { toolName });
    return {};
  }
  
  // Trim whitespace upfront
  const trimmedInput = argsJson.trim();
  if (!trimmedInput) {
    logger.debug('parseToolArguments received whitespace-only input', { toolName });
    return {};
  }
  
  // Quick path: if it's already valid JSON, use it directly
  try {
    const parsed = JSON.parse(trimmedInput);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    logger.warn('parseToolArguments parsed non-object', { toolName, type: typeof parsed });
    return {};
  } catch {
    // Continue to robust parsing
  }
  
  const result = parseJsonRobust<Record<string, unknown>>(argsJson, {
    logRecovery: true,
    toolName,
  });
  
  if (result.success && result.data) {
    // Validate that we have actual data
    const keys = Object.keys(result.data);
    if (keys.length === 0) {
      logger.warn('parseToolArguments recovered empty object', {
        tool: toolName,
        originalLength: argsJson.length,
        method: result.recoveryMethod,
      });
    }
    if (result.recovered) {
      logger.info('Tool arguments recovered via JSON parsing recovery', {
        tool: toolName,
        method: result.recoveryMethod,
        originalLength: argsJson.length,
        recoveredKeys: keys,
      });
    }
    return result.data;
  }
  
  // Last resort: try to extract key-value pairs heuristically
  // This handles cases like: file_path: "/some/path" (no quotes around key)
  const heuristicResult = tryHeuristicParsing(argsJson, toolName);
  if (heuristicResult && Object.keys(heuristicResult).length > 0) {
    logger.info('Tool arguments recovered via heuristic parsing', {
      tool: toolName,
      recoveredKeys: Object.keys(heuristicResult),
    });
    return heuristicResult;
  }
  
  logger.error('Failed to parse tool arguments after all recovery attempts', {
    tool: toolName,
    argsLength: argsJson.length,
    error: result.error,
    preview: argsJson.length > 300 
      ? `${argsJson.slice(0, 150)}...${argsJson.slice(-150)}`
      : argsJson,
  });
  
  // Return a minimal object with error info so the tool can provide feedback
  // This helps the LLM understand what went wrong and retry with correct format
  return {
    _parseError: true,
    _errorMessage: `Failed to parse arguments for tool "${toolName}". The JSON was malformed. Please ensure arguments are valid JSON.`,
    _rawPreview: argsJson.slice(0, 100),
  };
}

/**
 * Heuristic parsing for severely malformed JSON
 * Attempts to extract key-value pairs using regex patterns
 */
function tryHeuristicParsing(
  input: string,
  toolName: string
): Record<string, unknown> | null {
  try {
    const result: Record<string, unknown> = {};
    
    // Pattern for "key": "value" or "key": value
    const stringPattern = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const numberPattern = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)/g;
    const boolPattern = /"([^"]+)"\s*:\s*(true|false)/gi;
    
    let match;
    
    // Extract string values
    while ((match = stringPattern.exec(input)) !== null) {
      result[match[1]] = match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    
    // Extract number values
    while ((match = numberPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = parseFloat(match[2]);
      }
    }
    
    // Extract boolean values
    while ((match = boolPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = match[2].toLowerCase() === 'true';
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    logger.debug('Heuristic parsing failed', { toolName, error: (e as Error).message });
    return null;
  }
}
