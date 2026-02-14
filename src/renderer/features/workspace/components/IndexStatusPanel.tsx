/**
 * IndexStatusPanel Component
 *
 * Displays workspace indexing status and allows triggering re-indexing.
 * Integrates with the WorkspaceProvider and Rust backend hooks.
 */

import React, { useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { useRustIndexStatus, useRustBackendConnection } from '../../../hooks/useRustBackend';

interface IndexStatusPanelProps {
  workspaceId: string | null;
  compact?: boolean;
}

export const IndexStatusPanel: React.FC<IndexStatusPanelProps> = ({
  workspaceId,
  compact = false,
}) => {
  const { indexed, isIndexing, isVectorIndexing, indexedCount, totalCount, vectorCount, vectorEmbeddedChunks, vectorTotalChunks, vectorReady, isLoading, triggerIndex } =
    useRustIndexStatus(workspaceId);
  const { isAvailable: isBackendAvailable, isConnecting: isBackendConnecting } = useRustBackendConnection();

  const handleReindex = useCallback(() => {
    triggerIndex();
  }, [triggerIndex]);

  // Show backend connectivity status when disconnected
  if (!isBackendAvailable && !isBackendConnecting) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)]/70 shrink-0"></span>
        <span>backend offline</span>
      </div>
    );
  }

  if (isBackendConnecting) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span className="inline-flex gap-0.5">
          <span className="animate-[thinking-dot_1.4s_ease-in-out_infinite] w-1 h-1 rounded-full bg-[var(--color-text-dim)]"></span>
          <span className="animate-[thinking-dot_1.4s_ease-in-out_0.2s_infinite] w-1 h-1 rounded-full bg-[var(--color-text-dim)]"></span>
          <span className="animate-[thinking-dot_1.4s_ease-in-out_0.4s_infinite] w-1 h-1 rounded-full bg-[var(--color-text-dim)]"></span>
        </span>
        <span>connecting</span>
      </div>
    );
  }

  if (!workspaceId) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-dim)]/40 shrink-0"></span>
        <span>no workspace</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[9px] text-[var(--color-text-dim)] font-mono">
        <span className="inline-flex gap-0.5">
          <span className="animate-[thinking-dot_1.4s_ease-in-out_infinite] w-1 h-1 rounded-full bg-[var(--color-text-dim)]"></span>
          <span className="animate-[thinking-dot_1.4s_ease-in-out_0.2s_infinite] w-1 h-1 rounded-full bg-[var(--color-text-dim)]"></span>
        </span>
        <span>checking index</span>
      </div>
    );
  }

  // Compact mode: just show a small status indicator
  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={isIndexing || isVectorIndexing ? 'Indexing...' : indexed ? 'Workspace indexed' : 'Not indexed'}>
        {isIndexing || isVectorIndexing ? (
          <span className="inline-flex gap-0.5">
            <span className="animate-[thinking-dot_1.4s_ease-in-out_infinite] w-1 h-1 rounded-full bg-[var(--color-accent-primary)]"></span>
            <span className="animate-[thinking-dot_1.4s_ease-in-out_0.2s_infinite] w-1 h-1 rounded-full bg-[var(--color-accent-primary)]"></span>
          </span>
        ) : indexed ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]"></span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-dim)]/40"></span>
        )}
      </div>
    );
  }

  // Full mode: show status bar with progress
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/30 font-mono">
      {/* Status dot */}
      {isIndexing || isVectorIndexing ? (
        <span className="inline-flex gap-0.5 shrink-0">
          <span className="animate-[thinking-dot_1.4s_ease-in-out_infinite] w-1 h-1 rounded-full bg-[var(--color-accent-primary)]"></span>
          <span className="animate-[thinking-dot_1.4s_ease-in-out_0.2s_infinite] w-1 h-1 rounded-full bg-[var(--color-accent-primary)]"></span>
        </span>
      ) : indexed ? (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-primary)] shrink-0"></span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-dim)]/40 shrink-0"></span>
      )}

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
        ) : isVectorIndexing ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-[var(--color-text-secondary)]">
              embedding {vectorTotalChunks > 0 ? `${vectorEmbeddedChunks}/${vectorTotalChunks}` : ''}
            </span>
            {vectorTotalChunks > 0 && (
              <div className="w-full h-0.5 bg-[var(--color-surface-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent-secondary,var(--color-accent-primary))] transition-all duration-300"
                  style={{ width: `${Math.round((vectorEmbeddedChunks / vectorTotalChunks) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : indexed ? (
          <span className="text-[9px] text-[var(--color-text-dim)]">
            {indexedCount > 0 ? `${indexedCount} files` : 'indexed'}
            {vectorReady && vectorCount > 0 && ` · ${vectorCount} vectors`}
          </span>
        ) : (
          <span className="text-[9px] text-[var(--color-text-dim)]">not indexed</span>
        )}
      </div>

      {/* Reindex button */}
      <button
        onClick={handleReindex}
        disabled={isIndexing || isVectorIndexing}
        className={cn(
          'text-[8px] px-1.5 py-0.5 rounded-sm transition-colors uppercase tracking-wider',
          isIndexing || isVectorIndexing
            ? 'text-[var(--color-text-dim)]/40 cursor-not-allowed'
            : 'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)]',
        )}
        title={isIndexing ? 'Indexing in progress...' : isVectorIndexing ? 'Embedding in progress...' : 'Re-index workspace'}
      >
        {isIndexing || isVectorIndexing ? '...' : 'reindex'}
      </button>
    </div>
  );
};
