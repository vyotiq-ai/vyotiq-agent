/**
 * File Tracking Module Index
 *
 * Re-exports file tracking components for single-agent
 * file access tracking and change aggregation.
 */

// File Access Tracking
export {
  FileAccessTracker,
  type FileAccess,
  type AgentFileHistory,
  type TrackingMode,
  type FileAccessTrackerConfig,
  DEFAULT_FILE_ACCESS_TRACKER_CONFIG,
} from './FileAccessTracker';

// Conflict Detection
export {
  ConflictDetector,
  type ConflictType,
  type ConflictSeverity,
  type ResolutionStrategy,
  type FileConflict,
  type ConflictingAgent,
  type ConflictDetails,
  type ConflictResolution,
  type PendingOperation,
  type ConflictDetectorConfig,
  DEFAULT_CONFLICT_DETECTOR_CONFIG,
} from './ConflictDetector';

// Change Aggregation
export {
  ChangeAggregator,
  type ChangeType,
  type FileChange,
  type ChangeDetails,
  type FileChangeSummary,
  type AgentChangeSummary,
  type SessionChangeSummary,
  type ChangeAggregatorConfig,
  DEFAULT_CHANGE_AGGREGATOR_CONFIG,
} from './ChangeAggregator';

// =============================================================================
// Singleton Access
// =============================================================================

import { VyotiqLogger, type Logger } from '../../logger';
import { FileAccessTracker } from './FileAccessTracker';
import { ConflictDetector } from './ConflictDetector';
import { ChangeAggregator } from './ChangeAggregator';

let fileAccessTrackerInstance: FileAccessTracker | null = null;
let conflictDetectorInstance: ConflictDetector | null = null;
let changeAggregatorInstance: ChangeAggregator | null = null;

/**
 * Get or create the FileAccessTracker singleton
 */
export function getFileAccessTracker(logger?: Logger): FileAccessTracker {
  if (!fileAccessTrackerInstance) {
    fileAccessTrackerInstance = new FileAccessTracker(
      logger || new VyotiqLogger('FileAccessTracker')
    );
  }
  return fileAccessTrackerInstance;
}

/**
 * Get or create the ConflictDetector singleton
 */
export function getConflictDetector(logger?: Logger): ConflictDetector {
  if (!conflictDetectorInstance) {
    conflictDetectorInstance = new ConflictDetector(
      logger || new VyotiqLogger('ConflictDetector')
    );
  }
  return conflictDetectorInstance;
}

/**
 * Get or create the ChangeAggregator singleton
 */
export function getChangeAggregator(logger?: Logger): ChangeAggregator {
  if (!changeAggregatorInstance) {
    changeAggregatorInstance = new ChangeAggregator(
      logger || new VyotiqLogger('ChangeAggregator')
    );
  }
  return changeAggregatorInstance;
}

/**
 * Initialize file tracking singletons
 */
export function initializeFileTracking(logger?: Logger): void {
  const log = logger || new VyotiqLogger('FileTracking');

  getFileAccessTracker(log);
  getConflictDetector(log);
  getChangeAggregator(log);

  log.info('File tracking system initialized');
}

/**
 * Shutdown file tracking singletons
 */
export function shutdownFileTracking(): void {
  fileAccessTrackerInstance = null;
  conflictDetectorInstance = null;
  changeAggregatorInstance = null;
}

/**
 * Reset file tracking singletons (for testing)
 */
export function resetFileTrackingSingletons(): void {
  shutdownFileTracking();
}
