/**
 * Enhanced Tool Registry
 * 
 * Central registry for all tools with support for:
 * - Tool registration and lookup
 * - Schema validation
 * - UI metadata
 * - Category grouping
 * - Dynamic tool management (Phase 2)
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

    try {
      const result = await tool.execute(normalizedArgs, context);
      const completedAt = Date.now();

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
      const fileChanges = this.extractFileChanges(name, args, result);
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
   * Validate and normalize tool arguments
   * Handles common LLM errors like:
   * - String "true"/"false" instead of boolean
   * - String numbers instead of actual numbers
   * - Null/undefined for optional fields
   * - Whitespace in string values
   */
  private validateAndNormalizeArgs(
    args: Record<string, unknown>,
    schema: { type: 'object'; properties: Record<string, { type: string; description?: string }>; required?: string[] }
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(args)) {
      const propSchema = schema.properties[key];
      
      if (!propSchema) {
        // Unknown property - include as-is
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
            normalized[key] = value.toLowerCase() === 'true';
          } else {
            normalized[key] = Boolean(value);
          }
          break;
          
        case 'number':
          if (typeof value === 'string') {
            const num = parseFloat(value);
            normalized[key] = isNaN(num) ? value : num;
          } else {
            normalized[key] = value;
          }
          break;
          
        case 'string':
          if (typeof value === 'string') {
            // Trim whitespace from path-like arguments
            const pathKeys = ['path', 'filePath', 'file', 'directory', 'cwd', 'source', 'destination'];
            normalized[key] = pathKeys.includes(key) ? value.trim() : value;
          } else {
            normalized[key] = String(value);
          }
          break;
          
        case 'array':
          if (Array.isArray(value)) {
            normalized[key] = value;
          } else if (typeof value === 'string') {
            // Try to parse JSON array or split by comma
            try {
              const parsed = JSON.parse(value);
              normalized[key] = Array.isArray(parsed) ? parsed : [value];
            } catch (error) {
              const trimmed = value.trim();
              // Only log when it looks like the caller intended JSON.
              if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                logger.debug('Failed to parse JSON array argument; falling back to comma-split', {
                  key,
                  value: trimmed.slice(0, 200),
                  error: error instanceof Error ? error.message : String(error),
                });
              }
              normalized[key] = value.split(',').map(s => s.trim()).filter(Boolean);
            }
          } else {
            normalized[key] = [value];
          }
          break;
          
        case 'object':
          if (typeof value === 'string') {
            try {
              normalized[key] = JSON.parse(value);
            } catch (error) {
              const trimmed = value.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                logger.debug('Failed to parse JSON object argument; leaving as string', {
                  key,
                  value: trimmed.slice(0, 200),
                  error: error instanceof Error ? error.message : String(error),
                });
              }
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
    
    return normalized;
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
