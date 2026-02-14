/**
 * Shared Types - Barrel Export
 * 
 * Provides organized domain-specific imports while maintaining 
 * backward compatibility with the monolith `shared/types.ts`.
 * 
 * Usage:
 *   import type { AppearanceSettings } from '../shared/types/appearance';  // Domain-specific
 *   import type { GitRepoStatus } from '../shared/types/git';             // Domain-specific
 *   import type { ChatMessage } from '../shared/types';                    // Legacy (still works)
 */

// Domain-specific modules (extracted from types.ts)
export * from './accessLevel';
export * from './appearance';
export * from './communication';
export * from './git';
export * from './lsp';
export * from './metrics';
export * from './prompt';
export * from './taskPlanning';
export * from './taskRouting';
export * from './tools';

// Previously split modules
export * from './mcp';
export * from './todo';
export * from './todoTask';
