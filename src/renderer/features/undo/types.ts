/**
 * Undo History Types
 * 
 * TypeScript types for the undo history feature, matching backend types.
 */

/** Type of file operation */
export type FileChangeType = 'create' | 'modify' | 'delete';

/** Status of an undo entry */
export type UndoEntryStatus = 'undoable' | 'undone' | 'redoable';

/** Single file change entry */
export interface FileChange {
  /** Unique ID for this change */
  id: string;
  /** Session ID this change belongs to */
  sessionId: string;
  /** Run ID this change belongs to (for grouping) */
  runId: string;
  /** Absolute file path */
  filePath: string;
  /** Type of change */
  changeType: FileChangeType;
  /** Content before the change (null for new files) */
  previousContent: string | null;
  /** Content after the change (null for deleted files) */
  newContent: string | null;
  /** Tool that made the change */
  toolName: string;
  /** Human-readable description */
  description: string;
  /** Timestamp when change was made */
  timestamp: number;
  /** Current status of this entry */
  status: UndoEntryStatus;
}

/** Group of changes from a single run */
export interface RunChangeGroup {
  /** Run ID */
  runId: string;
  /** All changes in this run */
  changes: FileChange[];
  /** Timestamp of first change in run */
  startTime: number;
  /** Timestamp of last change in run */
  endTime: number;
  /** Total number of files affected */
  fileCount: number;
}

/** Result of an undo/redo operation */
export interface UndoResult {
  success: boolean;
  message: string;
  /** File path that was affected */
  filePath?: string;
  /** New status of the entry */
  newStatus?: UndoEntryStatus;
}

/** Result of undoing an entire run */
export interface UndoRunResult {
  success: boolean;
  message: string;
  /** Number of changes undone */
  count: number;
  /** Individual results */
  results: UndoResult[];
}
