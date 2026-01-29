/**
 * Input Drop Zone Component
 * 
 * Overlay for drag-and-drop file attachment functionality.
 * Shows visual feedback when dragging files over the input area.
 * 
 * @example
 * <InputDropZone isActive={isDragging} />
 */
import React, { memo } from 'react';
import { Paperclip, Upload } from 'lucide-react';
import { cn } from '../../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface InputDropZoneProps {
  /** Whether drag is currently active */
  isActive: boolean;
  /** Custom className */
  className?: string;
}

// =============================================================================
// Main Component
// =============================================================================

export const InputDropZone: React.FC<InputDropZoneProps> = memo(({
  isActive,
  className,
}) => {
  if (!isActive) return null;
  
  return (
    <div 
      className={cn(
        'absolute inset-0 z-50',
        'flex flex-col items-center justify-center gap-2',
        'bg-[var(--color-surface-editor)]/95',
        'border-2 border-dashed border-[var(--color-accent-primary)]/40',
        'transition-all duration-200',
        'rounded-lg',
        className
      )}
      role="region"
      aria-label="Drop files here to attach"
    >
      <div className="flex items-center gap-2 text-[var(--color-accent-primary)]">
        <Paperclip size={16} className="opacity-70" aria-hidden="true" />
        <Upload size={20} className="animate-float" aria-hidden="true" />
      </div>
      <span className="font-mono text-xs text-[var(--color-accent-primary)]">
        drop files to attach
      </span>
      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
        images, code files, documents
      </span>
    </div>
  );
});

InputDropZone.displayName = 'InputDropZone';
