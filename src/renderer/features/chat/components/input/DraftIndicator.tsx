/**
 * Draft Indicator Component
 * 
 * Visual indicator showing draft save status.
 * Displays: saving, saved, restored, or error states.
 * 
 * @example
 * <DraftIndicator status="saved" lastSavedAt={Date.now()} />
 */
import React, { memo, useMemo } from 'react';
import { Save, Check, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { formatRelativeTime } from '../../../../utils/timeFormatting';
import type { DraftStatus } from '../../hooks/useDraftMessage';

// =============================================================================
// Types
// =============================================================================

export interface DraftIndicatorProps {
  /** Current draft status */
  status: DraftStatus;
  /** Timestamp of last save */
  lastSavedAt?: number | null;
  /** Whether to show the indicator */
  visible?: boolean;
  /** Additional className */
  className?: string;
}

// =============================================================================
// Status Config
// =============================================================================

interface StatusConfig {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  color: string;
  animate?: boolean;
}

const STATUS_CONFIG: Record<DraftStatus, StatusConfig> = {
  idle: {
    icon: Save,
    label: 'draft',
    color: 'text-[var(--color-text-muted)]',
  },
  saving: {
    icon: Loader2,
    label: 'saving...',
    color: 'text-[var(--color-info)]',
    animate: true,
  },
  saved: {
    icon: Check,
    label: 'saved',
    color: 'text-[var(--color-success)]',
  },
  restored: {
    icon: RotateCcw,
    label: 'restored',
    color: 'text-[var(--color-info)]',
  },
  error: {
    icon: AlertCircle,
    label: 'error',
    color: 'text-[var(--color-error)]',
  },
};

// =============================================================================
// Main Component
// =============================================================================

export const DraftIndicator: React.FC<DraftIndicatorProps> = memo(({
  status,
  lastSavedAt,
  visible = true,
  className,
}) => {
  // Format saved time - must be before early return
  const timeDisplay = useMemo(() => {
    if (!lastSavedAt) return null;
    return formatRelativeTime(lastSavedAt);
  }, [lastSavedAt]);

  // Don't render if idle with no saved time, or not visible
  if (!visible || (status === 'idle' && !lastSavedAt)) {
    return null;
  }

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-[9px] font-mono',
        'transition-all duration-200',
        config.color,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Draft ${config.label}${timeDisplay ? `, ${timeDisplay}` : ''}`}
    >
      <Icon
        size={9}
        className={cn(
          'flex-shrink-0',
          config.animate && 'animate-spin'
        )}
        aria-hidden="true"
      />
      
      <span className="hidden sm:inline">
        {config.label}
      </span>

      {status === 'idle' && timeDisplay && (
        <span className="hidden md:inline opacity-60">
          {timeDisplay}
        </span>
      )}
    </div>
  );
});

DraftIndicator.displayName = 'DraftIndicator';
