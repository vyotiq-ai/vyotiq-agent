/**
 * Prompt Customization Types
 *
 * Types for personas, context injection, response format,
 * agent instructions, AGENTS.md files, and instruction files.
 */

// =============================================================================
// Persona & Injection Types
// =============================================================================

/**
 * Predefined persona/role for the AI agent
 */
export interface AgentPersona {
  /** Unique identifier for the persona */
  id: string;
  /** Display name */
  name: string;
  /** Short description of the persona's behavior */
  description: string;
  /** System prompt content for this persona */
  systemPrompt: string;
  /** Icon identifier (lucide icon name) */
  icon?: string;
  /** Whether this is a built-in persona */
  isBuiltIn?: boolean;
}

/**
 * Context injection rule - defines when and how to inject context
 */
export interface ContextInjectionRule {
  /** Unique identifier */
  id: string;
  /** Display name for the rule */
  name: string;
  /** Whether this rule is enabled */
  enabled: boolean;
  /** Priority order (lower = higher priority) */
  priority: number;
  /** Condition for when to apply this rule */
  condition: ContextInjectionCondition;
  /** The context template to inject (supports placeholders) */
  template: string;
  /** 
   * Where to inject context. Note: all positions are treated as 'append' 
   * to protect the core system prompt. Kept for backward compatibility.
   * @deprecated Use 'append' - all values are treated as append now
   */
  position: 'prepend' | 'append' | 'replace';
}

/**
 * Condition for context injection
 */
export interface ContextInjectionCondition {
  /** Type of condition */
  type: 'always' | 'workspace-pattern' | 'keyword' | 'custom' | 'file-type';
  /** Value for the condition (e.g., file extension, glob pattern, keyword) */
  value?: string;
  /** Custom condition function (serialized as string) */
  customFn?: string;
}

/**
 * Response format preferences
 */
export interface ResponseFormatPreferences {
  /** Preferred code block style */
  codeBlockStyle: 'fenced' | 'indented';
  /** Whether to include line numbers in code blocks */
  includeLineNumbers: boolean;
  /** Preferred language for explanations */
  explanationDetail: 'minimal' | 'moderate' | 'detailed';
  /** Whether to include examples in explanations */
  includeExamples: boolean;
  /** Maximum response length preference */
  maxResponseLength: 'short' | 'medium' | 'long' | 'unlimited';
  /** Preferred tone */
  tone: 'professional' | 'casual' | 'technical' | 'friendly';
  /** Whether to use markdown formatting */
  useMarkdown: boolean;
  /** Whether to break up long responses with headers */
  useHeaders: boolean;
}

// =============================================================================
// Agent Instruction Types
// =============================================================================

/**
 * Agent instruction scope determines when instructions are active
 */
export type AgentInstructionScope = 'global' | 'workspace' | 'session';

/**
 * Agent instruction trigger condition
 */
export interface AgentInstructionTrigger {
  /** Type of trigger */
  type: 'always' | 'keyword' | 'file-type' | 'task-type' | 'manual';
  /** Value for the trigger (keywords, file patterns, task types) */
  value?: string;
}

/**
 * Agent instruction - specialized instructions for different agent behaviors
 * 
 * These instructions define how the agent should behave in specific contexts,
 * such as when acting as a researcher, planner, code reviewer, etc.
 */
export interface AgentInstruction {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this instruction does */
  description: string;
  /** The instruction content to inject into the system prompt */
  instructions: string;
  /** Icon identifier (lucide icon name) */
  icon?: string;
  /** Whether this is a built-in instruction */
  isBuiltIn?: boolean;
  /** Whether this instruction is enabled */
  enabled: boolean;
  /** Scope of the instruction */
  scope: AgentInstructionScope;
  /** Priority order (lower = higher priority, loaded first) */
  priority: number;
  /** Trigger conditions for when to apply this instruction */
  trigger: AgentInstructionTrigger;
  /** Tags for categorization and filtering */
  tags?: string[];
}

// =============================================================================
// AGENTS.md File Support Types
// =============================================================================

/**
 * Parsed AGENTS.md file content
 * Follows the AGENTS.md specification (https://agents.md/)
 */
export interface AgentsMdFile {
  /** Absolute path to the AGENTS.md file */
  filePath: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Raw markdown content */
  content: string;
  /** File modification time for cache invalidation */
  mtime: number;
  /** Depth from workspace root (0 = root, 1 = one level down, etc.) */
  depth: number;
  /** Parsed sections from the markdown */
  sections: AgentsMdSection[];
}

/**
 * A section from an AGENTS.md file
 */
export interface AgentsMdSection {
  /** Section heading (e.g., "Setup commands", "Code style") */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Section content (markdown) */
  content: string;
}

/**
 * AGENTS.md context for system prompt injection
 * Represents the resolved AGENTS.md content for a given context
 */
export interface AgentsMdContext {
  /** Whether AGENTS.md files were found */
  found: boolean;
  /** Primary AGENTS.md file (closest to active file or workspace root) */
  primary?: AgentsMdFile;
  /** All discovered AGENTS.md files in the workspace */
  allFiles: AgentsMdFile[];
  /** Combined content from all applicable files (respecting hierarchy) */
  combinedContent: string;
  /** Last scan timestamp */
  scannedAt: number;
}

// =============================================================================
// Project Instruction Files Support Types (Extended AGENTS.md)
// =============================================================================

/**
 * Types of instruction files that can be discovered and loaded.
 * Following the 2025-2026 multi-agent specification standards.
 */
export type InstructionFileType =
  | 'agents-md'           // AGENTS.md - Open standard (Linux Foundation)
  | 'claude-md'           // CLAUDE.md - Anthropic Claude Code
  | 'copilot-instructions' // .github/copilot-instructions.md - GitHub Copilot
  | 'github-instructions' // .github/instructions/*.md - Path-specific Copilot
  | 'gemini-md'           // GEMINI.md - Google Gemini CLI
  | 'cursor-rules';       // .cursor/rules - Cursor editor

/**
 * Frontmatter metadata parsed from instruction files
 */
export interface InstructionFileFrontmatter {
  /** Title of the instruction file */
  title?: string;
  /** Description of the instructions */
  description?: string;
  /** Priority order (lower = higher priority) */
  priority?: number;
  /** Glob patterns for path-specific instructions */
  paths?: string[];
  /** Tags for categorization */
  tags?: string[];
  /** Whether this file should override parent instructions */
  override?: boolean;
  /** Scope of the instructions */
  scope?: 'global' | 'directory' | 'file';
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Extended instruction file with type and frontmatter
 */
export interface InstructionFile extends AgentsMdFile {
  /** Type of instruction file */
  type: InstructionFileType;
  /** Parsed frontmatter metadata */
  frontmatter?: InstructionFileFrontmatter;
  /** Whether this file is enabled */
  enabled: boolean;
  /** User-set priority override (null = use default from frontmatter or type) */
  priorityOverride?: number;
  /** Source of the instruction file */
  source: 'workspace' | 'user' | 'global';
}

/**
 * Configuration for which instruction file types to load
 */
export interface InstructionFilesConfig {
  /** Enable AGENTS.md loading */
  enableAgentsMd: boolean;
  /** Enable CLAUDE.md loading */
  enableClaudeMd: boolean;
  /** Enable .github/copilot-instructions.md loading */
  enableCopilotInstructions: boolean;
  /** Enable .github/instructions/*.md loading */
  enableGithubInstructions: boolean;
  /** Enable GEMINI.md loading */
  enableGeminiMd: boolean;
  /** Enable .cursor/rules loading */
  enableCursorRules: boolean;
  /** Per-file enabled/disabled overrides by relative path */
  fileOverrides: Record<string, { enabled: boolean; priority?: number }>;
  /** Maximum combined content length (characters) */
  maxCombinedContentLength: number;
  /** Whether to show instruction sources in the prompt */
  showSourcesInPrompt: boolean;
}

/**
 * Extended context for all instruction files
 */
export interface InstructionFilesContext {
  /** Whether any instruction files were found */
  found: boolean;
  /** All discovered instruction files */
  allFiles: InstructionFile[];
  /** Files filtered by enabled status and config */
  enabledFiles: InstructionFile[];
  /** Combined content from all enabled files (respecting priority) */
  combinedContent: string;
  /** Last scan timestamp */
  scannedAt: number;
  /** Errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
  /** Config used for this context */
  config: InstructionFilesConfig;
}

/**
 * Default instruction files configuration
 */
export const DEFAULT_INSTRUCTION_FILES_CONFIG: InstructionFilesConfig = {
  enableAgentsMd: true,
  enableClaudeMd: true,
  enableCopilotInstructions: true,
  enableGithubInstructions: true,
  enableGeminiMd: true,
  enableCursorRules: true,
  fileOverrides: {},
  maxCombinedContentLength: 32000, // 32KB combined limit
  showSourcesInPrompt: true,
};

// =============================================================================
// Prompt Settings
// =============================================================================

/**
 * Complete prompt customization settings
 */
export interface PromptSettings {
  /** Custom system prompt (overrides default if set) */
  customSystemPrompt: string;
  /** Whether to use custom system prompt */
  useCustomSystemPrompt: boolean;
  /** Currently selected persona ID */
  activePersonaId: string | null;
  /** Available personas (built-in + custom) */
  personas: AgentPersona[];
  /** Context injection rules */
  contextInjectionRules: ContextInjectionRule[];
  /** Response format preferences */
  responseFormat: ResponseFormatPreferences;
  /** Whether to include workspace context in prompts */
  includeWorkspaceContext: boolean;
  /** Agent instructions - specialized behavior definitions */
  agentInstructions: AgentInstruction[];
  /** Configuration for project instruction files (AGENTS.md, CLAUDE.md, etc.) */
  instructionFilesConfig: InstructionFilesConfig;
}

/**
 * Default response format preferences
 */
export const DEFAULT_RESPONSE_FORMAT: ResponseFormatPreferences = {
  codeBlockStyle: 'fenced',
  includeLineNumbers: false,
  explanationDetail: 'moderate',
  includeExamples: true,
  maxResponseLength: 'medium',
  tone: 'professional',
  useMarkdown: true,
  useHeaders: true,
};

/**
 * Built-in agent instructions
 * These provide specialized behaviors that can be dynamically loaded
 */
export const BUILT_IN_AGENT_INSTRUCTIONS: AgentInstruction[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Focused on gathering information, searching documentation, and web research',
    instructions: `When acting as a researcher:
- Use browser tools to search for up-to-date documentation and information
- Use grep and glob to find relevant code patterns and implementations
- Gather comprehensive context before providing answers
- Cite sources and provide links to documentation when relevant
- Focus on accuracy and completeness of information
- Synthesize findings into clear, actionable summaries`,
    icon: 'Search',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 1,
    trigger: { type: 'keyword', value: 'research,find,search,documentation,docs' },
    tags: ['research', 'documentation', 'search'],
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Creates detailed plans and breaks down complex tasks into steps',
    instructions: `When acting as a planner:
- Use CreatePlan tool to structure multi-step tasks
- Break complex problems into smaller, manageable subtasks
- Consider dependencies between tasks
- Estimate complexity and effort for each step
- Identify potential blockers and risks
- Provide clear success criteria for each task
- Track progress with TodoWrite tool`,
    icon: 'ListTodo',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 2,
    trigger: { type: 'keyword', value: 'plan,breakdown,steps,organize,task' },
    tags: ['planning', 'organization', 'tasks'],
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews code for quality, security, and best practices',
    instructions: `When acting as a code reviewer:
- Analyze code for correctness, security vulnerabilities, and bugs
- Check for adherence to best practices and design patterns
- Evaluate code readability and maintainability
- Identify performance issues and optimization opportunities
- Suggest specific improvements with code examples
- Consider edge cases and error handling
- Use LSP tools for comprehensive code analysis`,
    icon: 'CheckCircle2',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 3,
    trigger: { type: 'keyword', value: 'review,audit,check,analyze,quality' },
    tags: ['review', 'quality', 'security'],
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'Specialized in finding and fixing bugs and issues',
    instructions: `When acting as a debugger:
- Systematically trace the source of issues
- Use read_lints to check for diagnostic errors
- Analyze stack traces and error messages carefully
- Form and test hypotheses about the root cause
- Check related code paths for similar issues
- Verify fixes don't introduce new problems
- Document the issue and solution for future reference`,
    icon: 'Bug',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 4,
    trigger: { type: 'keyword', value: 'debug,fix,bug,error,issue,problem' },
    tags: ['debugging', 'troubleshooting', 'fixes'],
  },
  {
    id: 'refactorer',
    name: 'Refactorer',
    description: 'Improves code structure without changing behavior',
    instructions: `When acting as a refactorer:
- Preserve existing functionality while improving code structure
- Apply SOLID principles and design patterns appropriately
- Use LSP tools to find all references before renaming
- Break large functions/files into smaller, focused units
- Improve naming for clarity and consistency
- Remove code duplication through abstraction
- Ensure tests pass after each refactoring step`,
    icon: 'RefreshCw',
    isBuiltIn: true,
    enabled: true,
    scope: 'global',
    priority: 5,
    trigger: { type: 'keyword', value: 'refactor,restructure,reorganize,cleanup,improve' },
    tags: ['refactoring', 'cleanup', 'structure'],
  },
];

/**
 * Built-in personas
 */
export const BUILT_IN_PERSONAS: AgentPersona[] = [
  {
    id: 'default',
    name: 'Default Assistant',
    description: 'Balanced, helpful coding assistant',
    systemPrompt: '',
    icon: 'Bot',
    isBuiltIn: true,
  },
  {
    id: 'senior-dev',
    name: 'Senior Developer',
    description: 'Experienced, thorough, focuses on best practices and code quality',
    systemPrompt: `You are a senior software developer with 15+ years of experience. You:
- Always prioritize code quality, maintainability, and best practices
- Consider edge cases and error handling thoroughly
- Suggest improvements proactively when you see potential issues
- Explain the reasoning behind architectural decisions
- Focus on writing clean, well-documented, testable code`,
    icon: 'Code2',
    isBuiltIn: true,
  },
  {
    id: 'quick-helper',
    name: 'Quick Helper',
    description: 'Fast, concise responses for quick tasks',
    systemPrompt: `You are a fast, efficient coding assistant. You:
- Give concise, direct answers
- Skip unnecessary explanations unless asked
- Focus on getting the task done quickly
- Provide working code first, explanations only if needed
- Assume the user knows what they're doing`,
    icon: 'Zap',
    isBuiltIn: true,
  },
  {
    id: 'teacher',
    name: 'Teacher Mode',
    description: 'Educational, explains concepts in detail',
    systemPrompt: `You are a patient programming teacher. You:
- Explain concepts thoroughly and clearly
- Use analogies and examples to illustrate points
- Break down complex topics into digestible pieces
- Encourage learning and understanding over quick fixes
- Point out learning opportunities in every interaction`,
    icon: 'GraduationCap',
    isBuiltIn: true,
  },
  {
    id: 'architect',
    name: 'System Architect',
    description: 'Focuses on system design and architecture',
    systemPrompt: `You are a systems architect. You:
- Think about scalability and maintainability
- Consider the bigger picture and system interactions
- Suggest appropriate design patterns
- Balance trade-offs between different approaches
- Focus on clean separation of concerns`,
    icon: 'Building2',
    isBuiltIn: true,
  },
];

/**
 * Default prompt settings
 */
export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  customSystemPrompt: '',
  useCustomSystemPrompt: false,
  activePersonaId: 'default',
  personas: [...BUILT_IN_PERSONAS],
  contextInjectionRules: [],
  responseFormat: DEFAULT_RESPONSE_FORMAT,
  includeWorkspaceContext: true,
  agentInstructions: [...BUILT_IN_AGENT_INSTRUCTIONS],
  instructionFilesConfig: { ...DEFAULT_INSTRUCTION_FILES_CONFIG },
};
