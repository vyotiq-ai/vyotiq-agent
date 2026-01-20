/**
 * System Prompt Builder
 * 
 * Builds the complete system prompt by combining:
 * - Unified static prompt (identity, rules, tools, workflows - single priority)
 * - Dynamic context sections (workspace, editor, terminal)
 * - User customizations (persona, custom prompt)
 * 
 * Structure follows optimal LLM comprehension order:
 * 1. Unified system prompt (who you are, what you do, how you do it)
 * 2. Context (workspace, session, system)
 * 3. Customizations (persona, style)
 */

import type { SystemPromptContext } from './types';
import { getSystemPromptCache } from './cache';
import {
  buildCoreContext,
  buildTerminalContext,
  buildToolsReference,
  buildEditorContext,
  buildWorkspaceDiagnostics,
  buildTaskAnalysis,
  buildWorkspaceStructure,
  buildAccessLevel,
  buildPersona,
  buildCustomPrompt,
  buildAdditionalInstructions,
  buildCommunicationStyle,
  buildToolCategories,
} from './dynamicSections';
import { buildInjectedContext } from './contextInjection';

// Re-export types
export type { SystemPromptContext } from './types';

/**
 * Build the complete system prompt
 * 
 * Uses caching for the unified static prompt and builds dynamic sections per-request.
 */
export function buildSystemPrompt(context: SystemPromptContext): string {
  const { promptSettings, accessLevelSettings, logger } = context;
  const cache = getSystemPromptCache();

  // Log for debugging
  if (process.env.NODE_ENV === 'development') {
    logger?.debug('[buildSystemPrompt] Building prompt', {
      activePersonaId: promptSettings.activePersonaId,
      useCustomSystemPrompt: promptSettings.useCustomSystemPrompt,
      accessLevel: accessLevelSettings?.level,
      cacheValid: cache.isValid(),
    });
  }

  // Build dynamic sections
  const dynamicSections = [
    // Context sections
    buildCoreContext(context),
    buildWorkspaceStructure(context.workspaceStructure),
    buildTaskAnalysis(context.taskAnalysis),
    buildAccessLevel(accessLevelSettings),
    buildToolsReference(context.toolDefinitions),
    buildToolCategories(),

    // Terminal and editor context
    buildTerminalContext(context.terminalContext),
    buildEditorContext(context.editorContext),
    buildWorkspaceDiagnostics(context.workspaceDiagnostics),

    // User customizations
    buildPersona(promptSettings),
    buildCustomPrompt(promptSettings),
    buildCommunicationStyle(promptSettings.responseFormat),
    buildAdditionalInstructions(promptSettings.additionalInstructions),

    // Injected context from rules
    buildInjectedContext(context),
  ].filter(Boolean);

  // Assemble: Unified Static Prompt + Dynamic
  const staticContent = cache.getStaticPrompt().staticContent;
  const dynamicContent = dynamicSections.join('\n\n');

  // Final assembly
  const parts = [staticContent];
  if (dynamicContent) parts.push(dynamicContent);

  const systemPrompt = parts.join('\n\n');

  logger?.debug('[buildSystemPrompt] Prompt built', {
    staticTokens: cache.getEstimatedTokens(),
    totalLength: systemPrompt.length,
    estimatedTokens: Math.ceil(systemPrompt.length / 4),
  });

  return systemPrompt;
}
