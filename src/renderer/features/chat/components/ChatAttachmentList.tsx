/**
 * Chat Attachment List Component
 * 
 * Displays attached files with removal capability.
 * 
 * #### Features
 * - Compact file display with index numbers
 * - Image thumbnails for pasted/attached images
 * - File names with truncation for long names
 * - Remove button (X) on hover
 * - Terminal-style monospace rendering
 * - Responsive width for different screen sizes
 * - Muted color scheme matching terminal aesthetic
 * 
 * #### Attachment Display
 * Each attachment shows:
 * - Index number in brackets (e.g., [0], [1])
 * - Thumbnail preview for images
 * - File name (truncated if too long)
 * - File size indicator
 * - Remove button on hover
 * - Responsive sizing (100px mobile → 160px desktop)
 * 
 * @example
 * <ChatAttachmentList
 *   attachments={[
 *     { id: '1', name: 'config.ts', mimeType: 'text/typescript' },
 *     { id: '2', name: 'screenshot.png', mimeType: 'image/png', content: 'base64...' }
 *   ]}
 *   onRemove={(id) => removeAttachment(id)}
 * />
 */
import React, { useMemo } from 'react';
import { X, Image, FileCode, FileText, File } from 'lucide-react';
import type { AttachmentPayload } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

/**
 * Props for ChatAttachmentList component
 */
interface ChatAttachmentListProps {
  attachments: AttachmentPayload[];
  onRemove: (id: string) => void;
  /** Visual density preset for where the list is rendered */
  variant?: 'default' | 'strip';
}

/**
 * Check if a MIME type represents an image
 */
const isImageMimeType = (mimeType: string): boolean => {
  return mimeType?.startsWith('image/') ?? false;
};

/**
 * Check if a MIME type represents a code/text file
 */
const isCodeMimeType = (mimeType: string): boolean => {
  return (
    mimeType?.startsWith('text/') ||
    mimeType?.includes('javascript') ||
    mimeType?.includes('json') ||
    mimeType?.includes('xml') ||
    mimeType?.includes('yaml')
  ) ?? false;
};

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * Get the appropriate icon for a file type
 */
const FileIcon: React.FC<{ mimeType: string }> = ({ mimeType }) => {
  if (isImageMimeType(mimeType)) {
    return <Image size={10} className="text-[var(--color-accent-secondary)]" />;
  }
  if (isCodeMimeType(mimeType)) {
    return <FileCode size={10} className="text-[var(--color-accent-primary)]" />;
  }
  if (mimeType?.startsWith('text/')) {
    return <FileText size={10} className="text-[var(--color-text-muted)]" />;
  }
  return <File size={10} className="text-[var(--color-text-muted)]" />;
};

/**
 * Single attachment item component
 */
const AttachmentItem: React.FC<{
  attachment: AttachmentPayload;
  index: number;
  onRemove: (id: string) => void;
  variant: 'default' | 'strip';
}> = ({ attachment, index, onRemove, variant }) => {
  const isImage = isImageMimeType(attachment.mimeType);
  
  // Generate image thumbnail URL for preview (default variant only)
  const thumbnailUrl = useMemo(() => {
    if (variant !== 'default') return null;
    if (!isImage || !attachment.content) return null;
    return `data:${attachment.mimeType};base64,${attachment.content}`;
  }, [variant, isImage, attachment.mimeType, attachment.content]);

  const sizeLabel = attachment.size > 0 ? formatFileSize(attachment.size) : undefined;
  const title = sizeLabel ? `${attachment.name} (${sizeLabel})` : attachment.name;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5",
        variant === 'strip'
          ? 'h-7 px-1.5 py-0.5'
          : 'h-auto min-h-[24px] px-2 py-1',
        'font-mono',
        "text-[10px] text-[var(--color-text-muted)]",
        "bg-[var(--color-surface-2)]/50 rounded",
        "border border-[var(--color-border-subtle)]/50",
        "hover:border-[var(--color-border-subtle)] transition-colors"
      )}
      title={title}
    >
      {/* Image thumbnail or file icon */}
      {thumbnailUrl ? (
        <div className="flex-shrink-0 w-6 h-6 rounded overflow-hidden bg-[var(--color-surface-3)]">
          <img
            src={thumbnailUrl}
            alt={attachment.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <FileIcon mimeType={attachment.mimeType} />
      )}

      {/* File info */}
      <div className={cn('min-w-0', variant === 'strip' ? 'flex items-center gap-1' : 'flex flex-col')}>
        <span
          className={cn(
            'text-[var(--color-text-secondary)] truncate',
            variant === 'strip' ? 'max-w-[140px]' : 'max-w-[100px] sm:max-w-[140px]'
          )}
        >
          {attachment.name}
        </span>
        {variant === 'default' && attachment.size > 0 && (
          <span className="text-[8px] text-[var(--color-text-dim)]">
            {formatFileSize(attachment.size)}
          </span>
        )}
      </div>

      {/* Index badge */}
      <span className="text-[8px] text-[var(--color-text-dim)] opacity-60">[{index}]</span>

      {/* Remove button */}
      <button
        type="button"
        className={cn(
          "ml-auto text-[var(--color-text-dim)] hover:text-[var(--color-error)]",
          variant === 'strip'
            ? 'opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
          "transition-opacity p-0.5 rounded-sm",
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
        onClick={() => onRemove(attachment.id)}
        title="Remove attachment"
        aria-label={`Remove attachment ${attachment.name}`}
      >
        <X size={12} />
      </button>
    </div>
  );
};

/**
 * Chat Attachment List - Displays compact file attachments with removal
 */
export const ChatAttachmentList: React.FC<ChatAttachmentListProps> = ({ attachments, onRemove, variant = 'default' }) => {
  if (attachments.length === 0) return null;

  if (variant === 'strip') {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5',
          'overflow-x-auto overflow-y-hidden',
          'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]',
          'py-0.5'
        )}
        aria-label={`${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`}
      >
        {attachments.map((attachment, idx) => (
          <div key={attachment.id} className="flex-shrink-0">
            <AttachmentItem
              attachment={attachment}
              index={idx}
              onRemove={onRemove}
              variant={variant}
            />
          </div>
        ))}
      </div>
    );
  }

  // Separate images and other files for better organization
  const imageAttachments = attachments.filter(a => isImageMimeType(a.mimeType));
  const otherAttachments = attachments.filter(a => !isImageMimeType(a.mimeType));

  return (
    <div className="flex flex-col gap-2 pb-2">
      {/* Image attachments with larger thumbnails */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageAttachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              index={attachments.indexOf(attachment)}
              onRemove={onRemove}
              variant={variant}
            />
          ))}
        </div>
      )}

      {/* Other file attachments */}
      {otherAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {otherAttachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              index={attachments.indexOf(attachment)}
              onRemove={onRemove}
              variant={variant}
            />
          ))}
        </div>
      )}
    </div>
  );
};
