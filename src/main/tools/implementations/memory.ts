/**
 * Memory Tool
 * 
 * Allows the agent to store and retrieve persistent memories.
 * Memories persist across sessions and can be used to maintain
 * context about decisions, preferences, and important information.
 * 
 * Enhanced with:
 * - Automatic memory categorization
 * - Duplicate detection
 * - Memory consolidation
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import { getMemoryStorage } from '../../agent/memory';
import type { MemoryCategory, MemoryImportance } from '../../agent/memory';
import { createLogger } from '../../logger';

const logger = createLogger('memory-tool');

interface MemoryArgs extends Record<string, unknown> {
  /** Action to perform: store, retrieve, search, delete, list, recall, consolidate */
  action: 'store' | 'retrieve' | 'search' | 'delete' | 'list' | 'recall' | 'consolidate';
  /** Content to store (for store action) */
  content?: string;
  /** Memory ID (for retrieve/delete actions) */
  id?: string;
  /** Search query (for search action) */
  query?: string;
  /** Category for organization */
  category?: MemoryCategory;
  /** Importance level */
  importance?: MemoryImportance;
  /** Keywords for better retrieval */
  keywords?: string[];
  /** Whether to pin this memory (always included in context) */
  pin?: boolean;
  /** Maximum results to return */
  limit?: number;
  /** Context hint for recall action - helps find relevant memories */
  context?: string;
  /** Whether to check for duplicates before storing (default: true) */
  checkDuplicates?: boolean;
}

/**
 * Check if content is similar to existing memories (simple similarity check)
 */
function isSimilarContent(content1: string, content2: string, threshold = 0.7): boolean {
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return false;
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union >= threshold;
}

/**
 * Auto-detect category from content
 */
function autoDetectCategory(content: string): MemoryCategory {
  const lower = content.toLowerCase();
  
  if (lower.includes('prefer') || lower.includes('likes') || lower.includes('style') || lower.includes('convention')) {
    return 'preference';
  }
  if (lower.includes('decided') || lower.includes('decision') || lower.includes('chose') || lower.includes('architecture')) {
    return 'decision';
  }
  if (lower.includes('error') || lower.includes('bug') || lower.includes('fix') || lower.includes('issue')) {
    return 'error';
  }
  if (lower.includes('task') || lower.includes('todo') || lower.includes('implement') || lower.includes('working on')) {
    return 'task';
  }
  if (lower.includes('uses') || lower.includes('has') || lower.includes('is a') || lower.includes('contains')) {
    return 'fact';
  }
  if (lower.includes('context') || lower.includes('background') || lower.includes('project')) {
    return 'context';
  }
  
  return 'general';
}

export const memoryTool: ToolDefinition<MemoryArgs> = {
  name: 'memory',
  description: `Store and retrieve persistent memories across sessions.

Use this tool PROACTIVELY to:
- Remember important decisions, patterns, or context about the project and the user
- Store user preferences and coding style observations (when user corrects you or expresses preference)
- Track error patterns and their solutions
- Store facts about the codebase or project goals
- Store facts and information that will be useful in future sessions
- Maintain notes about the codebase architecture
- Pin critical information that should always be available
- Recall relevant memories based on current context
- Consolidate similar memories to reduce clutter

Actions:
- store: Save a new memory (auto-detects category if not provided, checks for duplicates)
- retrieve: Get a specific memory by ID
- search: Find memories matching a query or category
- delete: Remove a memory by ID
- list: List recent/important memories
- recall: Dynamically retrieve memories relevant to a context/topic
- consolidate: Merge similar memories in a category to reduce clutter

Categories: decision, context, preference, fact, task, error, general
Importance: low, medium, high, critical

WHEN TO STORE MEMORIES (be proactive):
- User expresses a preference ("I prefer X over Y") → store as preference
- User corrects your behavior ("Don't do X") → store as preference/decision
- Important architectural decision is made → store as decision
- You discover a pattern or fact about the codebase → store as fact
- User shares context about themselves or project → store as context
- You solve a tricky error → store as error (for future reference)

Best practices:
- Store memories that would change how you respond in future sessions
- Keep memories concise but informative (1-2 sentences)
- Pin critical memories that should always be available
- Use consolidate action periodically to merge similar memories`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',
  
  ui: {
    icon: 'brain',
    label: 'Memory',
    color: 'purple',
    runningLabel: 'Accessing memory...',
    completedLabel: 'Memory accessed',
  },

  inputExamples: [
    { action: 'store', content: 'User prefers functional components over class components', category: 'preference', importance: 'medium' },
    { action: 'store', content: 'Project uses Tailwind CSS v4 with custom CSS variables', category: 'fact', importance: 'high', pin: true },
    { action: 'store', content: 'User corrected: always ask before committing to git', category: 'preference', importance: 'critical', pin: true },
    { action: 'search', query: 'error handling', category: 'error', limit: 5 },
    { action: 'list', limit: 10 },
    { action: 'recall', context: 'working on authentication', limit: 5 },
    { action: 'consolidate', category: 'preference' },
    { action: 'retrieve', id: 'memory-id-here' },
    { action: 'delete', id: 'memory-id-here' },
  ],

  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: store, retrieve, search, delete, list, recall, consolidate',
        enum: ['store', 'retrieve', 'search', 'delete', 'list', 'recall', 'consolidate'],
      },
      content: {
        type: 'string',
        description: 'Content to store (required for store action)',
      },
      id: {
        type: 'string',
        description: 'Memory ID (required for retrieve/delete actions)',
      },
      query: {
        type: 'string',
        description: 'Search query (for search action)',
      },
      category: {
        type: 'string',
        description: 'Category: decision, context, preference, fact, task, error, general',
        enum: ['decision', 'context', 'preference', 'fact', 'task', 'error', 'general'],
      },
      importance: {
        type: 'string',
        description: 'Importance level: low, medium, high, critical',
        enum: ['low', 'medium', 'high', 'critical'],
      },
      keywords: {
        type: 'array',
        description: 'Keywords for better retrieval',
        items: { type: 'string' },
      },
      pin: {
        type: 'boolean',
        description: 'Pin this memory (always included in context)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)',
      },
      context: {
        type: 'string',
        description: 'Context hint for recall action - describes current task to find relevant memories',
      },
      checkDuplicates: {
        type: 'boolean',
        description: 'Whether to check for duplicates before storing (default: true)',
      },
    },
    required: ['action'],
  },

  async execute(args: MemoryArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { action, content, id, query, category, importance, keywords, pin, limit, checkDuplicates = true } = args;

    // Get workspace ID from context
    const workspaceId = context.workspacePath;
    if (!workspaceId) {
      return {
        toolName: 'memory',
        success: false,
        output: 'Error: No workspace selected. Memory requires an active workspace.',
      };
    }

    try {
      const storage = getMemoryStorage();

      switch (action) {
        case 'store': {
          if (!content) {
            return {
              toolName: 'memory',
              success: false,
              output: 'Error: Content is required for store action.',
            };
          }

          // Auto-detect category if not provided
          const detectedCategory = category ?? autoDetectCategory(content);
          
          // Check for duplicates if enabled
          if (checkDuplicates) {
            const existing = storage.search({
              workspaceId,
              category: detectedCategory,
              limit: 20,
            });
            
            const duplicate = existing.memories.find(m => isSimilarContent(m.content, content));
            if (duplicate) {
              // Update existing memory instead of creating duplicate
              const updated = storage.update(duplicate.id, {
                content,
                importance: importance ?? duplicate.importance,
                keywords: keywords ?? duplicate.keywords,
                isPinned: pin ?? duplicate.isPinned,
              });
              
              logger.info('Memory updated (duplicate detected)', { id: duplicate.id });
              
              return {
                toolName: 'memory',
                success: true,
                output: `Memory updated (similar memory existed).
ID: ${duplicate.id}
Category: ${updated?.category ?? detectedCategory}
Importance: ${updated?.importance ?? importance ?? 'medium'}
Pinned: ${updated?.isPinned ?? pin ?? false}`,
                metadata: { memoryId: duplicate.id, wasUpdate: true },
              };
            }
          }

          const memory = storage.create({
            content,
            category: detectedCategory,
            importance: importance ?? 'medium',
            keywords,
            workspaceId,
            sessionId: context.sessionId,
            source: 'agent',
            isPinned: pin ?? false,
          });

          logger.info('Memory stored', { id: memory.id, category: memory.category });

          return {
            toolName: 'memory',
            success: true,
            output: `Memory stored successfully.
ID: ${memory.id}
Category: ${memory.category}
Importance: ${memory.importance}
Pinned: ${memory.isPinned}
Keywords: ${memory.keywords.join(', ')}`,
            metadata: { memoryId: memory.id },
          };
        }

        case 'retrieve': {
          if (!id) {
            return {
              toolName: 'memory',
              success: false,
              output: 'Error: Memory ID is required for retrieve action.',
            };
          }

          const memory = storage.get(id);
          if (!memory) {
            return {
              toolName: 'memory',
              success: false,
              output: `Memory not found: ${id}`,
            };
          }

          return {
            toolName: 'memory',
            success: true,
            output: `Memory retrieved:
ID: ${memory.id}
Category: ${memory.category}
Importance: ${memory.importance}
Created: ${new Date(memory.createdAt).toISOString()}
Pinned: ${memory.isPinned}
Access Count: ${memory.accessCount}

Content:
${memory.content}`,
          };
        }

        case 'search': {
          const result = storage.search({
            workspaceId,
            query,
            category,
            importance,
            limit: limit ?? 10,
          });

          if (result.memories.length === 0) {
            return {
              toolName: 'memory',
              success: true,
              output: 'No memories found matching the criteria.',
            };
          }

          const memorySummaries = result.memories.map((m, i) => 
            `${i + 1}. [${m.id.slice(0, 8)}] (${m.category}/${m.importance}${m.isPinned ? '/📌' : ''})
   ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`
          ).join('\n\n');

          return {
            toolName: 'memory',
            success: true,
            output: `Found ${result.totalCount} memories (showing ${result.memories.length}):

${memorySummaries}`,
            metadata: { 
              totalCount: result.totalCount,
              returnedCount: result.memories.length,
            },
          };
        }

        case 'recall': {
          // Dynamic context-aware memory retrieval
          // Combines query from context hint with category filtering
          const contextHint = args.context || query || '';
          
          // Search with the context hint as query
          const result = storage.search({
            workspaceId,
            query: contextHint,
            category,
            importance,
            limit: limit ?? 10,
          });

          // Also get pinned memories (always relevant)
          const pinnedMemories = storage.getPinned(workspaceId);
          
          // Combine and deduplicate
          const allMemories = [...pinnedMemories];
          for (const mem of result.memories) {
            if (!allMemories.find(m => m.id === mem.id)) {
              allMemories.push(mem);
            }
          }

          // Sort by relevance: pinned first, then by importance and access count
          const sortedMemories = allMemories
            .slice(0, limit ?? 10)
            .sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              const impOrder = { critical: 4, high: 3, medium: 2, low: 1 };
              const impDiff = (impOrder[b.importance as keyof typeof impOrder] || 0) - 
                             (impOrder[a.importance as keyof typeof impOrder] || 0);
              if (impDiff !== 0) return impDiff;
              return b.accessCount - a.accessCount;
            });

          if (sortedMemories.length === 0) {
            return {
              toolName: 'memory',
              success: true,
              output: contextHint 
                ? `No memories found relevant to: "${contextHint}"`
                : 'No memories stored yet for this workspace.',
            };
          }

          const memorySummaries = sortedMemories.map((m, i) => 
            `${i + 1}. [${m.category}${m.isPinned ? '/📌' : ''}] ${m.content}`
          ).join('\n\n');

          logger.info('Memory recall', { 
            context: contextHint, 
            found: sortedMemories.length,
            pinned: pinnedMemories.length,
          });

          return {
            toolName: 'memory',
            success: true,
            output: `Recalled ${sortedMemories.length} relevant memories${contextHint ? ` for "${contextHint}"` : ''}:

${memorySummaries}`,
            metadata: { 
              totalCount: sortedMemories.length,
              pinnedCount: pinnedMemories.length,
            },
          };
        }

        case 'delete': {
          if (!id) {
            return {
              toolName: 'memory',
              success: false,
              output: 'Error: Memory ID is required for delete action.',
            };
          }

          const deleted = storage.delete(id);
          if (!deleted) {
            return {
              toolName: 'memory',
              success: false,
              output: `Memory not found: ${id}`,
            };
          }

          return {
            toolName: 'memory',
            success: true,
            output: `Memory deleted: ${id}`,
          };
        }

        case 'list': {
          const memories = storage.getRecentForContext(workspaceId, limit ?? 10);
          const stats = storage.getStats(workspaceId);

          if (memories.length === 0) {
            return {
              toolName: 'memory',
              success: true,
              output: 'No memories stored for this workspace yet.',
            };
          }

          const memorySummaries = memories.map((m, i) => 
            `${i + 1}. [${m.id.slice(0, 8)}] (${m.category}/${m.importance}${m.isPinned ? '/📌' : ''})
   ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`
          ).join('\n\n');

          return {
            toolName: 'memory',
            success: true,
            output: `Memory Statistics:
Total: ${stats.totalMemories} | Pinned: ${stats.pinnedCount}

Recent/Important Memories:

${memorySummaries}`,
            metadata: { stats },
          };
        }

        case 'consolidate': {
          // Find and merge similar memories in a category
          const targetCategory = category ?? 'general';
          const result = storage.search({
            workspaceId,
            category: targetCategory,
            limit: 50,
          });

          if (result.memories.length < 2) {
            return {
              toolName: 'memory',
              success: true,
              output: `Not enough memories in category "${targetCategory}" to consolidate.`,
            };
          }

          // Find groups of similar memories
          const groups: Array<typeof result.memories> = [];
          const processed = new Set<string>();

          for (const mem of result.memories) {
            if (processed.has(mem.id)) continue;
            
            const similar = result.memories.filter(m => 
              !processed.has(m.id) && 
              m.id !== mem.id && 
              isSimilarContent(mem.content, m.content, 0.5)
            );

            if (similar.length > 0) {
              groups.push([mem, ...similar]);
              processed.add(mem.id);
              similar.forEach(s => processed.add(s.id));
            }
          }

          if (groups.length === 0) {
            return {
              toolName: 'memory',
              success: true,
              output: `No similar memories found to consolidate in category "${targetCategory}".`,
            };
          }

          // Report what could be consolidated (don't auto-merge, let agent decide)
          const groupSummaries = groups.map((group, i) => {
            const ids = group.map(m => m.id.slice(0, 8)).join(', ');
            const contents = group.map(m => `  - ${m.content.slice(0, 80)}...`).join('\n');
            return `Group ${i + 1} (${group.length} memories, IDs: ${ids}):\n${contents}`;
          }).join('\n\n');

          return {
            toolName: 'memory',
            success: true,
            output: `Found ${groups.length} groups of similar memories in "${targetCategory}" that could be consolidated:

${groupSummaries}

To consolidate, delete the redundant memories and update the one you want to keep with combined content.`,
            metadata: { 
              groupCount: groups.length,
              totalDuplicates: groups.reduce((sum, g) => sum + g.length - 1, 0),
            },
          };
        }

        default:
          return {
            toolName: 'memory',
            success: false,
            output: `Unknown action: ${action}. Use: store, retrieve, search, delete, list, recall, or consolidate.`,
          };
      }
    } catch (error) {
      logger.error('Memory tool error', { 
        action, 
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        toolName: 'memory',
        success: false,
        output: `Memory operation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
