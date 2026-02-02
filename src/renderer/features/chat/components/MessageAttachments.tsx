/**
 * Message Attachments Component
 * 
 * Displays attachments in chat messages with:
 * - Image previews with lightbox on click
 * - File icons for non-image files
 * - Compact display with file name and size
 * 
 * Used in MessageLine for rendering user message attachments.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Image, FileCode, FileText, File, X, Maximize2 } from 'lucide-react';
import type { AttachmentMetadata } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface MessageAttachmentsProps {
  attachments: AttachmentMetadata[];
  /** Visual style variant */
  variant?: 'inline' | 'block';
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a MIME type represents an image
 */
const isImageMimeType = (mimeType?: string): boolean => {
  return mimeType?.startsWith('image/') ?? false;
};

/**
 * Check if a MIME type represents a code/text file
 */
const isCodeMimeType = (mimeType?: string): boolean => {
  return (
    mimeType?.startsWith('text/') ||
    mimeType?.includes('javascript') ||
    mimeType?.includes('json') ||
    mimeType?.includes('xml') ||
    mimeType?.includes('yaml') ||
    mimeType?.includes('typescript')
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

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Get the appropriate icon for a file type
 */
const FileIcon: React.FC<{ mimeType?: string }> = ({ mimeType }) => {
  if (isImageMimeType(mimeType)) {
    return <Image size={12} className="text-[var(--color-accent-secondary)]" />;
  }
  if (isCodeMimeType(mimeType)) {
    return <FileCode size={12} className="text-[var(--color-accent-primary)]" />;
  }
  if (mimeType?.startsWith('text/')) {
    return <FileText size={12} className="text-[var(--color-text-muted)]" />;
  }
  return <File size={12} className="text-[var(--color-text-muted)]" />;
};

/**
 * Image lightbox modal for viewing full-size images
 */
const ImageLightbox: React.FC<{
  imageUrl: string;
  imageName: string;
  onClose: () => void;
}> = ({ imageUrl, imageName, onClose }) => {
  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-label={`Image preview: ${imageName}`}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-white/70 hover:text-white transition-colors"
          aria-label="Close preview"
        >
          <X size={20} />
        </button>
        <img
          src={imageUrl}
          alt={imageName}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="absolute -bottom-8 left-0 right-0 text-center text-white/70 text-xs font-mono">
          {imageName}
        </div>
      </div>
    </div>
  );
};

/**
 * Single image attachment with thumbnail preview
 */
const ImageAttachment: React.FC<{
  attachment: AttachmentMetadata;
  onExpand: () => void;
}> = ({ attachment, onExpand }) => {
  const thumbnailUrl = useMemo(() => {
    if (!attachment.content) return null;
    return `data:${attachment.mimeType || 'image/png'};base64,${attachment.content}`;
  }, [attachment.content, attachment.mimeType]);

  if (!thumbnailUrl) {
    return <FileAttachment attachment={attachment} />;
  }

  return (
    <button
      onClick={onExpand}
      className={cn(
        'group relative flex-shrink-0 rounded overflow-hidden',
        'border border-[var(--color-border-subtle)]/50',
        'hover:border-[var(--color-accent-primary)]/50 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      title={`${attachment.name} - click to expand`}
      aria-label={`View ${attachment.name} full size`}
    >
      <img
        src={thumbnailUrl}
        alt={attachment.name}
        className="w-16 h-16 object-cover"
      />
      <div className={cn(
        'absolute inset-0 flex items-center justify-center',
        'bg-black/0 group-hover:bg-black/30 transition-colors'
      )}>
        <Maximize2 
          size={14} 
          className="text-white opacity-0 group-hover:opacity-100 transition-opacity" 
        />
      </div>
    </button>
  );
};

/**
 * Single file attachment (non-image)
 */
const FileAttachment: React.FC<{
  attachment: AttachmentMetadata;
}> = ({ attachment }) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1',
        'text-[10px] font-mono',
        'bg-[var(--color-surface-2)]/50 rounded',
        'border border-[var(--color-border-subtle)]/50'
      )}
      title={`${attachment.name} (${formatFileSize(attachment.size)})`}
    >
      <FileIcon mimeType={attachment.mimeType} />
      <span className="text-[var(--color-info)] truncate max-w-[120px]">
        {attachment.name}
      </span>
      <span className="text-[var(--color-text-dim)]">
        {formatFileSize(attachment.size)}
      </span>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const MessageAttachments: React.FC<MessageAttachmentsProps> = ({
  attachments,
  variant = 'block',
}) => {
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const handleImageExpand = useCallback((attachment: AttachmentMetadata) => {
    if (!attachment.content) return;
    const url = `data:${attachment.mimeType || 'image/png'};base64,${attachment.content}`;
    setLightboxImage({ url, name: attachment.name });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxImage(null);
  }, []);

  // Separate images from other files
  const imageAttachments = useMemo(
    () => attachments.filter((a) => isImageMimeType(a.mimeType)),
    [attachments]
  );
  const fileAttachments = useMemo(
    () => attachments.filter((a) => !isImageMimeType(a.mimeType)),
    [attachments]
  );

  if (attachments.length === 0) return null;

  return (
    <>
      <div className={cn(
        'flex flex-wrap gap-2',
        variant === 'inline' ? 'mb-1' : 'mb-2'
      )}>
        {/* Image attachments with thumbnails */}
        {imageAttachments.map((attachment) => (
          <ImageAttachment
            key={attachment.id}
            attachment={attachment}
            onExpand={() => handleImageExpand(attachment)}
          />
        ))}
        
        {/* File attachments */}
        {fileAttachments.map((attachment) => (
          <FileAttachment key={attachment.id} attachment={attachment} />
        ))}
      </div>

      {/* Lightbox modal */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          imageName={lightboxImage.name}
          onClose={handleCloseLightbox}
        />
      )}
    </>
  );
};

export default MessageAttachments;
