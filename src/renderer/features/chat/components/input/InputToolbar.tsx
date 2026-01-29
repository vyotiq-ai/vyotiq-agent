/**
 * Input Toolbar Component
 * 
 * Clean, organized toolbar with essential actions:
 * - Model selector
 * - File attach, auto-confirm toggle
 * - Stats: Cost, context usage
 */
import React, { memo } from 'react';
import { Paperclip } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { ModelSelector } from '../ModelSelector';
import type { LLMProviderName } from '../../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface InputToolbarProps {
  onAddAttachments: () => void;
  provider: LLMProviderName | 'auto';
  modelId?: string;
  onProviderSelect: (provider: LLMProviderName | 'auto', modelId?: string) => void;
  availableProviders?: LLMProviderName[];
  providersCooldown?: Record<string, { inCooldown: boolean; remainingMs: number; reason: string } | null>;
  yoloEnabled: boolean;
  onToggleYolo: () => void;
  disabled: boolean;
  hasSession: boolean;
  hasWorkspace: boolean;
  messageCount?: number;
  costInfo?: {
    formattedCost: string;
    formattedTokens: string;
    hasUsage: boolean;
    detailsTitle?: string;
  };
  contextInfo?: {
    utilization: number;
    totalTokens: number;
    maxInputTokens: number;
    availableTokens: number;
    isWarning: boolean;
    needsPruning: boolean;
    tokensByRole?: {
      system: number;
      user: number;
      assistant: number;
      tool: number;
    };
  };
  className?: string;
  /** Active provider being used for current iteration (when running) */
  activeProvider?: string;
  /** Active model being used for current iteration (when running) */
  activeModelId?: string;
  /** Current iteration number */
  currentIteration?: number;
  /** Maximum iterations */
  maxIterations?: number;
  /** Whether agent is currently working */
  isWorking?: boolean;
}

// =============================================================================
// Helper Components
// =============================================================================

/** Format token count for display */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/** Compact context indicator - CLI style */
const ContextIndicator: React.FC<{
  info: NonNullable<InputToolbarProps['contextInfo']>;
}> = memo(({ info }) => {
  const pct = Math.min(100, Math.max(0, Math.round(info.utilization * 100)));
  
  const valueColor = info.needsPruning
    ? 'text-[var(--color-error)]'
    : info.isWarning
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-text-secondary)]';

  const tooltip = [
    `Context: ${pct}%`,
    `${formatTokenCount(info.totalTokens)} / ${formatTokenCount(info.maxInputTokens)}`,
    info.needsPruning ? '[!] Pruning needed' : info.isWarning ? '[!] Near limit' : '',
  ].filter(Boolean).join('\n');

  return (
    <span 
      className="flex items-center gap-0.5"
      title={tooltip}
    >
      <span className="text-[var(--color-text-dim)]">ctx=</span>
      <span className={valueColor}>{pct}%</span>
    </span>
  );
});
ContextIndicator.displayName = 'ContextIndicator';

// =============================================================================
// Main Component
// =============================================================================

export const InputToolbar: React.FC<InputToolbarProps> = memo(({
  onAddAttachments,
  provider,
  modelId,
  onProviderSelect,
  availableProviders = [],
  providersCooldown = {},
  yoloEnabled,
  onToggleYolo,
  disabled,
  hasSession,
  hasWorkspace,
  costInfo,
  contextInfo,
  className,
  activeProvider,
  activeModelId,
  currentIteration,
  maxIterations,
  isWorking,
}) => {
  const isActionDisabled = disabled || !hasWorkspace;
  const isModelDisabled = disabled || !hasSession || !hasWorkspace;
  
  // Format model ID for display (shorten long model names)
  const formatModelId = (id: string): string => {
    // Remove provider prefix if present (e.g., "openai/gpt-4" -> "gpt-4")
    const withoutPrefix = id.split('/').pop() || id;
    // For long model names, take first 3 segments
    const parts = withoutPrefix.split('-');
    if (parts.length > 3) {
      return parts.slice(0, 3).join('-');
    }
    return withoutPrefix;
  };
  
  return (
    <div 
      className={cn('flex items-center gap-2 min-w-0', className)}
      role="toolbar"
      aria-label="Chat input options"
    >
      {/* Model Selector - CLI style: model=value */}
      <ModelSelector 
        currentProvider={provider}
        currentModel={modelId}
        onSelect={onProviderSelect} 
        disabled={isModelDisabled}
        disabledReason={!hasWorkspace ? 'Select workspace first' : !hasSession ? 'Start session first' : undefined}
        availableProviders={availableProviders}
        providersCooldown={providersCooldown}
      />

      {/* Active iteration info when running */}
      {isWorking && activeProvider && (
        <>
          <span className="h-3 w-px bg-[var(--color-border-subtle)]" />
          <span 
            className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-accent-primary)] whitespace-nowrap"
            title={`Running: ${activeProvider}${activeModelId ? ` / ${activeModelId}` : ''}`}
          >
            <span className="text-[var(--color-text-dim)]">run=</span>
            <span>{activeProvider}</span>
            {activeModelId && (
              <>
                <span className="text-[var(--color-text-dim)]">/</span>
                <span className="text-[var(--color-text-secondary)]">{formatModelId(activeModelId)}</span>
              </>
            )}
            {currentIteration && maxIterations && (
              <span className="text-[var(--color-text-muted)] ml-1">
                [{currentIteration}/{maxIterations}]
              </span>
            )}
          </span>
        </>
      )}

      {/* Divider */}
      <span className="h-3 w-px bg-[var(--color-border-subtle)]" />

      {/* File Attach - CLI style */}
      <button
        type="button"
        onClick={onAddAttachments}
        disabled={isActionDisabled}
        className={cn(
          'flex items-center gap-1 text-[10px] font-mono transition-colors whitespace-nowrap',
          'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
          'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
          isActionDisabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        title="Attach file"
      >
        <Paperclip size={10} className="text-[var(--color-text-muted)]" />
        <span className="hidden sm:inline text-[var(--color-text-secondary)]">file</span>
      </button>

      {/* Auto-confirm Toggle - CLI style: --auto=on/off */}
      <button
        type="button"
        onClick={onToggleYolo}
        disabled={isModelDisabled}
        className={cn(
          'flex items-center gap-1 text-[10px] font-mono transition-colors whitespace-nowrap',
          'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
          yoloEnabled 
            ? 'text-[var(--color-warning)]' 
            : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
          isModelDisabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        title={yoloEnabled ? 'Auto-confirm ON (click to disable)' : 'Auto-confirm OFF (click to enable)'}
      >
        <span className="text-[var(--color-accent-secondary)]">--auto</span>
        <span className={yoloEnabled ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'}>
          ={yoloEnabled ? 'on' : 'off'}
        </span>
      </button>

      {/* Stats - Right aligned, CLI style */}
      <div className="hidden md:flex items-center gap-2 ml-auto text-[10px] font-mono text-[var(--color-text-muted)]">
        {costInfo?.hasUsage && (
          <span title={costInfo.detailsTitle}>
            <span className="text-[var(--color-text-dim)]">cost=</span>
            <span className="text-[var(--color-success)]">{costInfo.formattedCost}</span>
          </span>
        )}
        {contextInfo && <ContextIndicator info={contextInfo} />}
      </div>
    </div>
  );
});

InputToolbar.displayName = 'InputToolbar';
