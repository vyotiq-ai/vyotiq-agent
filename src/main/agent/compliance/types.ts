/**
 * Compliance Module Types
 * 
 * Type definitions for the LLM compliance validation system.
 * This module provides runtime enforcement of system prompt rules.
 */

// Re-export ComplianceSettings from shared types as ComplianceConfig for internal use
import { 
  type ComplianceSettings, 
  DEFAULT_COMPLIANCE_SETTINGS 
} from '../../../shared/types';

// Alias for backward compatibility within the compliance module
export type ComplianceConfig = ComplianceSettings;
export const DEFAULT_COMPLIANCE_CONFIG = DEFAULT_COMPLIANCE_SETTINGS;

/**
 * Types of compliance violations that can be detected
 */
export type ComplianceViolationType =
  | 'file-not-read-before-edit'      // Editing a file without reading it first
  | 'no-lint-check-after-edit'       // Not running read_lints after editing
  | 'unnecessary-file-creation'      // Creating files when editing would suffice
  | 'excessive-changes'              // Making more changes than requested
  | 'path-format-error'              // Using incorrect path format
  | 'edit-string-mismatch'           // old_string doesn't match file content
  | 'missing-context-in-edit'        // Not enough context in old_string
  | 'tool-misuse'                    // Using tool incorrectly
  | 'rule-violation';                // Generic rule violation

/**
 * Severity levels for compliance issues
 */
export type ComplianceSeverity = 'error' | 'warning' | 'suggestion';

/**
 * A single compliance violation
 */
export interface ComplianceViolation {
  /** Unique identifier for this violation */
  id: string;
  /** Type of violation */
  type: ComplianceViolationType;
  /** Severity level */
  severity: ComplianceSeverity;
  /** Human-readable description */
  message: string;
  /** The rule that was violated */
  rule: string;
  /** Suggested correction */
  suggestion: string;
  /** Tool call that caused the violation (if applicable) */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    callId?: string;
  };
  /** Timestamp when violation was detected */
  timestamp: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Result of a compliance check
 */
export interface ComplianceCheckResult {
  /** Whether the action is compliant */
  isCompliant: boolean;
  /** List of violations found */
  violations: ComplianceViolation[];
  /** Corrective message to inject into conversation */
  correctiveMessage?: string;
  /** Whether to block the action */
  shouldBlock: boolean;
  /** Whether to warn the user */
  shouldWarn: boolean;
}

/**
 * Tracks the state of a run for compliance checking
 */
export interface ComplianceRunState {
  /** Run ID */
  runId: string;
  /** Session ID */
  sessionId: string;
  /** Files that have been read in this run */
  filesRead: Set<string>;
  /** Files that have been edited in this run */
  filesEdited: Set<string>;
  /** Files that need lint check */
  filesNeedingLintCheck: Set<string>;
  /** Violations in this run */
  violations: ComplianceViolation[];
  /** Tool calls made in this run */
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    callId?: string;
    timestamp: number;
  }>;
  /** Original user request (for context) */
  userRequest: string;
  /** Timestamp when run started */
  startedAt: number;
}

/**
 * Model-specific prompt configuration
 */
export interface ModelPromptConfig {
  /** Model family (anthropic, openai, deepseek, gemini) */
  provider: string;
  /** Maximum recommended system prompt length */
  maxSystemPromptTokens: number;
  /** Whether model benefits from XML structure */
  prefersXmlStructure: boolean;
  /** Whether model benefits from examples */
  benefitsFromExamples: boolean;
  /** Whether to use condensed rules */
  useCondensedRules: boolean;
  /** Priority sections to always include */
  prioritySections: string[];
  /** Sections that can be condensed */
  condensableSections: string[];
  /** Whether to add mid-conversation reminders */
  addMidConversationReminders: boolean;
  /** Reminder frequency (every N messages) */
  reminderFrequency: number;
}

/**
 * Default model configurations
 */
export const MODEL_PROMPT_CONFIGS: Record<string, ModelPromptConfig> = {
  anthropic: {
    provider: 'anthropic',
    maxSystemPromptTokens: 8000,
    prefersXmlStructure: true,
    benefitsFromExamples: true,
    useCondensedRules: false,
    prioritySections: ['identity', 'critical_rules', 'context', 'tools', 'tool_workflows'],
    condensableSections: ['principles', 'communication_style'],
    addMidConversationReminders: true,
    reminderFrequency: 10,
  },
  openai: {
    provider: 'openai',
    maxSystemPromptTokens: 6000,
    prefersXmlStructure: false, // OpenAI prefers markdown
    benefitsFromExamples: true,
    useCondensedRules: true,
    prioritySections: ['identity', 'critical_rules', 'context', 'tools', 'tool_workflows'],
    condensableSections: ['principles', 'guidelines', 'tool_workflows', 'communication_style'],
    addMidConversationReminders: true,
    reminderFrequency: 8,
  },
  deepseek: {
    provider: 'deepseek',
    maxSystemPromptTokens: 6000,
    prefersXmlStructure: true,
    benefitsFromExamples: true,
    useCondensedRules: true,
    prioritySections: ['identity', 'critical_rules', 'context', 'tools', 'tool_workflows'],
    condensableSections: ['principles', 'guidelines', 'tool_workflows'],
    addMidConversationReminders: true,
    reminderFrequency: 6,
  },
  gemini: {
    provider: 'gemini',
    maxSystemPromptTokens: 8000,
    prefersXmlStructure: false,
    benefitsFromExamples: true,
    useCondensedRules: false,
    prioritySections: ['identity', 'critical_rules', 'context', 'tools', 'tool_workflows'],
    condensableSections: ['communication_style'],
    addMidConversationReminders: true,
    reminderFrequency: 10,
  },
};

/**
 * Corrective message templates
 */
export const CORRECTIVE_MESSAGES = {
  'file-not-read-before-edit': `[!] COMPLIANCE REMINDER: You attempted to edit a file without reading it first.   
RULE: Always use the read tool BEFORE using the edit tool on any file.
ACTION: Please read the file first before attempting to edit.`,

  'excessive-changes': `[!] COMPLIANCE REMINDER: You made more changes than were requested.
RULE: Only make the changes that were explicitly requested in the user prompt.
ACTION: Revert any unrequested changes and only apply those that were asked for.`,

  'incomplete-implementation': `[!] COMPLIANCE REMINDER: You made changes but did not verify they fully implement the user request.
RULE: After making changes, always verify that they completely fulfill the user's request.
ACTION: Review the user request and ensure all aspects have been addressed in your changes.`,

  'no-lint-check-after-edit': `[!] COMPLIANCE REMINDER: You edited file(s) but did not run read_lints to check for errors.
RULE: Always use read_lints tool AFTER editing any file to verify no errors were introduced.
ACTION: Please run read_lints on the edited file(s) now.`,

  'unnecessary-file-creation': `[!] COMPLIANCE REMINDER: You are creating a new file when editing an existing file might be more appropriate.
RULE: Only create files when absolutely required. Always prefer editing existing files.
ACTION: Consider if you can achieve the goal by editing an existing file instead.`,

  'edit-string-mismatch': `[!] COMPLIANCE REMINDER: The old_string in your edit does not match the file content exactly.
RULE: old_string MUST be copied EXACTLY from the read tool output, including ALL whitespace and indentation.
ACTION: Re-read the file and copy the exact text you want to replace.`,

  'missing-context-in-edit': `[!] COMPLIANCE REMINDER: Your edit old_string may not have enough context to be unique.
RULE: Include 3+ lines of surrounding context to ensure unique matching.
ACTION: Add more surrounding lines to make the match unique.`,
};
