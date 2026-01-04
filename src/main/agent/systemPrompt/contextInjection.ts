/**
 * Context Injection
 * 
 * Evaluates and applies context injection rules from user settings.
 * Rules can inject additional context based on:
 * - Always (unconditional)
 * - Workspace pattern matching
 * - Keyword detection in user message
 * - File type patterns
 */

import type { SystemPromptContext } from './types';
import type { ContextInjectionCondition } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';

/**
 * Evaluate if a context injection condition is met
 */
export function evaluateContextInjectionCondition(
  condition: ContextInjectionCondition,
  session: InternalSession,
  logger?: Logger
): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'workspace-pattern': {
      if (!condition.value) return false;
      const workspacePath = session.state.workspaceId || '';
      try {
        const regex = new RegExp(condition.value.replace(/\*/g, '.*'), 'i');
        return regex.test(workspacePath);
      } catch {
        logger?.debug('Invalid workspace-pattern regex', { pattern: condition.value });
        return workspacePath.toLowerCase().includes(condition.value.toLowerCase());
      }
    }

    case 'keyword': {
      if (!condition.value) return false;
      const lastMessage = session.state.messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';
      const keywords = condition.value.toLowerCase().split(',').map(k => k.trim());
      const messageLower = lastMessage.toLowerCase();
      return keywords.some(kw => messageLower.includes(kw));
    }

    case 'file-type': {
      if (!condition.value) return false;
      const lastMessage = session.state.messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.content || '';
      const patterns = condition.value.split(',').map(p => p.trim());
      return patterns.some(pattern => {
        try {
          const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'), 'i');
          return regex.test(lastMessage);
        } catch {
          return lastMessage.includes(pattern);
        }
      });
    }

    case 'custom':
      logger?.debug('Custom context injection conditions not supported at runtime');
      return false;

    default:
      return false;
  }
}

/**
 * Process template placeholders
 */
export function processContextRuleTemplate(
  template: string,
  session: InternalSession,
  workspace: { id: string; path: string; name?: string } | undefined,
  providerName: string,
  editorContext?: SystemPromptContext['editorContext']
): string {
  let result = template;

  result = result.replace(/\{\{workspace\}\}/g, workspace?.path ?? 'No workspace');
  result = result.replace(/\{\{session\}\}/g, session.state.id);
  result = result.replace(/\{\{provider\}\}/g, providerName);
  result = result.replace(/\{\{activeFile\}\}/g, editorContext?.activeFile || 'None');
  result = result.replace(/\{\{openFiles\}\}/g, editorContext?.openFiles.join(', ') || 'None');

  return result;
}

/**
 * Build injected context from context injection rules
 */
export function buildInjectedContext(context: SystemPromptContext): string {
  const rules = context.promptSettings.contextInjectionRules;
  if (!rules?.length) return '';

  // Filter enabled rules that match conditions, sorted by priority
  const applicableRules = rules
    .filter(rule => rule.enabled)
    .filter(rule => evaluateContextInjectionCondition(rule.condition, context.session, context.logger))
    .sort((a, b) => a.priority - b.priority);

  if (applicableRules.length === 0) return '';

  const parts: string[] = [];
  parts.push('<injected_context>');

  for (const rule of applicableRules) {
    const content = processContextRuleTemplate(
      rule.template,
      context.session,
      context.workspace,
      context.providerName,
      context.editorContext
    );
    parts.push(`  <rule name="${rule.name}" priority="${rule.priority}">`);
    parts.push(`    ${content}`);
    parts.push('  </rule>');
  }

  parts.push('</injected_context>');
  return parts.join('\n');
}
