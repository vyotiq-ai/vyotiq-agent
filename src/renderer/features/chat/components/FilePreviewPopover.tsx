/**
 * File Preview Popover Component
 * 
 * Displays a rich file preview on hover for uploaded/attached files.
 * Renders different previews based on file type:
 * - Images: Scaled image preview with dimensions
 * - Code/Text: Syntax-highlighted code snippet (first ~30 lines)
 * - Binary/Other: File metadata display
 * 
 * Uses portal-based positioning (like the existing Tooltip component)
 * with auto-flip and viewport clamping for reliable placement.
 * 
 * Follows terminal/CLI aesthetic consistent with the rest of the app.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Image, FileCode, FileText, File, Hash, HardDrive, FolderOpen, Eye } from 'lucide-react';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface FilePreviewPopoverProps {
  /** File name */
  name: string;
  /** File path (optional) */
  path?: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** File content (base64 for images, utf-8 text for code) */
  content?: string;
  /** Encoding type */
  encoding?: 'utf-8' | 'base64';
  /** Preview text (short snippet) */
  preview?: string;
  /** Trigger element to wrap */
  children: React.ReactElement;
  /** Preferred placement */
  placement?: 'top' | 'bottom';
  /** Disable the preview popover */
  disabled?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum lines of code to show in preview */
const MAX_PREVIEW_LINES = 25;

/** Maximum characters per line in preview */
const MAX_LINE_LENGTH = 80;

/** Delay before showing preview (ms) */
const SHOW_DELAY = 350;

/** Delay before hiding preview (ms) */
const HIDE_DELAY = 150;

/** Maximum preview image dimension (px) */
const MAX_PREVIEW_IMAGE_SIZE = 280;

// =============================================================================
// Helpers
// =============================================================================

/** Check if a MIME type represents an image */
const isImageMime = (mimeType?: string): boolean => {
  return mimeType?.startsWith('image/') ?? false;
};

/** Check if a MIME type represents a code/text file */
const isTextMime = (mimeType?: string): boolean => {
  return (
    mimeType?.startsWith('text/') ||
    mimeType?.includes('javascript') ||
    mimeType?.includes('json') ||
    mimeType?.includes('xml') ||
    mimeType?.includes('yaml') ||
    mimeType?.includes('typescript') ||
    mimeType?.includes('markdown') ||
    mimeType?.includes('toml') ||
    mimeType?.includes('sql') ||
    mimeType?.includes('graphql')
  ) ?? false;
};

/** Format file size for display */
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Extract file extension from name */
const getExtension = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** Map file extension to language identifier for display */
const EXTENSION_TO_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java',
  cpp: 'C++', c: 'C', cs: 'C#', rb: 'Ruby', php: 'PHP',
  swift: 'Swift', kt: 'Kotlin', html: 'HTML', css: 'CSS',
  scss: 'SCSS', sass: 'Sass', json: 'JSON', yaml: 'YAML',
  yml: 'YAML', toml: 'TOML', xml: 'XML', md: 'Markdown',
  sql: 'SQL', sh: 'Shell', bash: 'Bash', zsh: 'Zsh',
  ps1: 'PowerShell', dockerfile: 'Dockerfile', graphql: 'GraphQL',
  txt: 'Text', log: 'Log', ini: 'INI', cfg: 'Config',
  env: 'Environment', gitignore: 'Git Ignore', vue: 'Vue',
  svelte: 'Svelte', astro: 'Astro', prisma: 'Prisma',
};

/** Get display language from filename */
const getLanguageLabel = (name: string, mimeType: string): string => {
  const ext = getExtension(name);
  if (EXTENSION_TO_LANG[ext]) return EXTENSION_TO_LANG[ext];
  if (mimeType.includes('javascript')) return 'JavaScript';
  if (mimeType.includes('typescript')) return 'TypeScript';
  if (mimeType.includes('json')) return 'JSON';
  if (mimeType.includes('xml')) return 'XML';
  if (mimeType.includes('yaml')) return 'YAML';
  if (mimeType.includes('markdown')) return 'Markdown';
  if (mimeType.startsWith('text/')) return 'Text';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1]?.toUpperCase() ?? 'Image';
  return ext.toUpperCase() || 'File';
};

/** Truncate path for display */
const truncatePath = (path: string, maxLen = 60): string => {
  if (path.length <= maxLen) return path;
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join('/')}`;
};

// =============================================================================
// Position Calculator
// =============================================================================

type Placement = 'top' | 'bottom';

function computePopoverPosition(
  triggerRect: DOMRect,
  popoverRect: DOMRect,
  placement: Placement,
  offset = 8,
): { top: number; left: number } {
  const left = Math.max(
    8,
    Math.min(
      triggerRect.left + (triggerRect.width - popoverRect.width) / 2,
      window.innerWidth - popoverRect.width - 8,
    ),
  );

  if (placement === 'top') {
    return { top: triggerRect.top - popoverRect.height - offset, left };
  }
  return { top: triggerRect.bottom + offset, left };
}

function getPopoverPosition(
  triggerRect: DOMRect,
  popoverRect: DOMRect,
  placement: Placement,
  offset = 8,
): { top: number; left: number } {
  const pos = computePopoverPosition(triggerRect, popoverRect, placement, offset);

  // Auto-flip if overflows top/bottom
  if (placement === 'top' && pos.top < 8) {
    const flipped = computePopoverPosition(triggerRect, popoverRect, 'bottom', offset);
    if (flipped.top + popoverRect.height <= window.innerHeight - 8) {
      return flipped;
    }
  }
  if (placement === 'bottom' && pos.top + popoverRect.height > window.innerHeight - 8) {
    const flipped = computePopoverPosition(triggerRect, popoverRect, 'top', offset);
    if (flipped.top >= 8) {
      return flipped;
    }
  }

  // Clamp to viewport
  return {
    top: Math.max(8, Math.min(pos.top, window.innerHeight - popoverRect.height - 8)),
    left: Math.max(8, Math.min(pos.left, window.innerWidth - popoverRect.width - 8)),
  };
}

// =============================================================================
// Sub-components
// =============================================================================

/** Header row with file type icon and language badge */
const PreviewHeader: React.FC<{
  name: string;
  mimeType: string;
  languageLabel: string;
}> = memo(({ name, mimeType, languageLabel }) => {
  const IconComponent = isImageMime(mimeType)
    ? Image
    : isTextMime(mimeType) || mimeType.startsWith('text/')
      ? FileCode
      : File;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--color-border-subtle)]/50">
      <IconComponent size={12} className="text-[var(--color-accent-primary)] flex-shrink-0" />
      <span className="text-[10px] text-[var(--color-text-primary)] font-medium truncate flex-1 min-w-0">
        {name}
      </span>
      <span className="text-[8px] text-[var(--color-text-dim)] px-1 py-0.5 bg-[var(--color-surface-2)]/60 rounded-sm flex-shrink-0">
        {languageLabel}
      </span>
    </div>
  );
});
PreviewHeader.displayName = 'PreviewHeader';

/** Image preview content */
const ImagePreview: React.FC<{
  content: string;
  mimeType: string;
  name: string;
}> = memo(({ content, mimeType, name }) => {
  const dataUrl = useMemo(
    () => `data:${mimeType};base64,${content}`,
    [content, mimeType],
  );

  return (
    <div className="flex items-center justify-center p-2 bg-[var(--color-surface-1)]/30">
      <img
        src={dataUrl}
        alt={name}
        className="max-w-full object-contain rounded-sm"
        style={{ maxWidth: MAX_PREVIEW_IMAGE_SIZE, maxHeight: MAX_PREVIEW_IMAGE_SIZE }}
        draggable={false}
      />
    </div>
  );
});
ImagePreview.displayName = 'ImagePreview';

/** Code/Text preview content with line numbers */
const CodePreview: React.FC<{
  content: string;
  totalLines: number;
}> = memo(({ content, totalLines }) => {
  const lines = useMemo(() => {
    const allLines = content.split('\n');
    const previewLines = allLines.slice(0, MAX_PREVIEW_LINES);
    return previewLines.map((line) =>
      line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + '...'
        : line,
    );
  }, [content]);

  const hasMore = totalLines > MAX_PREVIEW_LINES;
  const gutterWidth = String(Math.min(totalLines, MAX_PREVIEW_LINES)).length;

  return (
    <div className="overflow-hidden">
      <div className="overflow-y-auto overflow-x-hidden max-h-[280px] scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
        <pre className="text-[10px] leading-[16px] p-0 m-0">
          {lines.map((line, idx) => (
            <div key={idx} className="flex hover:bg-[var(--color-surface-2)]/30 transition-colors">
              <span
                className="select-none text-[var(--color-text-dim)]/50 text-right pr-2 pl-2 flex-shrink-0"
                style={{ minWidth: `${gutterWidth + 2}ch` }}
              >
                {idx + 1}
              </span>
              <span className="text-[var(--color-text-secondary)] whitespace-pre pr-2 min-w-0">
                {line || '\u00A0'}
              </span>
            </div>
          ))}
        </pre>
      </div>
      {hasMore && (
        <div className="px-2.5 py-1 border-t border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-1)]/20">
          <span className="text-[9px] text-[var(--color-text-dim)]">
            {totalLines - MAX_PREVIEW_LINES} more line{totalLines - MAX_PREVIEW_LINES !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
});
CodePreview.displayName = 'CodePreview';

/** Metadata row for the footer */
const MetadataRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = memo(({ icon, label, value }) => (
  <div className="flex items-center gap-1.5">
    {icon}
    <span className="text-[var(--color-text-dim)]">{label}</span>
    <span className="text-[var(--color-text-secondary)]">{value}</span>
  </div>
));
MetadataRow.displayName = 'MetadataRow';

/** Footer with file metadata */
const PreviewFooter: React.FC<{
  size: number;
  path?: string;
  mimeType: string;
  lineCount?: number;
}> = memo(({ size, path, mimeType, lineCount }) => (
  <div className="flex flex-col gap-0.5 px-2.5 py-1.5 border-t border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-1)]/20">
    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-mono">
      <MetadataRow
        icon={<HardDrive size={9} className="text-[var(--color-text-dim)]" />}
        label="size"
        value={formatSize(size)}
      />
      {lineCount !== undefined && lineCount > 0 && (
        <MetadataRow
          icon={<Hash size={9} className="text-[var(--color-text-dim)]" />}
          label="lines"
          value={String(lineCount)}
        />
      )}
      <MetadataRow
        icon={<Eye size={9} className="text-[var(--color-text-dim)]" />}
        label="type"
        value={mimeType.split('/').pop() ?? mimeType}
      />
    </div>
    {path && (
      <div className="flex items-center gap-1.5 text-[9px] font-mono">
        <FolderOpen size={9} className="text-[var(--color-text-dim)] flex-shrink-0" />
        <span className="text-[var(--color-text-dim)] truncate" title={path}>
          {truncatePath(path)}
        </span>
      </div>
    )}
  </div>
));
PreviewFooter.displayName = 'PreviewFooter';

// =============================================================================
// Main Component
// =============================================================================

export const FilePreviewPopover: React.FC<FilePreviewPopoverProps> = memo(({
  name,
  path,
  mimeType,
  size,
  content,
  encoding = 'utf-8',
  preview,
  children,
  placement = 'top',
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve text content for code/text preview
  const textContent = useMemo(() => {
    if (isImageMime(mimeType)) return null;
    if (!isTextMime(mimeType) && !mimeType.startsWith('text/')) return null;

    // Use preview field if available and no full content
    if (preview && !content) return preview;

    if (!content) return null;

    // If base64 encoded text, decode it (handle multi-byte UTF-8 properly)
    if (encoding === 'base64') {
      try {
        const binaryString = atob(content);
        const bytes = Uint8Array.from(binaryString, (ch) => ch.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return null;
      }
    }

    return content;
  }, [mimeType, content, encoding, preview]);

  // Count total lines
  const totalLines = useMemo(() => {
    if (!textContent) return 0;
    return textContent.split('\n').length;
  }, [textContent]);

  // Language label for the header
  const languageLabel = useMemo(() => getLanguageLabel(name, mimeType), [name, mimeType]);

  // Determine what type of preview to show
  const previewType = useMemo((): 'image' | 'code' | 'meta' => {
    if (isImageMime(mimeType) && content) return 'image';
    if (textContent) return 'code';
    return 'meta';
  }, [mimeType, content, textContent]);

  // Update popover position
  const updatePosition = useCallback(() => {
    if (triggerRef.current && popoverRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      setPosition(getPopoverPosition(triggerRect, popoverRect, placement));
    }
  }, [placement]);

  const show = useCallback(() => {
    if (disabled) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, SHOW_DELAY);
  }, [disabled]);

  const hide = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, HIDE_DELAY);
  }, []);

  // Keep popover open when hovering over it (for scrollable content)
  const handlePopoverEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    hide();
  }, [hide]);

  // Update position when visible
  useEffect(() => {
    if (isVisible) {
      // Use rAF to ensure the popover is rendered before measuring
      const raf = requestAnimationFrame(() => {
        updatePosition();
      });

      const handleScroll = () => updatePosition();
      const handleResize = () => updatePosition();

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isVisible, updatePosition]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex flex-shrink-0 no-drag"
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        {children}
      </span>
      {isVisible && createPortal(
        <div
          ref={popoverRef}
          role="tooltip"
          aria-label={`Preview of ${name}`}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 9999,
          }}
          className={cn(
            'w-[320px] max-w-[90vw]',
            'bg-[var(--color-surface-header)] border border-[var(--color-border-subtle)]',
            'rounded-sm shadow-lg shadow-black/40 overflow-hidden',
            'font-mono',
            'animate-in',
          )}
          onPointerEnter={handlePopoverEnter}
          onPointerLeave={handlePopoverLeave}
        >
          {/* Header */}
          <PreviewHeader
            name={name}
            mimeType={mimeType}
            languageLabel={languageLabel}
          />

          {/* Preview content */}
          {previewType === 'image' && content && (
            <ImagePreview content={content} mimeType={mimeType} name={name} />
          )}
          {previewType === 'code' && textContent && (
            <CodePreview content={textContent} totalLines={totalLines} />
          )}
          {previewType === 'meta' && (
            <div className="flex items-center justify-center py-6 px-4">
              <div className="text-center">
                <File size={24} className="text-[var(--color-text-dim)] mx-auto mb-2" />
                <span className="text-[10px] text-[var(--color-text-muted)] block">
                  preview not available
                </span>
              </div>
            </div>
          )}

          {/* Footer with metadata */}
          <PreviewFooter
            size={size}
            path={path}
            mimeType={mimeType}
            lineCount={previewType === 'code' ? totalLines : undefined}
          />
        </div>,
        document.body,
      )}
    </>
  );
});

FilePreviewPopover.displayName = 'FilePreviewPopover';

export default FilePreviewPopover;
