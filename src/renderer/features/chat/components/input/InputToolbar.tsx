/**
 * Input Toolbar Component
 * 
 * Clean, organized toolbar with essential actions:
 * - Model selector
 * - File attach, auto-confirm toggle
 * - Stats: Cost, context usage
 * 
 * Performance optimizations:
 * - Memoized sub-components
 * - Stable callback references
 * - Minimal re-renders through proper prop structuring
 */
import React, { memo, useCallback, useMemo } from 'react';
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
  /** Active provider being used for current run (when running) */
  activeProvider?: string;
  /** Active model being used for current run (when running) */
  activeModelId?: string;
  /** Whether agent is currently working */
  isWorking?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Format token count for display */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/** Format model ID for display (shorten long model names) */
function formatModelId(id: string): string {
  // Remove provider prefix if present (e.g., "openai/gpt-4" -> "gpt-4")
  const withoutPrefix = id.split('/').pop() || id;
  // For long model names, take first 3 segments
  const parts = withoutPrefix.split('-');
  if (parts.length > 3) {
    return parts.slice(0, 3).join('-');
  }
  return withoutPrefix;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Divider component for visual separation */
const ToolbarDivider: React.FC = memo(() => (
  <span className="h-2 w-px bg-[var(--color-border-subtle)]/60 flex-shrink-0" aria-hidden="true" />
));
ToolbarDivider.displayName = 'ToolbarDivider';

/** Compact context indicator - CLI style */
const ContextIndicator: React.FC<{
  info: NonNullable<InputToolbarProps['contextInfo']>;
}> = memo(({ info }) => {
  const pct = useMemo(() => 
    Math.min(100, Math.max(0, Math.round(info.utilization * 100))),
    [info.utilization]
  );
  
  const valueColor = info.needsPruning
    ? 'text-[var(--color-error)]'
    : info.isWarning
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-text-secondary)]';

  const tooltip = useMemo(() => [
    `Context: ${pct}%`,
    `${formatTokenCount(info.totalTokens)} / ${formatTokenCount(info.maxInputTokens)}`,
    info.needsPruning ? '[!] Pruning needed' : info.isWarning ? '[!] Near limit' : '',
  ].filter(Boolean).join('\n'), [pct, info.totalTokens, info.maxInputTokens, info.needsPruning, info.isWarning]);

  return (
    <span 
      className="flex items-center gap-0.5 transition-colors duration-150"
      title={tooltip}
    >
      <span className="text-[var(--color-text-dim)]">ctx=</span>
      <span className={cn(valueColor)}>{pct}%</span>
    </span>
  );
});
ContextIndicator.displayName = 'ContextIndicator';

/** File attach button */
interface AttachButtonProps {
  onClick: () => void;
  disabled: boolean;
}

const AttachButton: React.FC<AttachButtonProps> = memo(({ onClick, disabled }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!disabled) {
      onClick();
    }
  }, [onClick, disabled]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 text-[10px] font-mono whitespace-nowrap',
        'transition-all duration-150',
        'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
        'rounded-md py-0.5 px-1',
        'hover:bg-[var(--color-surface-2)]/50',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
      title="Attach file (drag & drop or paste also supported)"
      aria-label="Attach file"
    >
      <Paperclip size={10} className="text-[var(--color-text-muted)]" aria-hidden="true" />
      <span className="hidden sm:inline text-[var(--color-text-secondary)]">file</span>
    </button>
  );
});
AttachButton.displayName = 'AttachButton';

/** Auto-confirm toggle button */
interface AutoConfirmToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}

const AutoConfirmToggle: React.FC<AutoConfirmToggleProps> = memo(({ enabled, onToggle, disabled }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!disabled) {
      onToggle();
    }
  }, [onToggle, disabled]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={enabled}
      aria-label={enabled ? 'Disable auto-confirm mode' : 'Enable auto-confirm mode'}
      className={cn(
        'flex items-center gap-1 text-[10px] font-mono whitespace-nowrap',
        'transition-all duration-150',
        'rounded-md py-0.5 px-1',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
        enabled 
          ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/5 hover:bg-[var(--color-warning)]/10' 
          : 'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/50',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
      )}
      title={enabled ? 'Auto-confirm ON (click to disable)' : 'Auto-confirm OFF (click to enable)'}
    >
      <span className="text-[var(--color-accent-secondary)]">--auto</span>
      <span className={cn(
        'transition-colors duration-150',
        enabled ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--color-text-secondary)]'
      )}>
        ={enabled ? 'on' : 'off'}
      </span>
    </button>
  );
});
AutoConfirmToggle.displayName = 'AutoConfirmToggle';

/** Active run indicator */
interface ActiveRunIndicatorProps {
  provider: string;
  modelId?: string;
}

const ActiveRunIndicator: React.FC<ActiveRunIndicatorProps> = memo(({ provider, modelId }) => (
  <span 
    className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-accent-primary)] whitespace-nowrap animate-in fade-in duration-200"
    title={`Running: ${provider}${modelId ? ` / ${modelId}` : ''}`}
  >
    <span className="text-[var(--color-text-dim)]">run=</span>
    <span>{provider}</span>
    {modelId && (
      <>
        <span className="text-[var(--color-text-dim)]">/</span>
        <span className="text-[var(--color-text-secondary)]">{formatModelId(modelId)}</span>
      </>
    )}
  </span>
));
ActiveRunIndicator.displayName = 'ActiveRunIndicator';

/** Cost display */
interface CostDisplayProps {
  formattedCost: string;
  detailsTitle?: string;
}

const CostDisplay: React.FC<CostDisplayProps> = memo(({ formattedCost, detailsTitle }) => (
  <span title={detailsTitle} className="flex items-center gap-0.5 transition-colors duration-150">
    <span className="text-[var(--color-text-dim)]">cost=</span>
    <span className="text-[var(--color-success)]">{formattedCost}</span>
  </span>
));
CostDisplay.displayName = 'CostDisplay';

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
  isWorking,
}) => {
  // Memoize disabled states
  const isActionDisabled = useMemo(() => disabled || !hasWorkspace, [disabled, hasWorkspace]);
  const isModelDisabled = useMemo(() => disabled || !hasSession || !hasWorkspace, [disabled, hasSession, hasWorkspace]);
  
  // Memoize disabled reason
  const disabledReason = useMemo(() => {
    if (!hasWorkspace) return 'Select workspace first';
    if (!hasSession) return 'Start session first';
    return undefined;
  }, [hasWorkspace, hasSession]);

  return (
    <div 
      className={cn('flex items-center gap-1.5 min-w-0 text-[9px]', className)}
      role="toolbar"
      aria-label="Chat input options"
    >
      {/* Model Selector - CLI style: model=value */}
      <ModelSelector 
        currentProvider={provider}
        currentModel={modelId}
        onSelect={onProviderSelect} 
        disabled={isModelDisabled}
        disabledReason={disabledReason}
        availableProviders={availableProviders}
        providersCooldown={providersCooldown}
      />

      {/* Active provider info when running */}
      {isWorking && activeProvider && (
        <>
          <ToolbarDivider />
          <ActiveRunIndicator provider={activeProvider} modelId={activeModelId} />
        </>
      )}

      {/* Divider */}
      <ToolbarDivider />

      {/* File Attach */}
      <AttachButton onClick={onAddAttachments} disabled={isActionDisabled} />

      {/* Auto-confirm Toggle */}
      <AutoConfirmToggle enabled={yoloEnabled} onToggle={onToggleYolo} disabled={isModelDisabled} />

      {/* Stats - Right aligned, CLI style */}
      <div className="hidden md:flex items-center gap-2.5 ml-auto text-[9px] font-mono text-[var(--color-text-muted)]">
        {costInfo?.hasUsage && (
          <CostDisplay formattedCost={costInfo.formattedCost} detailsTitle={costInfo.detailsTitle} />
        )}
        {contextInfo && <ContextIndicator info={contextInfo} />}
      </div>
    </div>
  );
});

InputToolbar.displayName = 'InputToolbar';
