/**
 * SettingsWorkspace Component
 * 
 * Workspace indexing, embedding, and file watcher configuration.
 * Controls how workspace files are automatically indexed and searched.
 */

import React from 'react';
import { FolderSearch, Eye, Cpu, Database, Filter, Search } from 'lucide-react';
import type { WorkspaceIndexingSettings } from '../../../../shared/types';
import { DEFAULT_WORKSPACE_INDEXING_SETTINGS } from '../../../../shared/types';
import {
  SettingsSection,
  SettingsGroup,
  SettingsSlider,
  SettingsToggleRow,
  SettingsListManager,
} from '../primitives';
import { formatBytes } from '../utils/formatters';

interface SettingsWorkspaceProps {
  settings: WorkspaceIndexingSettings | undefined;
  onChange: <K extends keyof WorkspaceIndexingSettings>(field: K, value: WorkspaceIndexingSettings[K]) => void;
}

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({ settings: rawSettings, onChange }) => {
  // Use defaults if settings not yet loaded
  const settings = rawSettings ?? DEFAULT_WORKSPACE_INDEXING_SETTINGS;

  return (
    <SettingsSection
      title="Workspace"
      description="Configure workspace indexing, embeddings, and file watching"
    >
      {/* Indexing Core */}
      <SettingsGroup
        title="Indexing"
        icon={<FolderSearch size={11} className="text-[var(--color-accent-primary)]" />}
      >
        <SettingsToggleRow
          label="auto-index"
          description="automatically index workspace files when opened or activated"
          checked={settings.autoIndexOnOpen}
          onToggle={() => onChange('autoIndexOnOpen', !settings.autoIndexOnOpen)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSlider
            label="max-file-size"
            description="skip files larger than this"
            value={settings.maxFileSizeBytes}
            onChange={(value) => onChange('maxFileSizeBytes', value)}
            min={512 * 1024}
            max={50 * 1024 * 1024}
            step={512 * 1024}
            format={formatBytes}
          />
          <SettingsSlider
            label="max-index-size"
            description="maximum index size on disk"
            value={settings.maxIndexSizeMb}
            onChange={(value) => onChange('maxIndexSizeMb', value)}
            min={64}
            max={2048}
            step={64}
            format={(v) => `${v} MB`}
          />
        </div>

        <SettingsSlider
          label="batch-size"
          description="files to process per indexing batch"
          value={settings.indexBatchSize}
          onChange={(value) => onChange('indexBatchSize', value)}
          min={10}
          max={500}
          step={10}
        />
      </SettingsGroup>

      {/* File Watcher */}
      <SettingsGroup
        title="File Watcher"
        icon={<Eye size={11} className="text-[var(--color-info)]" />}
      >
        <SettingsToggleRow
          label="real-time-watching"
          description="watch files for changes and re-index automatically"
          checked={settings.enableFileWatcher}
          onToggle={() => onChange('enableFileWatcher', !settings.enableFileWatcher)}
        />

        {settings.enableFileWatcher && (
          <div className="animate-in slide-in-from-top-1 duration-150">
            <SettingsSlider
              label="debounce"
              description="delay before re-indexing after changes"
              value={settings.watcherDebounceMs}
              onChange={(value) => onChange('watcherDebounceMs', value)}
              min={100}
              max={5000}
              step={100}
              format={(v) => `${v}ms`}
            />
          </div>
        )}
      </SettingsGroup>

      {/* Vector Embeddings */}
      <SettingsGroup
        title="Vector Embeddings"
        icon={<Cpu size={11} className="text-[var(--color-warning)]" />}
      >
        <SettingsToggleRow
          label="enable-embeddings"
          description="generate vector embeddings for semantic search (uses more memory)"
          checked={settings.enableVectorEmbeddings}
          onToggle={() => onChange('enableVectorEmbeddings', !settings.enableVectorEmbeddings)}
        />

        {settings.enableVectorEmbeddings && (
          <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsSlider
                label="chunk-size"
                description="characters per text chunk"
                value={settings.embeddingChunkSize}
                onChange={(value) => onChange('embeddingChunkSize', value)}
                min={256}
                max={4096}
                step={128}
              />
              <SettingsSlider
                label="chunk-overlap"
                description="overlap between consecutive chunks"
                value={settings.embeddingChunkOverlap}
                onChange={(value) => onChange('embeddingChunkOverlap', value)}
                min={0}
                max={512}
                step={16}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsSlider
                label="max-chunks-per-file"
                description="maximum chunks per file"
                value={settings.maxChunksPerFile}
                onChange={(value) => onChange('maxChunksPerFile', value)}
                min={10}
                max={1000}
                step={10}
              />
              <SettingsSlider
                label="embed-batch"
                description="chunks per embedding batch"
                value={settings.embeddingBatchSize}
                onChange={(value) => onChange('embeddingBatchSize', value)}
                min={16}
                max={512}
                step={16}
              />
            </div>
          </div>
        )}
      </SettingsGroup>

      {/* File Filters */}
      <SettingsGroup
        title="File Filters"
        icon={<Filter size={11} className="text-[var(--color-error)]" />}
      >
        <SettingsListManager
          label="exclude-patterns"
          description="glob patterns for files/directories to skip during indexing"
          items={settings.excludePatterns}
          onAdd={(value) => onChange('excludePatterns', [...settings.excludePatterns, value])}
          onRemove={(index) => onChange('excludePatterns', settings.excludePatterns.filter((_, i) => i !== index))}
          placeholder="**/dist/**"
        />

        <SettingsListManager
          label="include-patterns"
          description="limit indexing to these patterns only (empty = all files)"
          items={settings.includePatterns}
          onAdd={(value) => onChange('includePatterns', [...settings.includePatterns, value])}
          onRemove={(index) => onChange('includePatterns', settings.includePatterns.filter((_, i) => i !== index))}
          placeholder="src/**/*.ts"
        />
      </SettingsGroup>

      {/* Agent Context Integration */}
      <SettingsGroup
        title="Agent Context"
        icon={<Search size={11} className="text-[var(--color-success)]" />}
      >
        <SettingsToggleRow
          label="auto-context-injection"
          description="automatically inject relevant code from semantic search into agent context"
          checked={settings.enableAutoContextInjection}
          onToggle={() => onChange('enableAutoContextInjection', !settings.enableAutoContextInjection)}
        />

        {settings.enableAutoContextInjection && (
          <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsSlider
                label="max-results"
                description="max search results injected into context"
                value={settings.maxContextResults}
                onChange={(value) => onChange('maxContextResults', value)}
                min={1}
                max={50}
                step={1}
              />
              <SettingsSlider
                label="min-similarity"
                description="minimum similarity threshold (0-1)"
                value={settings.minSimilarityScore}
                onChange={(value) => onChange('minSimilarityScore', value)}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
              />
            </div>

            {settings.minSimilarityScore < 0.2 && (
              <div className="p-2 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 text-[10px] animate-in slide-in-from-top-1 duration-150 font-mono">
                <div className="flex items-start gap-2">
                  <span className="text-[var(--color-warning)] flex-shrink-0">[WARN]</span>
                  <div className="space-y-0.5">
                    <p className="text-[var(--color-warning)]">low similarity threshold</p>
                    <p className="text-[var(--color-text-muted)] text-[9px]">
                      Very low thresholds may inject irrelevant code into agent context
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsGroup>

      {/* Status Info */}
      <div className="p-2 border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/50 text-[10px] font-mono">
        <div className="flex items-start gap-2">
          <Database size={10} className="text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-[var(--color-text-secondary)]">indexing engine</p>
            <p className="text-[var(--color-text-dim)] text-[9px]">
              full-text: tantivy (BM25) | vectors: fastembed + usearch (HNSW) | model: Qwen3-Embedding-0.6B (candle)
            </p>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

export default SettingsWorkspace;
