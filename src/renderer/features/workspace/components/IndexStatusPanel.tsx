/**
 * IndexStatusPanel Component
 *
 * Displays workspace indexing status and allows triggering re-indexing.
 * Integrates with the WorkspaceProvider and Rust backend hooks.
 */

import React, { useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useRustIndexStatus, useRustBackendConnection } from '../../../hooks/useRustBackend';

interface IndexStatusPanelProps {
  workspaceId: string | null;
  compact?: boolean;
}

export const IndexStatusPanel: React.FC<IndexStatusPanelProps> = ({
  workspaceId,
  compact = false,
}) => {
  const { indexed, isIndexing, indexedCount, totalCount, isLoading, triggerIndex } =
    useRustIndexStatus(workspaceId);
  const { isAvailable: isBackendAvailable, isConnecting: isBackendConnecting } = useRustBackendConnection();

  const handleReindex = useCallback(() => {
    triggerIndex();
  }, [triggerIndex]);

  // Show backend connectivity status when disconnected
  if (!isBackendAvailable && !isBackendConnecting) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span>backend offline</span>
      </div>
    );
  }

  if (isBackendConnecting) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span>connecting</span>
      </div>
    );
  }

  if (!workspaceId) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span>no workspace</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span>checking index</span>
      </div>
    );
  }

  // Compact mode: just show text status
  if (compact) {
    return (
      <Tooltip content={isIndexing ? 'Indexing...' : indexed ? 'Workspace indexed' : 'Not indexed'}>
      <div className="flex items-center">
        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">
          {isIndexing ? 'indexing' : indexed ? 'indexed' : 'not indexed'}
        </span>
      </div>
      </Tooltip>
    );
  }

  // Full mode: show status bar with progress
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/30 font-mono">
      {/* Status text */}
      <div className="flex-1 min-w-0">
        {isIndexing ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-[var(--color-text-secondary)]">
              indexing {totalCount > 0 ? `${indexedCount}/${totalCount}` : ''}
            </span>
            {totalCount > 0 && (
              <div className="w-full h-0.5 bg-[var(--color-surface-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent-primary)] transition-all duration-300"
                  style={{ width: `${Math.round((indexedCount / totalCount) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : indexed ? (
          <span className="text-[9px] text-[var(--color-text-dim)]">
            {indexedCount > 0 ? `${indexedCount} files` : 'indexed'}
          </span>
        ) : (
          <span className="text-[9px] text-[var(--color-text-dim)]">not indexed</span>
        )}
      </div>

      {/* Reindex button */}
      <Tooltip content={isIndexing ? 'Indexing in progress...' : 'Re-index workspace'}>
      <button
        onClick={handleReindex}
        disabled={isIndexing}
        className={cn(
          'text-[9px] px-1.5 py-0.5 rounded-sm transition-colors uppercase tracking-wider',
          isIndexing
            ? 'text-[var(--color-text-dim)]/40 cursor-not-allowed'
            : 'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)]',
        )}
        aria-label={isIndexing ? 'Indexing in progress...' : 'Re-index workspace'}
      >
        {isIndexing ? '...' : 'reindex'}
      </button>
      </Tooltip>
    </div>
  );
};
