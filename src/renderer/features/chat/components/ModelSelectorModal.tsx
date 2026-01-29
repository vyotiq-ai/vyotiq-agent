/**
 * Model Selector Modal Components
 * 
 * Internal components for the ModelSelector modal:
 * - ModelCard: Individual model display card
 * - ProviderTab: Provider tab button
 * - Tier configuration
 */
import React, { memo } from 'react';
import { Check, Layers, Zap, Crown, Clock, Eye, Wrench } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { ProviderIcon } from '../../../components/ui/ProviderIcons';
import { formatContextWindow, formatCost, type ModelInfo } from '../../../../shared/providers';
import type { LLMProviderName } from '../../../../shared/types';

// =============================================================================
// Tier Configuration
// =============================================================================

export const tierIcons: Record<ModelInfo['tier'], React.ComponentType<{ size?: number; className?: string }>> = {
  flagship: Crown,
  balanced: Layers,
  fast: Zap,
  legacy: Clock,
};

export const tierLabels: Record<ModelInfo['tier'], string> = {
  flagship: 'PRO',
  balanced: 'BAL',
  fast: 'FAST',
  legacy: 'OLD',
};

export const tierColors: Record<ModelInfo['tier'], string> = {
  flagship: 'text-[var(--color-warning)]',
  balanced: 'text-[var(--color-info)]',
  fast: 'text-[var(--color-accent-primary)]',
  legacy: 'text-[var(--color-text-muted)]',
};

// =============================================================================
// Provider Config
// =============================================================================

export interface ProviderConfig {
  id: LLMProviderName | 'auto';
  label: string;
  shortLabel: string;
  color: string;
  description?: string;
}

// =============================================================================
// Model Card Component
// =============================================================================

interface ModelCardProps {
  model: ModelInfo;
  isSelected: boolean;
  onSelect: () => void;
}

export const ModelCard: React.FC<ModelCardProps> = memo(({ model, isSelected, onSelect }) => {
  const TierIcon = tierIcons[model.tier];
  
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full p-2.5 border text-left transition-all duration-100 font-mono",
        isSelected 
          ? "border-[var(--color-accent-primary)]/40 bg-[var(--color-accent-primary)]/10" 
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]/50",
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-medium truncate",
              isSelected ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-primary)]"
            )}>
              {model.name}
            </span>
            <span className={cn("flex items-center gap-0.5 text-[8px]", tierColors[model.tier])}>
              <TierIcon size={8} />
              [{tierLabels[model.tier]}]
            </span>
          </div>
          <div className="text-[8px] text-[var(--color-text-dim)] truncate mt-0.5">{model.id}</div>
        </div>
        {isSelected && <Check size={12} className="text-[var(--color-accent-primary)] flex-shrink-0" />}
      </div>
      
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[8px] text-[var(--color-text-dim)]">
        <span title="Context window size">ctx={formatContextWindow(model.contextWindow)}</span>
        <span className="text-[var(--color-text-placeholder)]">·</span>
        <span title="Input cost per 1M tokens">in={formatCost(model.inputCostPer1M)}</span>
        <span className="text-[var(--color-text-placeholder)]">·</span>
        <span title="Output cost per 1M tokens">out={formatCost(model.outputCostPer1M)}</span>
      </div>
      
      {(model.supportsVision || model.supportsTools) && (
        <div className="flex items-center gap-2 mt-1.5">
          {model.supportsVision && (
            <span className="flex items-center gap-0.5 text-[8px] text-[var(--color-accent-secondary)]" title="Supports image input">
              <Eye size={8} />vision
            </span>
          )}
          {model.supportsTools && (
            <span className="flex items-center gap-0.5 text-[8px] text-[var(--color-info)]" title="Supports function calling">
              <Wrench size={8} />tools
            </span>
          )}
        </div>
      )}
    </button>
  );
});
ModelCard.displayName = 'ModelCard';

// =============================================================================
// Provider Tab Component
// =============================================================================

interface ProviderTabProps {
  provider: ProviderConfig;
  isSelected: boolean;
  isAvailable: boolean;
  modelCount: number;
  onClick: () => void;
  cooldownInfo?: { inCooldown: boolean; remainingMs: number; reason: string } | null;
}

/** Format remaining cooldown time */
function formatCooldownTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

export const ProviderTab: React.FC<ProviderTabProps> = memo(({ 
  provider, isSelected, isAvailable, modelCount, onClick, cooldownInfo
}) => {
  const isInCooldown = cooldownInfo?.inCooldown ?? false;
  const cooldownReason = cooldownInfo?.reason?.split('\n')[0] ?? 'Rate limited';
  
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isAvailable && provider.id !== 'auto'}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-left transition-colors border-b-2",
        isSelected 
          ? "border-[var(--color-accent-primary)] bg-[var(--color-surface-2)]/50" 
          : "border-transparent hover:bg-[var(--color-surface-2)]/30",
        !isAvailable && provider.id !== 'auto' && "opacity-40 cursor-not-allowed",
        isInCooldown && "opacity-70",
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      title={
        isInCooldown 
          ? `${cooldownReason} (${formatCooldownTime(cooldownInfo!.remainingMs)} remaining)`
          : !isAvailable && provider.id !== 'auto' 
            ? 'No API key configured' 
            : provider.description
      }
    >
      <ProviderIcon provider={provider.id} size={14} className={provider.color} />
      <span className={cn(
        "text-[10px]",
        isSelected ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-secondary)]",
        isInCooldown && "text-[var(--color-warning)]"
      )}>
        {provider.shortLabel}
      </span>
      {modelCount > 0 && (
        <span className="text-[8px] text-[var(--color-text-placeholder)]">({modelCount})</span>
      )}
      {isInCooldown && (
        <span className="flex items-center gap-0.5 text-[8px] text-[var(--color-warning)]" title={cooldownReason}>
          <Clock size={8} />
          {formatCooldownTime(cooldownInfo!.remainingMs)}
        </span>
      )}
      {!isAvailable && provider.id !== 'auto' && !isInCooldown && (
        <span className="text-[8px] text-[var(--color-warning)]">!</span>
      )}
    </button>
  );
});
ProviderTab.displayName = 'ProviderTab';
