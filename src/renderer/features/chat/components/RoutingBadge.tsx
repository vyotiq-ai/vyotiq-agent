/**
 * Routing Badge Component
 * 
 * Displays the task-based routing decision on assistant messages.
 * Shows which model was selected and why, with confidence indicator.
 */
import React, { memo, useState } from 'react';
import { 
  Layout, 
  Server, 
  Bug, 
  Search, 
  Map, 
  FileText, 
  TestTube, 
  Cloud, 
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
} from 'lucide-react';
import type { RoutingTaskType } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

// Icon mapping for task types
const TASK_ICONS: Record<string, React.ReactNode> = {
  frontend: <Layout size={10} />,
  backend: <Server size={10} />,
  debugging: <Bug size={10} />,
  analysis: <Search size={10} />,
  planning: <Map size={10} />,
  documentation: <FileText size={10} />,
  testing: <TestTube size={10} />,
  devops: <Cloud size={10} />,
  general: <MessageSquare size={10} />,
};

// Color mapping for task types
const TASK_COLORS: Record<string, string> = {
  frontend: 'var(--color-info)',
  backend: 'var(--color-success)',
  debugging: 'var(--color-error)',
  analysis: 'var(--color-warning)',
  planning: 'var(--color-accent-primary)',
  documentation: 'var(--color-text-secondary)',
  testing: 'var(--color-info)',
  devops: 'var(--color-success)',
  general: 'var(--color-text-muted)',
};

// Friendly task names
const TASK_NAMES: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  debugging: 'Debug',
  analysis: 'Analysis',
  planning: 'Planning',
  documentation: 'Docs',
  testing: 'Testing',
  devops: 'DevOps',
  general: 'General',
};

interface RoutingBadgeProps {
  /** Detected task type */
  taskType: RoutingTaskType | string;
  /** Selected provider name */
  provider: string;
  /** Selected model ID */
  model?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for the routing decision */
  reason?: string;
  /** Whether fallback was used */
  usedFallback?: boolean;
  /** Original provider if fallback was used */
  originalProvider?: string;
  /** Whether to show expanded details */
  expandable?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

export const RoutingBadge: React.FC<RoutingBadgeProps> = memo(({
  taskType,
  provider,
  model,
  confidence,
  reason,
  usedFallback,
  originalProvider,
  expandable = true,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const taskColor = TASK_COLORS[taskType] ?? 'var(--color-text-muted)';
  const taskIcon = TASK_ICONS[taskType] ?? <Zap size={10} />;
  const taskName = TASK_NAMES[taskType] ?? taskType;
  
  // Format confidence as percentage
  const confidencePercent = Math.round(confidence * 100);
  
  // Get short model name
  const shortModel = model?.split('-').slice(-2).join('-') || '';
  
  if (compact) {
    return (
      <span 
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono',
          'bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]',
          'text-[var(--color-text-muted)]'
        )}
        style={{ borderColor: `${taskColor}20` }}
        title={reason || `${taskName} task routed to ${provider}${model ? ` (${model})` : ''}`}
      >
        <span style={{ color: taskColor }}>{taskIcon}</span>
        <span>{taskName}</span>
        {usedFallback && <RefreshCw size={8} className="text-[var(--color-warning)]" />}
      </span>
    );
  }
  
  return (
    <div className={cn(
      'inline-flex flex-col font-mono text-[9px]',
      'bg-[var(--color-surface-2)]/30 rounded border border-[var(--color-border-subtle)]',
      'transition-all duration-150'
    )}>
      {/* Header - always visible */}
      <button
        onClick={() => expandable && setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1',
          'hover:bg-[var(--color-surface-2)]/50 transition-colors',
          !expandable && 'cursor-default'
        )}
      >
        <span style={{ color: taskColor }}>{taskIcon}</span>
        <span className="text-[var(--color-text-secondary)]">{taskName}</span>
        <span className="text-[var(--color-text-dim)]">→</span>
        <span className="text-[var(--color-text-primary)]">{provider}</span>
        {shortModel && (
          <span className="text-[var(--color-text-muted)] truncate max-w-[80px]">
            {shortModel}
          </span>
        )}
        {usedFallback && (
          <span title="Fallback used">
            <RefreshCw size={8} className="text-[var(--color-warning)]" />
          </span>
        )}
        <span 
          className={cn(
            'px-1 rounded text-[8px]',
            confidencePercent >= 80 ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' :
            confidencePercent >= 60 ? 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]' :
            'bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)]'
          )}
        >
          {confidencePercent}%
        </span>
        {expandable && (
          expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />
        )}
      </button>
      
      {/* Expanded details */}
      {expanded && (
        <div className="px-2 py-1.5 border-t border-[var(--color-border-subtle)] space-y-1">
          {model && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-dim)]">model:</span>
              <span className="text-[var(--color-text-secondary)]">{model}</span>
            </div>
          )}
          {reason && (
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-text-dim)] flex-shrink-0">reason:</span>
              <span className="text-[var(--color-text-muted)]">{reason}</span>
            </div>
          )}
          {usedFallback && originalProvider && (
            <div className="flex items-center gap-2 text-[var(--color-warning)]">
              <RefreshCw size={8} />
              <span>Fallback from {originalProvider}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

RoutingBadge.displayName = 'RoutingBadge';
