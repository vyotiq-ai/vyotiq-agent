/**
 * File Info Panel Component
 *
 * Shows detailed file metadata in a modal overlay.
 * Displays: size, permissions, encoding, line endings, created/modified dates, MIME type.
 */

import React, { memo, useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { X, File, Folder, Calendar, HardDrive, Shield, FileType, Clock } from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface FileInfoPanelProps {
  filePath: string | null;
  fileType: 'file' | 'directory' | null;
  onClose: () => void;
}

interface FileMetadata {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  createdAt: string | number;
  modifiedAt: string | number;
  accessedAt: string | number;
  permissions: string;
  encoding?: string;
  lineEnding?: string;
  language?: string;
  lineCount?: number;
}

// =============================================================================
// Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value: string | number): string {
  try {
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(value);
  }
}

// =============================================================================
// Info Row
// =============================================================================

const InfoRow = memo<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }>(
  ({ icon, label, value, mono }) => (
    <div className="flex items-start gap-2 py-1.5">
      <span className="shrink-0 text-[var(--color-text-dim)] mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-dim)]">{label}</div>
        <div className={cn(
          'text-[11px] text-[var(--color-text-secondary)] truncate',
          mono && 'font-mono'
        )}>
          {value}
        </div>
      </div>
    </div>
  )
);
InfoRow.displayName = 'InfoRow';

// =============================================================================
// FileInfoPanel
// =============================================================================

export const FileInfoPanel: React.FC<FileInfoPanelProps> = memo(({
  filePath,
  fileType,
  onClose,
}) => {
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fileName = useMemo(() => filePath?.split(/[/\\]/).pop() ?? '', [filePath]);

  // Load metadata
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const result = await window.vyotiq?.files?.metadata?.(filePath);
        if (result?.success) {
          setMetadata({
            size: result.size ?? 0,
            isDirectory: result.isDirectory ?? false,
            isFile: result.isFile ?? true,
            isSymlink: result.isSymlink ?? false,
            createdAt: result.createdAt ?? 0,
            modifiedAt: result.modifiedAt ?? 0,
            accessedAt: result.accessedAt ?? 0,
            permissions: result.permissions ?? '',
            encoding: result.encoding,
            lineEnding: result.lineEnding,
            language: result.language,
            lineCount: result.lineCount,
          });
        } else {
          // Fallback: use stat
          const stat = await window.vyotiq?.files?.stat?.(filePath);
          if (stat?.success) {
            setMetadata({
              size: stat.size ?? 0,
              isDirectory: stat.isDirectory ?? fileType === 'directory',
              isFile: stat.isFile ?? fileType === 'file',
              isSymlink: false,
              createdAt: stat.createdAt ?? 0,
              modifiedAt: stat.modifiedAt ?? 0,
              accessedAt: 0,
              permissions: '',
            });
          } else {
            setError('Failed to load file info');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [filePath, fileType]);

  // Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside closes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);

  if (!filePath) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-[360px] max-h-[60vh] overflow-hidden',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[var(--shadow-dropdown)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-150',
        'flex flex-col',
      )}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      role="dialog"
      aria-label={`Info: ${fileName}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/40">
        <div className="flex items-center gap-2 min-w-0">
          {fileType === 'directory' 
            ? <Folder size={13} className="shrink-0 text-[var(--color-accent-secondary)]" />
            : <File size={13} className="shrink-0 text-[var(--color-text-muted)]" />
          }
          <span className="text-[var(--color-text-primary)] font-medium truncate">{fileName}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors shrink-0"
          title="Close (Esc)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 py-2 scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--color-text-dim)]">
            <span className="animate-pulse">loading...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8 text-[var(--color-error)] text-[10px]">
            {error}
          </div>
        )}

        {metadata && !loading && (
          <div className="space-y-0.5">
            {/* Full path */}
            <InfoRow
              icon={<FileType size={11} />}
              label="path"
              value={filePath}
              mono
            />

            {/* Size */}
            <InfoRow
              icon={<HardDrive size={11} />}
              label="size"
              value={formatBytes(metadata.size)}
            />

            {/* Type */}
            <InfoRow
              icon={metadata.isDirectory ? <Folder size={11} /> : <File size={11} />}
              label="type"
              value={
                metadata.isSymlink 
                  ? 'symbolic link' 
                  : metadata.isDirectory 
                    ? 'directory' 
                    : 'file'
              }
            />

            {/* Encoding */}
            {metadata.encoding && (
              <InfoRow
                icon={<FileType size={11} />}
                label="encoding"
                value={metadata.encoding}
              />
            )}

            {/* Line ending */}
            {metadata.lineEnding && (
              <InfoRow
                icon={<FileType size={11} />}
                label="line ending"
                value={metadata.lineEnding}
              />
            )}

            {/* Language */}
            {metadata.language && (
              <InfoRow
                icon={<FileType size={11} />}
                label="language"
                value={metadata.language}
                mono
              />
            )}

            {/* Line count */}
            {metadata.lineCount !== undefined && (
              <InfoRow
                icon={<FileType size={11} />}
                label="lines"
                value={String(metadata.lineCount)}
              />
            )}

            {/* Permissions */}
            {metadata.permissions && (
              <InfoRow
                icon={<Shield size={11} />}
                label="permissions"
                value={metadata.permissions}
                mono
              />
            )}

            {/* Created */}
            {metadata.createdAt && (
              <InfoRow
                icon={<Calendar size={11} />}
                label="created"
                value={formatDate(metadata.createdAt)}
              />
            )}

            {/* Modified */}
            {metadata.modifiedAt && (
              <InfoRow
                icon={<Clock size={11} />}
                label="modified"
                value={formatDate(metadata.modifiedAt)}
              />
            )}

            {/* Accessed */}
            {metadata.accessedAt && (
              <InfoRow
                icon={<Clock size={11} />}
                label="accessed"
                value={formatDate(metadata.accessedAt)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

FileInfoPanel.displayName = 'FileInfoPanel';
