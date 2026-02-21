/**
 * Session Option Component
 * 
 * Individual session item in the session selector dropdown.
 * Clean, minimal terminal aesthetic with subtle status indicators.
 */
import React, { memo, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

import { cn } from '../../../../utils/cn';
import type { SessionOptionProps } from './types';
import { formatRelativeTime, getStatusLabel, isSessionRunning } from './utils';

export const SessionOption = memo<SessionOptionProps>(function SessionOption({ 
  session, 
  isSelected,
  isFocused,
  onSelect,
  onDelete,
  onFocus,
}) {
  const title = session.title || 'untitled';
  const statusLabel = getStatusLabel(session.status);
  const isRunning = isSessionRunning(session.status);
  const optionRef = useRef<HTMLDivElement>(null);
  
  // Scroll into view when focused via keyboard
  useEffect(() => {
    if (isFocused && optionRef.current) {
      optionRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);
  
  const handleMouseEnter = () => {
    onFocus();
  };
  
  return (
    <div
      ref={optionRef}
      role="option"
      id={`session-option-${session.id}`}
      aria-selected={isSelected}
      tabIndex={-1}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 text-left font-mono group cursor-pointer",
        "transition-colors duration-75",
        isSelected 
          ? "bg-[var(--color-accent-primary)]/10" 
          : "hover:bg-[var(--color-surface-2)]/50",
        isFocused && !isSelected && "bg-[var(--color-surface-2)]/60",
        'focus-visible:outline-none'
      )}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Status indicator - text style */}
      <div className="w-3 flex justify-center flex-shrink-0">
        {isSelected ? (
          <span className="text-[8px] font-mono text-[var(--color-accent-primary)]">&#x25CF;</span>
        ) : (
          <span className="text-[8px] font-mono text-[var(--color-text-dim)]/40">&#x25CB;</span>
        )}
      </div>
      
      {/* Session title */}
      <span className={cn(
        "text-[10px] truncate flex-1 min-w-0",
        isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"
      )}>
        {title}
      </span>
      
      {/* Metadata row */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Status text - only for non-running, non-idle */}
        {statusLabel && statusLabel !== 'idle' && !isRunning && (
          <span className={cn(
            "text-[8px]",
            statusLabel === 'active' 
              ? "text-[var(--color-success)]" 
              : statusLabel === 'error'
                ? "text-[var(--color-error)]"
                : "text-[var(--color-warning)]"
          )}>
            {statusLabel}
          </span>
        )}
        
        {/* Time */}
        <span className="text-[8px] text-[var(--color-text-dim)] tabular-nums">
          {formatRelativeTime(session.updatedAt)}
        </span>
        
        {/* Delete button */}
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            "p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100",
            "text-[var(--color-text-muted)] hover:text-[var(--color-error)]",
            "transition-opacity duration-75",
            "focus-visible:outline-none focus-visible:opacity-100"
          )}
          title="Delete session"
          aria-label="Delete session"
        >
          <Trash2 size={9} />
        </button>
      </div>
    </div>
  );
});

export default SessionOption;

