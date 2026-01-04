/**
 * System Prompt Builder
 * 
 * Builds the complete system prompt by combining:
 * - Cached static sections (identity, rules, workflows)
 * - Dynamic context sections (workspace, editor, terminal)
 * - User customizations (persona, custom prompt)
 * 
 * Structure follows optimal LLM comprehension order:
 * 1. Identity (who you are)
 * 2. Critical rules (what you MUST do)
 * 3. Context (workspace, session, system)
 * 4. Tools and workflows
 * 5. Customizations (persona, style)
 * 6. Reminders (recency effect)
 */

import type { SystemPromptContext } from './types';
import { getSystemPromptCache } from './cache';
import { PROMPT_SECTIONS } from './sections';
import {
  buildCoreContext,
  buildTerminalContext,
  buildEditorContext,
  buildWorkspaceDiagnostics,
  buildTaskAnalysis,
  buildWorkspaceStructure,
  buildAccessLevel,
  buildPersona,
  buildCustomPrompt,
  buildAdditionalInstructions,
  buildCommunicationStyle,
} from './dynamicSections';
import { buildInjectedContext } from './contextInjection';

// Re-export types
export type { SystemPromptContext } from './types';

/**
 * Build the complete system prompt
 * 
 * Uses caching for static sections and builds dynamic sections per-request.
 * Sections are ordered for optimal LLM comprehension with critical
 * reminders at the end (recency effect).
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
    // Context sections (priority 3-6)
    buildCoreContext(context),
    buildWorkspaceStructure(context.workspaceStructure),
    buildTaskAnalysis(context.taskAnalysis),
    buildAccessLevel(accessLevelSettings),
    
    // Terminal and editor context
    buildTerminalContext(context.terminalContext),
    buildEditorContext(context.editorContext),
    buildWorkspaceDiagnostics(context.workspaceDiagnostics),
    
    // User customizations (priority 11-14)
    buildPersona(promptSettings),
    buildCustomPrompt(promptSettings),
    buildCommunicationStyle(promptSettings.responseFormat),
    buildAdditionalInstructions(promptSettings.additionalInstructions),
    
    // Injected context from rules
    buildInjectedContext(context),
  ].filter(Boolean);

  // Assemble: Static (cached) + Dynamic + Reminders
  const staticContent = cache.getStaticPrompt().staticContent;
  const dynamicContent = dynamicSections.join('\n\n');
  const reminders = [
    PROMPT_SECTIONS.REMINDERS.content,
    PROMPT_SECTIONS.FINAL_REMINDER.content,
  ].join('\n\n');

  // Final assembly
  const parts = [staticContent];
  if (dynamicContent) parts.push(dynamicContent);
  parts.push(reminders);

  const systemPrompt = parts.join('\n\n');

  logger?.debug('[buildSystemPrompt] Prompt built', {
    staticTokens: cache.getEstimatedTokens(),
    totalLength: systemPrompt.length,
    estimatedTokens: Math.ceil(systemPrompt.length / 4),
  });

  return systemPrompt;
}
