/**
 * Git-related Types
 * 
 * Contains types for git operations, file statuses, branches, commits,
 * and git events for the renderer.
 * Extracted from shared/types.ts for modular organization.
 */

// =============================================================================
// Git Data Types
// =============================================================================

/** Git file status */
export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'unmerged';

/** Git file change information */
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

/** Git branch information */
export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: string;
}

/** Git commit information */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  body?: string;
  parents: string[];
}

/** Git stash entry */
export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: string;
}

/** Git remote configuration */
export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

/** Comprehensive git repository status */
export interface GitRepoStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  isRebasing: boolean;
  isMerging: boolean;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  conflicted: GitFileChange[];
  stashCount: number;
}

/** Git blame entry */
export interface GitBlameEntry {
  commit: string;
  author: string;
  date: string;
  line: number;
  content: string;
}

// =============================================================================
// Git Events (for renderer IPC)
// =============================================================================

export interface GitStatusChangedEvent {
  type: 'git:status-changed';
  status: GitRepoStatus;
}

export interface GitBranchChangedEvent {
  type: 'git:branch-changed';
  from: string;
  to: string;
}

export interface GitOperationCompleteEvent {
  type: 'git:operation-complete';
  operation: string;
  success: boolean;
  message?: string;
}

export interface GitErrorEvent {
  type: 'git:error';
  operation: string;
  error: string;
}

export type GitEvent = GitStatusChangedEvent | GitBranchChangedEvent | GitOperationCompleteEvent | GitErrorEvent;
