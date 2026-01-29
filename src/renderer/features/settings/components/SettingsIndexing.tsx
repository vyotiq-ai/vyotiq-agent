/**
 * SettingsIndexing Component
 * 
 * Settings panel for semantic indexing configuration:
 * - Enable/disable indexing
 * - Auto-indexing settings
 * - File type filters
 * - Exclude patterns
 * - Chunk size configuration
 * - Index statistics and management
 */

import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  Database,
  Search,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  FileCode,
  FolderX,
  Settings2,
  Activity,
  HardDrive,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Info,
  Layers,
  Eye,
  Cpu,
  GitBranch,
  Folder,
  Code,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import { Button } from '../../../components/ui/Button';
import { useSemanticIndex } from '../../../hooks/useSemanticIndex';
import { createLogger } from '../../../utils/logger';
import type { SemanticSettings } from '../../../../shared/types';

const logger = createLogger('SettingsIndexing');

// Log component mount for debugging
logger.debug('SettingsIndexing component loaded');

// =============================================================================
// Types
// =============================================================================

interface SettingsIndexingProps {
  settings: SemanticSettings;
  onChange: (field: keyof SemanticSettings, value: SemanticSettings[keyof SemanticSettings]) => void;
}

// =============================================================================
// Utility Functions
// =============================================================================

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
};

const formatDuration = (ms: number): string => {
  if (ms >= 60000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
};

const formatDate = (timestamp: number | null): string => {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// =============================================================================
// Index Status Component
// =============================================================================

interface IndexStatusProps {
  isReady: boolean;
  stats: ReturnType<typeof useSemanticIndex>['stats'];
  progress: ReturnType<typeof useSemanticIndex>['progress'];
  isLoadingStats: boolean;
  onRefresh: () => void;
  onReindex: () => void;
  onClear: () => void;
  onAbort: () => void;
}

const IndexStatus: React.FC<IndexStatusProps> = memo(({
  isReady,
  stats,
  progress,
  isLoadingStats,
  onRefresh,
  onReindex,
  onClear,
  onAbort,
}) => {
  const [expanded, setExpanded] = useState(true);

  const healthColor = {
    healthy: 'var(--color-success)',
    degraded: 'var(--color-warning)',
    'needs-rebuild': 'var(--color-error)',
    empty: 'var(--color-text-muted)',
  };

  const healthLabel = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    'needs-rebuild': 'Needs Rebuild',
    empty: 'Empty',
  };

  const isIndexing = progress.isIndexing;
  const progressPercent = progress.totalFiles > 0 
    ? Math.round((progress.indexedFiles / progress.totalFiles) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Activity size={10} />
          # Index Status
        </div>
        <ChevronDown
          size={12}
          className={cn(
            "text-[var(--color-text-muted)] transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className={cn(
          "p-3 rounded border animate-in slide-in-from-top-1 fade-in duration-150",
          isReady && stats?.indexHealth === 'healthy'
            ? "bg-[var(--color-success)]/5 border-[var(--color-success)]/20"
            : stats?.indexHealth === 'empty'
            ? "bg-[var(--color-surface-2)]/50 border-[var(--color-border-subtle)]"
            : "bg-[var(--color-warning)]/5 border-[var(--color-warning)]/20"
        )}>
          {/* Model Download Progress */}
          {progress.status === 'downloading-model' && (
            <div className="mb-4 pb-3 border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu size={12} className="text-[var(--color-accent-secondary)] animate-pulse" />
                  <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">
                    {progress.phase || 'Downloading embedding model...'}
                  </span>
                </div>
              </div>
              
              {/* Model download progress bar */}
              <div className="h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden mb-2">
                <div 
                  className="h-full bg-[var(--color-accent-secondary)] transition-all duration-300"
                  style={{ width: `${progress.modelDownloadProgress ?? 0}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-[var(--color-text-muted)]">
                  {progress.modelDownloadFile ? `Downloading: ${progress.modelDownloadFile}` : 'Preparing model...'}
                </span>
                <span className="text-[var(--color-accent-secondary)]">
                  {(progress.modelDownloadProgress ?? 0).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
          
          {/* Indexing Progress */}
          {isIndexing && progress.status !== 'downloading-model' && (
            <div className="mb-4 pb-3 border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="text-[var(--color-accent-primary)] animate-spin" />
                  <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">
                    {progress.phase || 'Indexing in progress...'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAbort}
                  className="h-6 px-2 text-[9px]"
                >
                  <Pause size={10} className="mr-1" />
                  Abort
                </Button>
              </div>
              
              {/* Progress bar */}
              <div className="h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden mb-2">
                <div 
                  className="h-full bg-[var(--color-accent-primary)] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-[var(--color-text-muted)]">
                  {progress.indexedFiles} / {progress.totalFiles} files
                  {progress.totalChunks !== undefined && progress.totalChunks > 0 && (
                    <span className="ml-2 text-[var(--color-text-placeholder)]">
                      ({progress.totalChunks} chunks)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {progress.filesPerSecond !== undefined && progress.filesPerSecond > 0 && (
                    <span className="text-[var(--color-accent-secondary)]">
                      {progress.filesPerSecond.toFixed(1)} files/s
                    </span>
                  )}
                  {progress.estimatedTimeRemaining && (
                    <span className="text-[var(--color-text-muted)]">
                      ~{formatDuration(progress.estimatedTimeRemaining)} remaining
                    </span>
                  )}
                </div>
              </div>
              
              {progress.currentFile && (
                <div className="mt-1 text-[8px] text-[var(--color-text-placeholder)] truncate">
                  {progress.currentFile}
                </div>
              )}
            </div>
          )}

          {/* Statistics */}
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                {isLoadingStats ? (
                  <RefreshCw size={12} className="text-[var(--color-text-muted)] mt-0.5 animate-spin" />
                ) : stats?.indexHealth === 'healthy' ? (
                  <CheckCircle size={12} className="text-[var(--color-success)] mt-0.5 shrink-0" />
                ) : stats?.indexHealth === 'empty' ? (
                  <Database size={12} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle size={12} className="text-[var(--color-warning)] mt-0.5 shrink-0" />
                )}
                
                <div className="text-[9px] leading-relaxed font-mono">
                  {isLoadingStats ? (
                    <p className="text-[var(--color-text-muted)]">Loading statistics...</p>
                  ) : stats ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: healthColor[stats.indexHealth] }}
                        />
                        <span className="text-[var(--color-text-secondary)] font-medium">
                          {healthLabel[stats.indexHealth]}
                        </span>
                      </div>
                      
                      {/* Core Statistics */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5">
                          <FileCode size={9} />
                          <span>{stats.indexedFiles} files</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Layers size={9} />
                          <span>{stats.totalChunks} chunks</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <HardDrive size={9} />
                          <span>{formatBytes(stats.indexSizeBytes)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={9} />
                          <span>{formatDate(stats.lastIndexTime)}</span>
                        </div>
                      </div>

                      {/* Workspace Info */}
                      {stats.workspaceInfo && (
                        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                          <div className="text-[8px] text-[var(--color-text-placeholder)] uppercase tracking-wider mb-1.5">
                            Workspace
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--color-text-muted)]">
                            <div className="flex items-center gap-1.5">
                              <Code size={9} />
                              <span className="capitalize">{stats.workspaceInfo.projectType}</span>
                            </div>
                            {stats.workspaceInfo.framework && (
                              <div className="flex items-center gap-1.5">
                                <GitBranch size={9} />
                                <span className="capitalize">{stats.workspaceInfo.framework}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Folder size={9} />
                              <span>{stats.workspaceInfo.totalFiles} total files</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FileCode size={9} />
                              <span>~{(stats.workspaceInfo.estimatedLinesOfCode / 1000).toFixed(1)}k LoC</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Embedding Info */}
                      {stats.embeddingInfo && (
                        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                          <div className="text-[8px] text-[var(--color-text-placeholder)] uppercase tracking-wider mb-1.5">
                            Embeddings
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--color-text-muted)]">
                            <div className="flex items-center gap-1.5">
                              <Cpu size={9} />
                              <span className={stats.embeddingInfo.isUsingOnnx ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
                                {stats.embeddingInfo.isUsingOnnx ? 'ONNX Model' : 'Fallback Mode'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Layers size={9} />
                              <span>{stats.embeddingInfo.dimension}d vectors</span>
                            </div>
                            {stats.embeddingInfo.modelId && (
                              <div className="flex items-center gap-1.5 col-span-2">
                                <Cpu size={9} />
                                <span className="text-[var(--color-text-secondary)] truncate" title={stats.embeddingInfo.modelId}>
                                  {stats.embeddingInfo.modelId.split('/').pop() || stats.embeddingInfo.modelId}
                                </span>
                                {stats.embeddingInfo.quality && (
                                  <span className="text-[8px] text-[var(--color-text-placeholder)] capitalize">
                                    ({stats.embeddingInfo.quality})
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 col-span-2">
                              <Database size={9} />
                              <span>{stats.embeddingInfo.cacheSize.toLocaleString()} cached embeddings</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Performance Info */}
                      {stats.avgQueryTimeMs !== undefined && stats.avgQueryTimeMs > 0 && (
                        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                          <div className="text-[8px] text-[var(--color-text-placeholder)] uppercase tracking-wider mb-1.5">
                            Performance
                          </div>
                          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                            <Zap size={9} />
                            <span>Avg query: {stats.avgQueryTimeMs.toFixed(1)}ms</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[var(--color-text-muted)]">No index data available</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={onRefresh}
                  disabled={isLoadingStats}
                  className="p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors"
                  title="Refresh statistics"
                >
                  <RefreshCw size={10} className={cn(
                    "text-[var(--color-text-muted)]",
                    isLoadingStats && "animate-spin"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={onReindex}
              disabled={isIndexing}
              className="flex-1 h-7 text-[9px]"
            >
              <Play size={10} className="mr-1.5" />
              {stats?.indexedFiles ? 'Reindex' : 'Start Indexing'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={isIndexing || !stats?.indexedFiles}
              className="h-7 text-[9px] text-[var(--color-error)] hover:text-[var(--color-error)]"
            >
              <Trash2 size={10} className="mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

IndexStatus.displayName = 'IndexStatus';

// =============================================================================
// Feature Toggle Component
// =============================================================================

interface FeatureToggleProps {
  icon: React.ReactNode;
  iconBgClass: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const FeatureToggle: React.FC<FeatureToggleProps> = memo(({
  icon,
  iconBgClass,
  title,
  description,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
    <div className="flex items-center gap-3">
      <div className={cn("p-1.5 rounded", iconBgClass)}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-[var(--color-text-primary)] font-medium">
          {title}
        </div>
        <div className="text-[9px] text-[var(--color-text-muted)]">
          {description}
        </div>
      </div>
    </div>
    <Toggle
      checked={checked}
      onToggle={() => onChange(!checked)}
      size="sm"
    />
  </div>
));

FeatureToggle.displayName = 'FeatureToggle';

// =============================================================================
// Slider Setting Component
// =============================================================================

interface SliderSettingProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (value: number) => string;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
}

const SliderSetting: React.FC<SliderSettingProps> = memo(({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit = '',
  formatValue,
  minLabel,
  maxLabel,
  onChange,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-[10px] text-[var(--color-accent-primary)] font-medium font-mono">
        {formatValue ? formatValue(value) : `${value}${unit}`}
      </span>
    </div>
    <div className="relative">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-[var(--color-surface-3)] rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--color-accent-primary)]
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
      />
      <div className="flex justify-between text-[8px] text-[var(--color-text-placeholder)] mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  </div>
));

SliderSetting.displayName = 'SliderSetting';

// =============================================================================
// Patterns Editor Component
// =============================================================================

interface PatternsEditorProps {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  placeholder?: string;
}

const PatternsEditor: React.FC<PatternsEditorProps> = memo(({
  patterns,
  onChange,
  placeholder = 'Add pattern...',
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !patterns.includes(trimmed)) {
      onChange([...patterns, trimmed]);
      setInputValue('');
    }
  };

  const handleRemove = (pattern: string) => {
    onChange(patterns.filter(p => p !== pattern));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-2 py-1.5 text-[10px] font-mono
            bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]
            rounded text-[var(--color-text-primary)]
            placeholder:text-[var(--color-text-placeholder)]
            focus:outline-none focus:border-[var(--color-accent-primary)]/50"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="h-7 px-2 text-[9px]"
        >
          Add
        </Button>
      </div>
      
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {patterns.map((pattern) => (
            <span
              key={pattern}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono
                bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]
                rounded border border-[var(--color-border-subtle)]"
            >
              {pattern}
              <button
                onClick={() => handleRemove(pattern)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

PatternsEditor.displayName = 'PatternsEditor';

// =============================================================================
// Main Component
// =============================================================================

export const SettingsIndexing: React.FC<SettingsIndexingProps> = ({ settings, onChange }) => {
  const {
    progress,
    stats,
    isReady,
    isLoadingStats,
    indexWorkspace,
    clearIndex,
    abortIndexing,
    refreshStats,
  } = useSemanticIndex();

  const [isClearing, setIsClearing] = useState(false);

  const handleReindex = useCallback(async () => {
    await indexWorkspace({ forceReindex: true });
  }, [indexWorkspace]);

  const handleClear = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearIndex();
    } finally {
      setIsClearing(false);
    }
  }, [clearIndex]);

  const handleAbort = useCallback(async () => {
    await abortIndexing();
  }, [abortIndexing]);

  // Log settings changes for debugging
  useEffect(() => {
    logger.debug('Semantic settings updated', { 
      enabled: settings.enabled,
      autoIndexOnStartup: settings.autoIndexOnStartup,
      watchForChanges: settings.watchForChanges 
    });
  }, [settings.enabled, settings.autoIndexOnStartup, settings.watchForChanges]);

  return (
    <section className="space-y-6 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Database size={14} className="text-[var(--color-accent-primary)]" />
          <h3 className="text-[12px] text-[var(--color-text-primary)] font-medium">Semantic Indexing</h3>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)] leading-relaxed">
          <Search size={10} className="shrink-0" />
          <p># Local vector embeddings for intelligent codebase search and context</p>
        </div>
      </header>

      {/* Index Status */}
      <IndexStatus
        isReady={isReady}
        stats={stats}
        progress={progress}
        isLoadingStats={isLoadingStats || isClearing}
        onRefresh={refreshStats}
        onReindex={handleReindex}
        onClear={handleClear}
        onAbort={handleAbort}
      />

      {/* Core Features */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Zap size={10} />
          # Features
        </div>
        
        <div className="space-y-2">
          <FeatureToggle
            icon={<Database size={12} className="text-[var(--color-accent-primary)]" />}
            iconBgClass="bg-[var(--color-accent-primary)]/10"
            title="Enable Semantic Indexing"
            description="Generate vector embeddings for codebase search"
            checked={settings.enabled}
            onChange={(checked) => onChange('enabled', checked)}
          />
          
          <FeatureToggle
            icon={<Play size={12} className="text-[var(--color-success)]" />}
            iconBgClass="bg-[var(--color-success)]/10"
            title="Auto-index on Startup"
            description="Automatically index workspace when the app starts"
            checked={settings.autoIndexOnStartup}
            onChange={(checked) => onChange('autoIndexOnStartup', checked)}
          />
          
          <FeatureToggle
            icon={<Eye size={12} className="text-[var(--color-warning)]" />}
            iconBgClass="bg-[var(--color-warning)]/10"
            title="Watch for Changes"
            description="Automatically re-index files when they change"
            checked={settings.watchForChanges}
            onChange={(checked) => onChange('watchForChanges', checked)}
          />
          
          <FeatureToggle
            icon={<Zap size={12} className="text-[var(--color-accent-secondary)]" />}
            iconBgClass="bg-[var(--color-accent-secondary)]/10"
            title="Embedding Cache"
            description="Cache embeddings for faster repeated queries"
            checked={settings.enableEmbeddingCache}
            onChange={(checked) => onChange('enableEmbeddingCache', checked)}
          />
          
          <FeatureToggle
            icon={<Activity size={12} className="text-[var(--color-info)]" />}
            iconBgClass="bg-[var(--color-info)]/10"
            title="Use GPU Acceleration"
            description="Use GPU for faster embedding generation if available"
            checked={settings.useGpu}
            onChange={(checked) => onChange('useGpu', checked)}
          />
        </div>
      </div>

      {/* Chunking Configuration */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Settings2 size={10} />
          # Chunk Settings
        </div>
        
        <div className="p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)] space-y-4">
          <SliderSetting
            icon={<Layers size={10} />}
            label="Target Chunk Size"
            value={settings.targetChunkSize}
            min={500}
            max={4000}
            step={100}
            formatValue={(v) => `${v} chars`}
            minLabel="500"
            maxLabel="4000"
            onChange={(value) => onChange('targetChunkSize', value)}
          />
          
          <SliderSetting
            icon={<Layers size={10} />}
            label="Minimum Chunk Size"
            value={settings.minChunkSize}
            min={50}
            max={500}
            step={50}
            formatValue={(v) => `${v} chars`}
            minLabel="50"
            maxLabel="500"
            onChange={(value) => onChange('minChunkSize', value)}
          />
          
          <SliderSetting
            icon={<Layers size={10} />}
            label="Maximum Chunk Size"
            value={settings.maxChunkSize}
            min={1000}
            max={8000}
            step={500}
            formatValue={(v) => `${v} chars`}
            minLabel="1000"
            maxLabel="8000"
            onChange={(value) => onChange('maxChunkSize', value)}
          />
          
          <SliderSetting
            icon={<HardDrive size={10} />}
            label="Max File Size"
            value={settings.maxFileSize}
            min={102400}
            max={10485760}
            step={102400}
            formatValue={(v) => formatBytes(v)}
            minLabel="100 KB"
            maxLabel="10 MB"
            onChange={(value) => onChange('maxFileSize', value)}
          />
          
          <SliderSetting
            icon={<Database size={10} />}
            label="Max Cache Entries"
            value={settings.maxCacheEntries}
            min={1000}
            max={50000}
            step={1000}
            formatValue={(v) => v.toLocaleString()}
            minLabel="1K"
            maxLabel="50K"
            onChange={(value) => onChange('maxCacheEntries', value)}
          />
        </div>
      </div>

      {/* Search & HNSW Configuration */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Search size={10} />
          # Search Performance
        </div>
        
        <div className="p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)] space-y-4">
          {/* Embedding Quality Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-[var(--color-accent-primary)]/10">
                  <Cpu size={10} className="text-[var(--color-accent-primary)]" />
                </div>
                <span className="text-[10px] text-[var(--color-text-secondary)]">Embedding Quality</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {(['fast', 'balanced', 'quality'] as const).map((quality) => (
                <button
                  key={quality}
                  onClick={() => onChange('embeddingQuality', quality)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded text-[9px] font-medium transition-all",
                    settings.embeddingQuality === quality
                      ? "bg-[var(--color-accent-primary)] text-white"
                      : "bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                  )}
                >
                  {quality === 'fast' && '⚡ Fast'}
                  {quality === 'balanced' && '⚖️ Balanced'}
                  {quality === 'quality' && '✨ Quality'}
                </button>
              ))}
            </div>
            <p className="text-[8px] text-[var(--color-text-muted)]">
              {settings.embeddingQuality === 'fast' && 'Faster indexing, lower memory usage. Best for large codebases.'}
              {settings.embeddingQuality === 'balanced' && 'Good balance between speed and search accuracy.'}
              {settings.embeddingQuality === 'quality' && 'Highest accuracy, slower indexing. Best for smaller codebases.'}
            </p>
          </div>

          <SliderSetting
            icon={<GitBranch size={10} />}
            label="HNSW Connections (M)"
            value={settings.hnswM}
            min={8}
            max={64}
            step={4}
            formatValue={(v) => v.toString()}
            minLabel="8"
            maxLabel="64"
            onChange={(value) => onChange('hnswM', value)}
          />
          
          <SliderSetting
            icon={<Search size={10} />}
            label="Search Depth (efSearch)"
            value={settings.hnswEfSearch}
            min={50}
            max={500}
            step={50}
            formatValue={(v) => v.toString()}
            minLabel="50"
            maxLabel="500"
            onChange={(value) => onChange('hnswEfSearch', value)}
          />
          
          <SliderSetting
            icon={<Activity size={10} />}
            label="Min Search Score"
            value={settings.minSearchScore}
            min={0}
            max={1}
            step={0.05}
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            minLabel="0%"
            maxLabel="100%"
            onChange={(value) => onChange('minSearchScore', value)}
          />
          
          <SliderSetting
            icon={<RefreshCw size={10} />}
            label="Auto-optimize After"
            value={settings.autoOptimizeAfter}
            min={100}
            max={5000}
            step={100}
            formatValue={(v) => `${v} changes`}
            minLabel="100"
            maxLabel="5000"
            onChange={(value) => onChange('autoOptimizeAfter', value)}
          />
        </div>
      </div>

      {/* File Filters */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <FileCode size={10} />
          # File Types
        </div>
        
        <div className="p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
          <div className="flex items-start gap-2 mb-3">
            <Info size={10} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />
            <p className="text-[9px] text-[var(--color-text-muted)]">
              Leave empty to index all supported file types. Add extensions without the dot (e.g., "ts", "py").
            </p>
          </div>
          <PatternsEditor
            patterns={settings.indexFileTypes}
            onChange={(patterns) => onChange('indexFileTypes', patterns)}
            placeholder="Add extension (e.g., ts, tsx, py)..."
          />
        </div>
      </div>

      {/* Exclude Patterns */}
      <div className="space-y-3">
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <FolderX size={10} />
          # Exclude Patterns
        </div>
        
        <div className="p-3 rounded bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]">
          <div className="flex items-start gap-2 mb-3">
            <Info size={10} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />
            <p className="text-[9px] text-[var(--color-text-muted)]">
              Glob patterns for files and directories to exclude from indexing.
            </p>
          </div>
          <PatternsEditor
            patterns={settings.excludePatterns}
            onChange={(patterns) => onChange('excludePatterns', patterns)}
            placeholder="Add glob pattern (e.g., **/node_modules/**)..."
          />
        </div>
      </div>
    </section>
  );
};
