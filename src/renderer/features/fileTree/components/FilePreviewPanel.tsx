/**
 * File Preview Panel Component
 *
 * Quick preview overlay that shows file contents without opening in the editor.
 * Supports syntax-highlighted code, images, and binary file metadata.
 * Activated from the file tree context menu "Quick Preview" action.
 */

import React, { memo, useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { X, FileCode2, Image as ImageIcon, FileText, Copy, Maximize2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon, getFolderIcon } from '../utils/fileIcons';

// =============================================================================
// Types
// =============================================================================

interface FilePreviewPanelProps {
  /** File path to preview */
  filePath: string | null;
  /** Called when user closes the preview */
  onClose: () => void;
  /** Called when user wants to open the file fully in the editor */
  onOpenInEditor: (filePath: string) => void;
}

interface PreviewContent {
  type: 'text' | 'image' | 'binary' | 'error' | 'loading';
  content?: string;
  language?: string;
  encoding?: string;
  lineEnding?: string;
  size?: number;
  mimeType?: string;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_PREVIEW_SIZE = 256 * 1024; // 256KB text preview limit
const MAX_PREVIEW_LINES = 500;

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.avif',
]);

const BINARY_EXTENSIONS = new Set([
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.sqlite', '.db',
  '.o', '.obj', '.class', '.pyc',
]);

/** Map file extensions to syntax languages */
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json', '.jsonc': 'json',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sql': 'sql',
  '.md': 'markdown',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.ps1': 'powershell',
  '.bat': 'batch', '.cmd': 'batch',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.env': 'ini',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.gitignore': 'gitignore',
};

// =============================================================================
// Helpers
// =============================================================================

function getExtension(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? '';
  const dotIdx = name.lastIndexOf('.');
  return dotIdx > 0 ? name.substring(dotIdx).toLowerCase() : '';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateLines(content: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return { text: content, truncated: false };
  return { text: lines.slice(0, maxLines).join('\n'), truncated: true };
}

// =============================================================================
// FilePreviewPanel
// =============================================================================

export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = memo(({
  filePath,
  onClose,
  onOpenInEditor,
}) => {
  const [preview, setPreview] = useState<PreviewContent>({ type: 'loading' });
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fileName = useMemo(() => filePath?.split(/[/\\]/).pop() ?? '', [filePath]);
  const ext = useMemo(() => filePath ? getExtension(filePath) : '', [filePath]);
  const language = useMemo(() => EXT_TO_LANGUAGE[ext] ?? 'plaintext', [ext]);

  // Load file content
  useEffect(() => {
    if (!filePath) {
      setPreview({ type: 'loading' });
      return;
    }

    // Cancel previous load
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPreview({ type: 'loading' });

    const loadPreview = async () => {
      try {
        // Check if image
        if (IMAGE_EXTENSIONS.has(ext)) {
          // Use IPC to get the file: protocol URL or base64
          try {
            const readResult = await window.vyotiq?.files?.readBinary?.(filePath);
            if (controller.signal.aborted) return;
            if (readResult?.success && readResult.content) {
              const mimeMap: Record<string, string> = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
                '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
              };
              const mime = mimeMap[ext] ?? 'image/png';
              setPreview({
                type: 'image',
                content: `data:${mime};base64,${readResult.content}`,
                size: readResult.size,
                mimeType: mime,
              });
            } else {
              setPreview({ type: 'error', error: 'Failed to read image file' });
            }
          } catch {
            if (controller.signal.aborted) return;
            setPreview({ type: 'error', error: 'Failed to read image file' });
          }
          return;
        }

        // Check if known binary
        if (BINARY_EXTENSIONS.has(ext)) {
          try {
            const meta = await window.vyotiq?.files?.metadata?.(filePath);
            if (controller.signal.aborted) return;
            setPreview({
              type: 'binary',
              size: meta?.size ?? 0,
              encoding: 'binary',
              mimeType: meta?.language ?? 'application/octet-stream',
            });
          } catch {
            if (controller.signal.aborted) return;
            setPreview({ type: 'binary', encoding: 'binary' });
          }
          return;
        }

        // Text file — read() takes an array of paths, returns AttachmentPayload[]
        const results = await window.vyotiq?.files?.read?.([filePath]);
        if (controller.signal.aborted) return;
        const result = results?.[0];

        if (result?.content !== undefined) {
          const contentStr = String(result.content);
          const size = new TextEncoder().encode(contentStr).length;

          if (size > MAX_PREVIEW_SIZE) {
            const { text, truncated } = truncateLines(contentStr, MAX_PREVIEW_LINES);
            setPreview({
              type: 'text',
              content: text + (truncated ? '\n\n// ... file truncated for preview ...' : ''),
              language,
              size,
            });
          } else {
            const { text, truncated } = truncateLines(contentStr, MAX_PREVIEW_LINES);
            setPreview({
              type: 'text',
              content: text + (truncated ? '\n\n// ... file truncated for preview ...' : ''),
              language,
              size,
            });
          }
        } else {
          setPreview({ type: 'error', error: 'Failed to read file' });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setPreview({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      }
    };

    void loadPreview();

    return () => {
      controller.abort();
    };
  }, [filePath, ext, language]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleCopyContent = useCallback(async () => {
    if (preview.type === 'text' && preview.content) {
      await navigator.clipboard.writeText(preview.content);
    }
  }, [preview]);

  const handleOpenFull = useCallback(() => {
    if (filePath) onOpenInEditor(filePath);
    onClose();
  }, [filePath, onOpenInEditor, onClose]);

  if (!filePath) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-[520px] max-h-[70vh] overflow-hidden',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[var(--shadow-dropdown)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-150',
        'flex flex-col',
      )}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      role="dialog"
      aria-label={`Preview: ${fileName}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={13} className="shrink-0 text-[var(--color-text-muted)]" />
          <span className="text-[var(--color-text-primary)] font-medium truncate">{fileName}</span>
          {preview.size !== undefined && (
            <span className="text-[var(--color-text-dim)] text-[9px] shrink-0">
              {formatBytes(preview.size)}
            </span>
          )}
          {preview.language && (
            <span className="text-[var(--color-accent-secondary)] text-[9px] shrink-0">
              {preview.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {preview.type === 'text' && (
            <button
              type="button"
              onClick={handleCopyContent}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
              title="Copy content"
            >
              <Copy size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenFull}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Open in editor"
          >
            <Maximize2 size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Close (Esc)"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent">
        {preview.type === 'loading' && (
          <div className="flex items-center justify-center py-12 text-[var(--color-text-dim)]">
            <span className="animate-pulse">loading preview...</span>
          </div>
        )}

        {preview.type === 'error' && (
          <div className="flex items-center justify-center py-12 text-[var(--color-error)] text-[10px]">
            {preview.error ?? 'Failed to load preview'}
          </div>
        )}

        {preview.type === 'text' && preview.content !== undefined && (
          <div className="relative">
            <pre className={cn(
              'p-3 text-[11px] leading-[1.5] whitespace-pre overflow-x-auto',
              'text-[var(--color-text-secondary)]',
              'selection:bg-[var(--color-accent-primary)]/20',
            )}>
              {preview.content.split('\n').map((line, i) => (
                <div key={i} className="flex">
                  <span className="inline-block w-8 shrink-0 text-right pr-3 text-[var(--color-text-dim)]/50 select-none text-[9px]">
                    {i + 1}
                  </span>
                  <span className="flex-1">{line || '\u00A0'}</span>
                </div>
              ))}
            </pre>
          </div>
        )}

        {preview.type === 'image' && preview.content && (
          <div className="flex items-center justify-center p-4 bg-[var(--color-surface-0)]">
            <img
              src={preview.content}
              alt={fileName}
              className="max-w-full max-h-[50vh] object-contain rounded"
              draggable={false}
            />
          </div>
        )}

        {preview.type === 'binary' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText size={32} className="text-[var(--color-text-dim)]" />
            <div className="text-center">
              <div className="text-[var(--color-text-secondary)] text-[11px]">binary file</div>
              {preview.size !== undefined && (
                <div className="text-[var(--color-text-dim)] text-[10px] mt-1">
                  {formatBytes(preview.size)}
                </div>
              )}
              {preview.mimeType && (
                <div className="text-[var(--color-text-dim)] text-[10px]">
                  {preview.mimeType}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenFull}
              className={cn(
                'mt-2 px-3 py-1.5 rounded text-[10px]',
                'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]',
                'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                'transition-colors border border-[var(--color-border-subtle)]/40',
              )}
            >
              open in editor
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      {preview.type === 'text' && (
        <div className="px-3 py-1.5 border-t border-[var(--color-border-subtle)]/40 flex items-center justify-between text-[9px] text-[var(--color-text-dim)] shrink-0">
          <span>
            {preview.content?.split('\n').length ?? 0} lines
          </span>
          <span className="flex items-center gap-2">
            {preview.encoding && <span>{preview.encoding}</span>}
            {preview.lineEnding && <span>{preview.lineEnding}</span>}
            <button
              type="button"
              onClick={handleOpenFull}
              className="text-[var(--color-accent-primary)] hover:underline cursor-pointer"
            >
              open full file
            </button>
          </span>
        </div>
      )}
    </div>
  );
});

FilePreviewPanel.displayName = 'FilePreviewPanel';
