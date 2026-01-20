/**
 * Enhanced Tool Registry
 * 
 * Central registry for all tools with support for:
 * - Tool registration and lookup
 * - Schema validation
 * - UI metadata
 * - Category grouping
 * - Dynamic tool management (Phase 2)
 * - Automatic result caching for idempotent tools
 */
import type { ToolExecutionResult, ToolSpecification, DynamicToolState } from '../../../shared/types';
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistryEntry,
  ToolCategory,
  ToolUIMetadata,
  EnhancedToolResult,
} from '../types';
import { getToolUIConfig, getToolCategory, DEFAULT_TOOL_UI } from '../types/toolUIConfig';
import { createLogger } from '../../logger';
import { getToolResultCache } from '../../agent/cache/ToolResultCache';
import { getToolExecutionLogger } from '../../agent/logging/ToolExecutionLogger';

const logger = createLogger('ToolRegistry');

/**
 * Dynamic tool entry - tracks spec and state alongside definition
 */
export interface DynamicToolEntry {
  definition: ToolDefinition;
  spec: ToolSpecification;
  state: DynamicToolState;
}

export class ToolRegistry {
  private tools = new Map<string, ToolRegistryEntry>();
  private aliases = new Map<string, string>(); // Map aliases to canonical names
  private dynamicTools = new Map<string, DynamicToolEntry>(); // Phase 2: Dynamic tools

  /**
   * Register a tool with the registry
   */
  register(tool: ToolDefinition): void {
    const category = tool.category || getToolCategory(tool.name);
    const metadata = tool.ui || getToolUIConfig(tool.name);

    this.tools.set(tool.name, {
      definition: tool,
      category,
      metadata,
    });
  }

  /**
   * Register a dynamic tool (Phase 2)
   */
  registerDynamic(
    tool: ToolDefinition,
    spec: ToolSpecification,
    state: DynamicToolState
  ): void {
    // Register in main tools map
    this.register(tool);

    // Track as dynamic
    this.dynamicTools.set(tool.name, {
      definition: tool,
      spec,
      state,
    });

    logger.info('Dynamic tool registered', { name: tool.name, id: spec.id });
  }

  /**
   * Unregister a dynamic tool (Phase 2)
   */
  unregisterDynamic(name: string): boolean {
    // Only allow unregistering dynamic tools
    if (!this.dynamicTools.has(name)) {
      logger.warn('Cannot unregister non-dynamic tool', { name });
      return false;
    }

    this.tools.delete(name);
    this.dynamicTools.delete(name);
    
    // Remove any aliases
    for (const [alias, canonical] of this.aliases) {
      if (canonical === name) {
        this.aliases.delete(alias);
      }
    }

    logger.info('Dynamic tool unregistered', { name });
    return true;
  }

  /**
   * List all dynamic tools (Phase 2)
   */
  listDynamic(): DynamicToolEntry[] {
    return Array.from(this.dynamicTools.values());
  }

  /**
   * Check if a tool is dynamic (Phase 2)
   */
  isDynamic(name: string): boolean {
    const canonicalName = this.aliases.get(name) || name;
    return this.dynamicTools.has(canonicalName);
  }

  /**
   * Get dynamic tool entry (Phase 2)
   */
  getDynamicEntry(name: string): DynamicToolEntry | undefined {
    const canonicalName = this.aliases.get(name) || name;
    return this.dynamicTools.get(canonicalName);
  }

  /**
   * Update dynamic tool state (Phase 2)
   */
  updateDynamicState(name: string, updates: Partial<DynamicToolState>): boolean {
    const entry = this.dynamicTools.get(name);
    if (!entry) return false;

    entry.state = { ...entry.state, ...updates };
    return true;
  }

  /**
   * Register an alias for a tool name
   */
  registerAlias(alias: string, canonicalName: string): void {
    if (this.tools.has(canonicalName)) {
      this.aliases.set(alias, canonicalName);
    }
  }

  /**
   * Get a tool definition by name (supports aliases)
   */
  getDefinition(name: string): ToolDefinition | undefined {
    const canonicalName = this.aliases.get(name) || name;
    return this.tools.get(canonicalName)?.definition;
  }

  /**
   * Get full registry entry by name
   */
  getEntry(name: string): ToolRegistryEntry | undefined {
    const canonicalName = this.aliases.get(name) || name;
    return this.tools.get(canonicalName);
  }

  /**
   * Resolve a tool name to its canonical form
   * Returns the canonical tool name if alias exists, or undefined if tool doesn't exist
   */
  resolveToolName(name: string): string | undefined {
    const canonicalName = this.aliases.get(name) || name;
    return this.tools.has(canonicalName) ? canonicalName : undefined;
  }

  /**
   * Resolve multiple tool names to their canonical forms
   * Filters out tools that don't exist
   */
  resolveToolNames(names: string[]): string[] {
    return names
      .map(name => this.resolveToolName(name))
      .filter((name): name is string => name !== undefined);
  }

  /**
   * Get UI metadata for a tool
   */
  getUIMetadata(name: string): ToolUIMetadata {
    const entry = this.getEntry(name);
    return entry?.metadata || DEFAULT_TOOL_UI;
  }

  /**
   * Get all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition);
  }

  /**
   * Get tools by category
   */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((entry) => entry.category === category)
      .map((entry) => entry.definition);
  }

  /**
   * Get tools as schema for LLM
   * Includes inputExamples when available for improved accuracy
   */
  getSchemaForLLM(): Array<{ 
    name: string; 
    description: string; 
    schema: Record<string, unknown>;
    inputExamples?: Array<Record<string, unknown>>;
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema as unknown as Record<string, unknown>,
      // Include input examples if available (Anthropic research: 72% -> 90% accuracy)
      ...(tool.inputExamples ? { inputExamples: tool.inputExamples as Array<Record<string, unknown>> } : {}),
    }));
  }

  /**
   * Get tools filtered by allowed callers
   * Use this to get tools available for programmatic execution
   */
  getToolsForCaller(caller: 'direct' | 'code_execution'): ToolDefinition[] {
    return this.list().filter(tool => {
      const allowedCallers = tool.allowedCallers ?? ['direct'];
      return allowedCallers.includes(caller);
    });
  }

  /**
   * Get deferred tools (not loaded by default)
   */
  getDeferredTools(): ToolDefinition[] {
    return this.list().filter(tool => tool.deferLoading === true);
  }

  /**
   * Get always-loaded tools (not deferred)
   */
  getAlwaysLoadedTools(): ToolDefinition[] {
    return this.list().filter(tool => tool.deferLoading !== true);
  }

  /**
   * Search for tools by keyword (for tool search functionality)
   */
  searchTools(query: string): ToolDefinition[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    
    return this.list()
      .map(tool => {
        let score = 0;
        
        // Check name match
        if (tool.name.toLowerCase().includes(queryLower)) {
          score += 10;
        }
        
        // Check description match
        const descLower = tool.description.toLowerCase();
        for (const word of queryWords) {
          if (descLower.includes(word)) {
            score += 2;
          }
        }
        
        // Check search keywords
        if (tool.searchKeywords) {
          for (const keyword of tool.searchKeywords) {
            if (keyword.toLowerCase().includes(queryLower) || queryLower.includes(keyword.toLowerCase())) {
              score += 5;
            }
            for (const word of queryWords) {
              if (keyword.toLowerCase().includes(word)) {
                score += 1;
              }
            }
          }
        }
        
        return { tool, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ tool }) => tool);
  }

  /**
   * Check if a tool has dangerous patterns that always require confirmation
   */
  matchesAlwaysConfirmPattern(toolName: string, args: Record<string, unknown>): boolean {
    const tool = this.getDefinition(toolName);
    if (!tool?.alwaysConfirmPatterns) return false;
    
    // Check command argument for terminal tools
    const command = args.command as string | undefined;
    if (command) {
      for (const pattern of tool.alwaysConfirmPatterns) {
        if (pattern.test(command)) {
          return true;
        }
      }
    }
    
    // Check path for file tools
    const path = (args.path || args.filePath) as string | undefined;
    if (path) {
      for (const pattern of tool.alwaysConfirmPatterns) {
        if (pattern.test(path)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    const canonicalName = this.aliases.get(name) || name;
    return this.tools.has(canonicalName);
  }

  /**
   * Check if tool requires approval
   */
  requiresApproval(name: string): boolean {
    const definition = this.getDefinition(name);
    return definition?.requiresApproval ?? true;
  }

  /**
   * Execute a tool and return enhanced result
   * Automatically caches results for idempotent tools
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<EnhancedToolResult> {
    const startedAt = Date.now();
    const tool = this.getDefinition(name);

    if (!tool) {
      return {
        toolName: name,
        success: false,
        output: `Tool "${name}" is not registered.`,
        timing: {
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
        },
      };
    }

    // Validate and normalize arguments before execution
    const normalizedArgs = this.validateAndNormalizeArgs(args, tool.schema);

    // Log argument normalization at debug level if changes were made
    const toolExecutionLogger = getToolExecutionLogger();
    toolExecutionLogger.logNormalization(name, args, normalizedArgs);

    // Check cache for idempotent tools
    const cache = getToolResultCache();
    const cachedResult = cache.get(name, normalizedArgs);
    
    if (cachedResult) {
      const completedAt = Date.now();
      const estimatedTokensSaved = Math.ceil(cachedResult.output.length / 4);
      
      logger.debug('Cache hit for tool execution', {
        tool: name,
        estimatedTokensSaved,
        cacheStats: cache.getStats(),
      });

      // Return cached result with cache metadata
      const enhanced: EnhancedToolResult = {
        ...cachedResult,
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
        metadata: {
          ...cachedResult.metadata,
          fromCache: true,
          estimatedTokensSaved,
        },
      };

      // Generate preview for UI
      enhanced.preview = this.generatePreview(cachedResult.output, name);

      return enhanced;
    }

    try {
      const result = await tool.execute(normalizedArgs, context);
      const completedAt = Date.now();

      // Cache successful results for idempotent tools
      if (result.success && cache.isCacheable(name)) {
        cache.set(name, normalizedArgs, result, context.sessionId);
        logger.debug('Cached tool result', {
          tool: name,
          outputLength: result.output.length,
          sessionId: context.sessionId,
        });
      }

      // Invalidate cache for write operations
      this.invalidateCacheForWriteOperation(name, normalizedArgs, result);

      // Enhance result with timing and additional metadata
      const enhanced: EnhancedToolResult = {
        ...result,
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
      };

      // Add file change info for file operations
      const fileChanges = this.extractFileChanges(name, normalizedArgs, result);
      if (fileChanges.length > 0) {
        enhanced.fileChanges = fileChanges;
      }

      // Generate preview for UI
      enhanced.preview = this.generatePreview(result.output, name);

      return enhanced;
    } catch (error) {
      const completedAt = Date.now();
      return {
        toolName: name,
        success: false,
        output: (error as Error).message,
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
      };
    }
  }

  /**
   * Invalidate cache entries when write operations modify files
   */
  private invalidateCacheForWriteOperation(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult
  ): void {
    // Only invalidate on successful write operations
    if (!result.success) return;

    const writeTools = ['write', 'create_file', 'edit', 'replace_string_in_file', 'bulk'];
    if (!writeTools.includes(toolName)) return;

    const cache = getToolResultCache();
    const filePath = (args.path || args.filePath) as string | undefined;

    if (filePath) {
      const invalidated = cache.invalidatePath(filePath);
      if (invalidated > 0) {
        logger.debug('Invalidated cache entries for modified file', {
          tool: toolName,
          path: filePath,
          invalidatedCount: invalidated,
        });
      }
    }

    // For bulk operations, invalidate all affected paths
    if (toolName === 'bulk' && Array.isArray(args.operations)) {
      for (const op of args.operations as Array<{ path?: string; source?: string; destination?: string }>) {
        if (op.path) cache.invalidatePath(op.path);
        if (op.source) cache.invalidatePath(op.source);
        if (op.destination) cache.invalidatePath(op.destination);
      }
    }
  }

  /**
   * Validate and normalize tool arguments
   * Handles common LLM errors like:
   * - String "true"/"false" instead of boolean
   * - String numbers instead of actual numbers
   * - Null/undefined for optional fields
   * - Whitespace in string values
   * - Nested object/array parsing
   * - Common typos in argument names (schema-aware alias mapping)
   */
  private validateAndNormalizeArgs(
    args: Record<string, unknown>,
    schema: { type: 'object'; properties: Record<string, { type: string; description?: string }>; required?: string[] }
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    
    // Common argument name aliases for LLM compatibility
    // Maps alias -> array of possible canonical names (in priority order)
    // The first canonical name that exists in the schema will be used
    const argAliasGroups: Record<string, string[]> = {
      // Path-related aliases
      'file_path': ['file_path', 'path', 'filePath'],
      'filepath': ['file_path', 'path', 'filePath'],
      'filePath': ['file_path', 'path', 'filePath'],
      'file': ['file_path', 'path', 'file'],
      'filename': ['file_path', 'path', 'filename'],
      'target_file': ['file_path', 'path', 'target_file'],
      'source_file': ['source', 'file_path', 'path'],
      
      // String replacement aliases (for edit tools)
      'oldString': ['old_string', 'oldString', 'search'],
      'old_str': ['old_string', 'old_str', 'search'],
      'newString': ['new_string', 'newString', 'replace'],
      'new_str': ['new_string', 'new_str', 'replace'],
      'search': ['old_string', 'search', 'pattern', 'query'],
      'find': ['old_string', 'search', 'find', 'pattern'],
      'replace': ['new_string', 'replace', 'replacement'],
      'replacement': ['new_string', 'replace', 'replacement'],
      
      // Command/terminal aliases
      'cmd': ['command', 'cmd'],
      'shell_command': ['command', 'shell_command'],
      
      // Directory aliases
      'dir': ['directory', 'path', 'dir'],
      'cwd': ['directory', 'cwd', 'path'],
      'working_dir': ['directory', 'working_dir', 'cwd'],
      'workingDirectory': ['directory', 'workingDirectory', 'cwd'],
      'folder': ['directory', 'path', 'folder'],
      
      // Content aliases
      'text': ['content', 'text', 'body'],
      'body': ['content', 'body', 'text'],
      'data': ['content', 'data', 'body'],
      'contents': ['content', 'contents', 'text'],
      
      // Pattern/regex aliases
      'regex': ['pattern', 'regex', 'regexp'],
      'regexp': ['pattern', 'regexp', 'regex'],
      'search_pattern': ['pattern', 'search_pattern', 'query'],
      'query': ['pattern', 'query', 'search'],
      
      // Boolean option aliases
      'recursive': ['includeSubdirs', 'recursive', 'recurse'],
      'recurse': ['includeSubdirs', 'recurse', 'recursive'],
      'replaceAll': ['replace_all', 'replaceAll'],
      'replace_all_occurrences': ['replace_all', 'replace_all_occurrences'],
      
      // Numeric option aliases
      'max_depth': ['maxDepth', 'max_depth', 'depth'],
      'maxdepth': ['maxDepth', 'maxdepth', 'depth'],
      'timeout_ms': ['timeout', 'timeout_ms', 'timeoutMs'],
      'timeoutMs': ['timeout', 'timeoutMs', 'timeout_ms'],
      'line_number': ['line', 'line_number', 'lineNumber'],
      'lineNumber': ['line', 'lineNumber', 'line_number'],
      'start_line': ['offset', 'start_line', 'startLine'],
      'startLine': ['offset', 'startLine', 'start_line'],
      'end_line': ['limit', 'end_line', 'endLine'],
      'endLine': ['limit', 'endLine', 'end_line'],
    };
    
    // Get the set of properties defined in the schema
    const schemaProperties = new Set(Object.keys(schema.properties));
    
    // First pass: normalize argument names using schema-aware aliases
    const aliasedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      // Check if this key has aliases defined
      const possibleTargets = argAliasGroups[key];
      
      if (possibleTargets) {
        // Find the first target that exists in the schema
        const targetKey = possibleTargets.find(target => schemaProperties.has(target)) || key;
        
        // Only apply alias if target doesn't already have a value
        if (!(targetKey in aliasedArgs)) {
          if (targetKey !== key) {
            logger.debug('Argument alias applied', {
              original: key,
              normalized: targetKey,
              schemaHasTarget: schemaProperties.has(targetKey),
            });
          }
          aliasedArgs[targetKey] = value;
        }
      } else {
        // No alias defined, use key as-is
        if (!(key in aliasedArgs)) {
          aliasedArgs[key] = value;
        }
      }
    }
    
    for (const [key, value] of Object.entries(aliasedArgs)) {
      const propSchema = schema.properties[key];
      
      if (!propSchema) {
        // Unknown property - include as-is but log for debugging
        normalized[key] = value;
        continue;
      }
      
      // Skip null/undefined for optional fields
      if (value === null || value === undefined) {
        if (!schema.required?.includes(key)) {
          continue;
        }
        normalized[key] = value;
        continue;
      }
      
      // Type coercion based on schema
      switch (propSchema.type) {
        case 'boolean':
          if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            normalized[key] = lower === 'true' || lower === '1' || lower === 'yes';
          } else if (typeof value === 'number') {
            normalized[key] = value !== 0;
          } else {
            normalized[key] = Boolean(value);
          }
          break;
          
        case 'number':
          if (typeof value === 'string') {
            const trimmed = value.trim();
            const num = parseFloat(trimmed);
            normalized[key] = isNaN(num) ? value : num;
          } else {
            normalized[key] = value;
          }
          break;
          
        case 'string':
          if (typeof value === 'string') {
            // Trim whitespace from path-like arguments
            // This handles common LLM errors where paths have leading/trailing whitespace
            const pathKeys = [
              'path', 'file_path', 'filePath', 'file', 'filename',
              'directory', 'dir', 'cwd', 'folder',
              'source', 'destination', 'target',
              'working_dir', 'workingDirectory',
              'source_file', 'target_file'
            ];
            if (pathKeys.includes(key)) {
              const trimmed = value.trim();
              if (trimmed !== value) {
                logger.debug('Whitespace trimmed from path argument', {
                  key,
                  original: JSON.stringify(value),
                  trimmed: JSON.stringify(trimmed),
                });
              }
              normalized[key] = trimmed;
            } else {
              normalized[key] = value;
            }
          } else if (value === null || value === undefined) {
            normalized[key] = '';
          } else {
            normalized[key] = String(value);
          }
          break;
          
        case 'array':
          if (Array.isArray(value)) {
            normalized[key] = value;
          } else if (typeof value === 'string') {
            const trimmed = value.trim();
            // Try to parse JSON array first
            if (trimmed.startsWith('[')) {
              try {
                const parsed = JSON.parse(trimmed);
                normalized[key] = Array.isArray(parsed) ? parsed : [value];
                logger.debug('Successfully parsed JSON array argument', {
                  key,
                  itemCount: Array.isArray(parsed) ? parsed.length : 1,
                });
              } catch (error) {
                logger.debug('Failed to parse JSON array argument; attempting recovery', {
                  key,
                  value: trimmed.slice(0, 200),
                  error: error instanceof Error ? error.message : String(error),
                });
                // Try to extract array items heuristically
                const items = this.extractArrayItemsFromString(trimmed);
                normalized[key] = items.length > 0 ? items : [value];
              }
            } else if (trimmed.startsWith('{')) {
              // Single object provided as string - wrap in array
              try {
                const parsed = JSON.parse(trimmed);
                normalized[key] = [parsed];
                logger.debug('Wrapped single JSON object in array', { key });
              } catch {
                // Not valid JSON, split by delimiter
                normalized[key] = value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
              }
            } else {
              // Split by comma, newline, or semicolon
              normalized[key] = value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
            }
          } else if (typeof value === 'object' && value !== null) {
            // Single object provided - wrap in array
            normalized[key] = [value];
          } else {
            normalized[key] = [value];
          }
          break;
          
        case 'object':
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            normalized[key] = value;
          } else if (Array.isArray(value)) {
            // Array provided for object type - keep as-is (might be intentional)
            normalized[key] = value;
            logger.debug('Array provided for object parameter', { key });
          } else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                normalized[key] = JSON.parse(trimmed);
                logger.debug('Successfully parsed JSON object argument', {
                  key,
                  type: trimmed.startsWith('{') ? 'object' : 'array',
                });
              } catch (error) {
                logger.debug('Failed to parse JSON object argument; leaving as string', {
                  key,
                  value: trimmed.slice(0, 200),
                  error: error instanceof Error ? error.message : String(error),
                });
                // Try to recover malformed JSON
                const recovered = this.tryRecoverMalformedJson(trimmed);
                if (recovered !== null) {
                  normalized[key] = recovered;
                  logger.debug('Recovered malformed JSON object argument', { key });
                } else {
                  normalized[key] = value;
                }
              }
            } else {
              normalized[key] = value;
            }
          } else {
            normalized[key] = value;
          }
          break;
          
        default:
          normalized[key] = value;
      }
    }
    
    // Validate required fields and provide helpful error messages
    if (schema.required) {
      const missingRequired = schema.required.filter(key => !(key in normalized) || normalized[key] === undefined);
      if (missingRequired.length > 0) {
        logger.warn('Missing required arguments', {
          missing: missingRequired,
          provided: Object.keys(normalized),
          schemaRequired: schema.required,
        });
      }
    }
    
    return normalized;
  }

  /**
   * Extract array items from a malformed array string
   */
  private extractArrayItemsFromString(input: string): unknown[] {
    const items: unknown[] = [];
    
    // Try to find string items: "item1", "item2"
    const stringPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match;
    while ((match = stringPattern.exec(input)) !== null) {
      items.push(match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
    }
    
    // If no string items found, try to find object items
    if (items.length === 0) {
      const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      while ((match = objectPattern.exec(input)) !== null) {
        try {
          items.push(JSON.parse(match[0]));
        } catch {
          // Skip malformed objects
        }
      }
    }
    
    return items;
  }

  /**
   * Try to recover malformed JSON by fixing common issues
   * Returns null if recovery is not possible
   */
  private tryRecoverMalformedJson(input: string): unknown | null {
    // Try common fixes for malformed JSON
    let fixed = input;
    
    // Fix 1: Remove trailing commas before closing brackets
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
    
    // Fix 2: Add missing quotes around unquoted keys
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix 3: Replace single quotes with double quotes (common mistake)
    // Only do this if there are no double quotes in the string
    if (!fixed.includes('"') && fixed.includes("'")) {
      fixed = fixed.replace(/'/g, '"');
    }
    
    try {
      return JSON.parse(fixed);
    } catch {
      // Recovery failed
      return null;
    }
  }

  /**
   * Extract file change information from tool execution
   */
  private extractFileChanges(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult
  ): Array<{ path: string; action: 'created' | 'modified' | 'deleted' | 'read' }> {
    const changes: Array<{ path: string; action: 'created' | 'modified' | 'deleted' | 'read' }> = [];
    const filePath = (args.path || args.filePath) as string | undefined;

    if (!filePath) return changes;

    switch (toolName) {
      case 'read':
      case 'read_file':
        if (result.success) {
          changes.push({ path: filePath, action: 'read' });
        }
        break;
      case 'write':
      case 'create_file':
        if (result.success) {
          changes.push({ path: filePath, action: 'created' });
        }
        break;
      case 'edit':
      case 'replace_string_in_file':
        if (result.success) {
          changes.push({ path: filePath, action: 'modified' });
        }
        break;
    }

    return changes;
  }

  /**
   * Generate a preview of the output for UI display
   */
  private generatePreview(output: string, toolName: string): string {
    if (!output) return '';

    const maxLength = 200;

    // For list operations, show file count
    if (toolName === 'ls' || toolName === 'list_dir' || toolName === 'list_directory') {
      const lines = output.split('\n').filter(Boolean);
      if (lines.length > 5) {
        return `${lines.length} items`;
      }
      return output.slice(0, maxLength);
    }

    // For search operations, show match count
    if (toolName === 'grep' || toolName === 'search') {
      const matches = output.match(/>/g);
      if (matches) {
        return `${matches.length} matches`;
      }
    }

    // For terminal commands, truncate output
    if (toolName === 'run' || toolName === 'run_terminal_command') {
      if (output.length > maxLength) {
        return output.slice(0, maxLength) + '...';
      }
    }

    return output.length > maxLength ? output.slice(0, maxLength) + '...' : output;
  }
}
