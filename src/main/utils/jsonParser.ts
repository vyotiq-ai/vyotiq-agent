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
    const nullPattern = /"([^"]+)"\s*:\s*null/gi;
    
    // Also try unquoted keys (common LLM mistake)
    const unquotedKeyStringPattern = /(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const unquotedKeyNumberPattern = /(\w+)\s*:\s*(-?\d+(?:\.\d+)?)/g;
    const unquotedKeyBoolPattern = /(\w+)\s*:\s*(true|false)/gi;
    
    let match;
    
    // Extract string values (quoted keys)
    while ((match = stringPattern.exec(input)) !== null) {
      result[match[1]] = match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    
    // Extract string values (unquoted keys)
    while ((match = unquotedKeyStringPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    
    // Extract number values (quoted keys)
    while ((match = numberPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = parseFloat(match[2]);
      }
    }
    
    // Extract number values (unquoted keys)
    while ((match = unquotedKeyNumberPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = parseFloat(match[2]);
      }
    }
    
    // Extract boolean values (quoted keys)
    while ((match = boolPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = match[2].toLowerCase() === 'true';
      }
    }
    
    // Extract boolean values (unquoted keys)
    while ((match = unquotedKeyBoolPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = match[2].toLowerCase() === 'true';
      }
    }
    
    // Extract null values
    while ((match = nullPattern.exec(input)) !== null) {
      if (!(match[1] in result)) {
        result[match[1]] = null;
      }
    }
    
    // Try to extract arrays (common for todo tool)
    const arrayPattern = /"([^"]+)"\s*:\s*\[/g;
    while ((match = arrayPattern.exec(input)) !== null) {
      const key = match[1];
      if (!(key in result)) {
        const arrayContent = extractArrayContent(input, match.index + match[0].length - 1);
        if (arrayContent) {
          try {
            const parsed = JSON.parse(arrayContent);
            if (Array.isArray(parsed)) {
              result[key] = parsed;
            }
          } catch {
            // Try to extract array items heuristically
            const items = extractArrayItemsHeuristically(arrayContent);
            if (items.length > 0) {
              result[key] = items;
            }
          }
        }
      }
    }
    
    // Special handling for TodoWrite/todo tool - if we found todo item fields but no todos array,
    // try to construct the todos array from the individual items
    const isTodoTool = toolName.toLowerCase().includes('todo') || toolName === 'TodoWrite';
    if (isTodoTool && !result.todos && !result.todo && !result.tasks) {
      const todoItems = extractTodoItemsFromFlatKeys(result, input);
      if (todoItems.length > 0) {
        result.todos = todoItems;
        logger.info('Reconstructed todos array from flat keys', {
          tool: toolName,
          itemCount: todoItems.length,
        });
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    logger.debug('Heuristic parsing failed', { toolName, error: (e as Error).message });
    return null;
  }
}

/**
 * Extract todo items from flat keys when the array structure is broken
 * This handles cases where the LLM sends individual todo fields without proper array structure
 */
function extractTodoItemsFromFlatKeys(
  result: Record<string, unknown>,
  input: string
): Array<{ id: string; content: string; status: string }> {
  const items: Array<{ id: string; content: string; status: string }> = [];
  
  // Check if we have individual todo fields (id, content, status)
  const hasId = 'id' in result;
  const hasContent = 'content' in result || 'text' in result || 'description' in result;
  const hasStatus = 'status' in result;
  
  if (hasId && hasContent && hasStatus) {
    // Single todo item case
    items.push({
      id: String(result.id || `todo-${Date.now()}`),
      content: String(result.content || result.text || result.description || ''),
      status: String(result.status || 'pending'),
    });
    
    // Remove the flat keys since we've moved them to the array
    delete result.id;
    delete result.content;
    delete result.text;
    delete result.description;
    delete result.status;
  }
  
  // Try to find multiple todo objects in the raw input
  // Pattern: objects with id, content, status fields
  const todoObjectPattern = /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"\s*,\s*"status"\s*:\s*"([^"]+)"/g;
  let match;
  
  while ((match = todoObjectPattern.exec(input)) !== null) {
    const [, id, content, status] = match;
    // Avoid duplicates
    if (!items.some(item => item.id === id)) {
      items.push({ id, content, status });
    }
  }
  
  // Also try alternative field order
  const altPattern = /\{\s*"content"\s*:\s*"([^"]+)"\s*,\s*"id"\s*:\s*"([^"]+)"\s*,\s*"status"\s*:\s*"([^"]+)"/g;
  while ((match = altPattern.exec(input)) !== null) {
    const [, content, id, status] = match;
    if (!items.some(item => item.id === id)) {
      items.push({ id, content, status });
    }
  }
  
  // Try yet another order (status first)
  const statusFirstPattern = /\{\s*"status"\s*:\s*"([^"]+)"\s*,\s*"id"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"/g;
  while ((match = statusFirstPattern.exec(input)) !== null) {
    const [, status, id, content] = match;
    if (!items.some(item => item.id === id)) {
      items.push({ id, content, status });
    }
  }
  
  return items;
}

/**
 * Extract array content from a string starting at the opening bracket
 */
function extractArrayContent(input: string, startIndex: number): string | null {
  if (input[startIndex] !== '[') return null;
  
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = startIndex; i < input.length; i++) {
    const char = input[i];
    
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
    
    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) {
        return input.slice(startIndex, i + 1);
      }
    }
  }
  
  // Try to close unclosed array
  const partial = input.slice(startIndex);
  // Count unclosed brackets
  let unclosedBrackets = 0;
  let unclosedBraces = 0;
  inString = false;
  escaped = false;
  
  for (const char of partial) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '[') unclosedBrackets++;
    if (char === ']') unclosedBrackets--;
    if (char === '{') unclosedBraces++;
    if (char === '}') unclosedBraces--;
  }
  
  // Try to repair by closing brackets
  let repaired = partial;
  while (unclosedBraces > 0) { repaired += '}'; unclosedBraces--; }
  while (unclosedBrackets > 0) { repaired += ']'; unclosedBrackets--; }
  
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

/**
 * Extract array items heuristically when JSON parsing fails
 */
function extractArrayItemsHeuristically(arrayContent: string): unknown[] {
  const items: unknown[] = [];
  
  // Try to find object patterns within the array
  const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  
  while ((match = objectPattern.exec(arrayContent)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      items.push(obj);
    } catch {
      // Try to repair the object
      const repaired = attemptObjectRepair(match[0]);
      if (repaired) {
        try {
          items.push(JSON.parse(repaired));
        } catch {
          // Skip this item
        }
      }
    }
  }
  
  return items;
}

/**
 * Attempt to repair a malformed JSON object
 */
function attemptObjectRepair(input: string): string | null {
  let repaired = input.trim();
  
  // Remove trailing commas
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  
  // Ensure proper closing
  if (!repaired.endsWith('}')) {
    // Count braces
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    
    for (const char of repaired) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    // Close unclosed braces
    while (braceCount > 0) {
      repaired += '}';
      braceCount--;
    }
  }
  
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}
