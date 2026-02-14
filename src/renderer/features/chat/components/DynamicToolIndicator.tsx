/**
 * DynamicToolIndicator - Badge for dynamically created tools
 * 
 * Shows:
 * - Badge indicating tool was dynamically created
 * - Tooltip with tool info
 * - Lifecycle state with smooth transitions
 */
import React, { memo, useState } from 'react';
import { cn } from '../../../utils/cn';

interface DynamicToolIndicatorProps {
  toolName: string;
  createdBy?: string;
  usageCount?: number;
  successRate?: number;
  status?: 'active' | 'disabled' | 'deprecated';
  className?: string;
}

const DynamicToolIndicatorComponent: React.FC<DynamicToolIndicatorProps> = ({
  toolName,
  createdBy,
  usageCount = 0,
  successRate = 100,
  status = 'active',
  className,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusConfig = {
    active: {
      color: 'var(--color-accent)',
      bgColor: 'var(--color-accent)',
      label: 'Active',
    },
    disabled: {
      color: 'var(--color-text-dim)',
      bgColor: 'var(--color-surface-3)',
      label: 'Disabled',
    },
    deprecated: {
      color: 'var(--color-warning)',
      bgColor: 'var(--color-warning)',
      label: 'Deprecated',
    },
  }[status];

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
          'transition-all duration-200 cursor-help',
          status === 'active'
            ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
            : status === 'deprecated'
            ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
            : 'bg-[var(--color-surface-3)] text-[var(--color-text-dim)]',
          'hover:scale-105 active:scale-95'
        )}
        aria-label={`Dynamic tool: ${toolName}`}
      >
        {/* Lightning icon */}
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span>Dynamic</span>
      </button>

      {/* Tooltip with enter animation */}
      {showTooltip && (
        <div
          className={cn(
            'absolute bottom-full left-0 mb-1 z-50',
            'w-48 p-2 rounded-lg shadow-lg',
            'bg-[var(--color-surface-1)] border border-[var(--color-border)]',
            'text-[10px] text-[var(--color-text-secondary)]',
            'animate-fade-in'
          )}
        >
          <div className="font-medium text-[var(--color-text-primary)] mb-1">
            {toolName}
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-dim)]">Status:</span>
              <span
                style={{ color: statusConfig.color }}
                className="font-medium"
              >
                {statusConfig.label}
              </span>
            </div>
            
            {createdBy && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-dim)]">Created by:</span>
                <span className="truncate ml-2">{createdBy}</span>
              </div>
            )}
            
            <div className="flex justify-between">
              <span className="text-[var(--color-text-dim)]">Usage:</span>
              <span className="tabular-nums">{usageCount} calls</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-[var(--color-text-dim)]">Success rate:</span>
              <span
                className={cn(
                  'tabular-nums transition-colors duration-200',
                  successRate >= 90
                    ? 'text-[var(--color-success)]'
                    : successRate >= 70
                    ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-error)]'
                )}
              >
                {successRate.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-dim)]">
            This tool was created dynamically during the session
          </div>

          {/* Arrow */}
          <div
            className={cn(
              'absolute -bottom-1 left-3 w-2 h-2 rotate-45',
              'bg-[var(--color-surface-1)] border-r border-b border-[var(--color-border)]'
            )}
          />
        </div>
      )}
    </div>
  );
};

export const DynamicToolIndicator = memo(DynamicToolIndicatorComponent);
DynamicToolIndicator.displayName = 'DynamicToolIndicator';