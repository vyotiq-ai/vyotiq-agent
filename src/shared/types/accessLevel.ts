/**
 * Access Level Types
 *
 * System access levels defining what the AI agent can do,
 * tool category permissions, and access level configuration.
 *
 * @module types/accessLevel
 */

// =============================================================================
// Access Level Types
// =============================================================================

/**
 * System access levels defining what the AI agent can do
 * - read-only: Can only read files and run non-modifying commands
 * - standard: Default level - can read/write with confirmations
 * - elevated: Extended permissions with fewer confirmations
 * - admin: Full system access (use with caution)
 */
export type AccessLevel = 'read-only' | 'standard' | 'elevated' | 'admin';

/**
 * Tool category for permission grouping and UI classification
 * This is the canonical definition - import from here in other files
 */
export type ToolCategory =
  | 'read'           // File reading, searching, listing
  | 'write'          // File creation, editing, deletion
  | 'terminal'       // Terminal command execution
  | 'git'            // Git operations
  | 'system'         // System-level operations
  | 'destructive'    // Potentially dangerous operations
  | 'file-read'      // Reading files (alias for read)
  | 'file-write'     // Creating/modifying files (alias for write)
  | 'file-search'    // Finding/searching files
  | 'media'          // Video, audio, media operations
  | 'communication'  // Email, messaging
  | 'code-intelligence' // Symbols, definitions, references, diagnostics
  | 'browser-read'   // Browser read-only operations (fetch, extract, console)
  | 'browser-write'  // Browser state-changing operations (click, type, navigate)
  | 'agent-internal' // Agent internal tools (planning, etc.)
  | 'other';         // Uncategorized

/**
 * Permission setting for a tool category
 */
export interface CategoryPermission {
  /** Whether tools in this category are allowed */
  allowed: boolean;
  /** Whether tools require confirmation */
  requiresConfirmation: boolean;
}

/**
 * Access level configuration
 */
export interface AccessLevelSettings {
  /** Current access level */
  level: AccessLevel;

  /** Category-level permissions (overrides level defaults) */
  categoryPermissions: Partial<Record<ToolCategory, CategoryPermission>>;

  /** Individual tool overrides (highest priority) */
  toolOverrides: Record<string, {
    allowed: boolean;
    requiresConfirmation: boolean;
  }>;

  /** Paths the agent is restricted from accessing (glob patterns) */
  restrictedPaths: string[];

  /** Paths the agent has explicit access to (glob patterns, overrides restrictions) */
  allowedPaths: string[];

  /** Whether to show access level in the system prompt */
  showInSystemPrompt: boolean;

  /** Custom message to include when access is denied */
  accessDeniedMessage: string;

  /** Allow the agent to request elevated access */
  allowAccessRequests: boolean;

  /** 
   * Allow access to files outside the workspace.
   * When false (default): Agent can only access files within the active workspace.
   * When true: Agent can access any file on the system (use with caution).
   */
  allowOutsideWorkspace: boolean;
}

/**
 * Default permissions per access level
 */
export const ACCESS_LEVEL_DEFAULTS: Record<AccessLevel, Record<ToolCategory, CategoryPermission>> = {
  'read-only': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: false, requiresConfirmation: true },
    terminal: { allowed: false, requiresConfirmation: true },
    git: { allowed: false, requiresConfirmation: true },
    system: { allowed: false, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: false, requiresConfirmation: true },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: false, requiresConfirmation: true },
    communication: { allowed: false, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: false, requiresConfirmation: true },
    'browser-write': { allowed: false, requiresConfirmation: true },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: false, requiresConfirmation: true },
  },
  'standard': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: true },
    terminal: { allowed: true, requiresConfirmation: true },
    git: { allowed: true, requiresConfirmation: true },
    system: { allowed: false, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: true },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: true },
    communication: { allowed: false, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: true },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: true },
  },
  'elevated': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: false },
    terminal: { allowed: true, requiresConfirmation: false },
    git: { allowed: true, requiresConfirmation: false },
    system: { allowed: true, requiresConfirmation: true },
    destructive: { allowed: false, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: false },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: false },
    communication: { allowed: true, requiresConfirmation: true },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: false },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: false },
  },
  'admin': {
    read: { allowed: true, requiresConfirmation: false },
    write: { allowed: true, requiresConfirmation: false },
    terminal: { allowed: true, requiresConfirmation: false },
    git: { allowed: true, requiresConfirmation: false },
    system: { allowed: true, requiresConfirmation: false },
    destructive: { allowed: true, requiresConfirmation: true },
    'file-read': { allowed: true, requiresConfirmation: false },
    'file-write': { allowed: true, requiresConfirmation: false },
    'file-search': { allowed: true, requiresConfirmation: false },
    media: { allowed: true, requiresConfirmation: false },
    communication: { allowed: true, requiresConfirmation: false },
    'code-intelligence': { allowed: true, requiresConfirmation: false },
    'browser-read': { allowed: true, requiresConfirmation: false },
    'browser-write': { allowed: true, requiresConfirmation: false },
    'agent-internal': { allowed: true, requiresConfirmation: false },
    other: { allowed: true, requiresConfirmation: false },
  },
};

/**
 * Default access level settings
 */
export const DEFAULT_ACCESS_LEVEL_SETTINGS: AccessLevelSettings = {
  level: 'standard',
  categoryPermissions: {},
  toolOverrides: {},
  restrictedPaths: [
    '**/.env',
    '**/.env.*',
    '**/secrets/**',
    '**/credentials/**',
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
    '**/authorized_keys',
  ],
  allowedPaths: [],
  showInSystemPrompt: true,
  accessDeniedMessage: 'This action is not permitted at your current access level.',
  allowAccessRequests: false,
  allowOutsideWorkspace: false,
};

/**
 * Human-readable descriptions for access levels
 */
export const ACCESS_LEVEL_DESCRIPTIONS: Record<AccessLevel, { name: string; description: string; icon: string }> = {
  'read-only': {
    name: 'Read Only',
    description: 'Can only read files and search. No modifications allowed.',
    icon: 'Eye',
  },
  'standard': {
    name: 'Standard',
    description: 'Default level. Can read and write with confirmations.',
    icon: 'Shield',
  },
  'elevated': {
    name: 'Elevated',
    description: 'Extended permissions with fewer confirmation prompts.',
    icon: 'ShieldCheck',
  },
  'admin': {
    name: 'Administrator',
    description: 'Full system access. Use with extreme caution.',
    icon: 'ShieldAlert',
  },
};
