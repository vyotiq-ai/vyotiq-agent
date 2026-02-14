/**
 * Agent Instructions Section
 * 
 * Manages agent instruction definitions and project instruction files.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Edit3, Trash2, X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { Toggle } from '../../../../components/ui/Toggle';
import { cn } from '../../../../utils/cn';
import type { PromptSectionBaseProps, InstructionFilesState } from './types';
import type { AgentInstruction, AgentInstructionScope, AgentInstructionTrigger } from '../../../../../shared/types';

// Using type alias instead of empty interface to avoid lint error
type AgentInstructionsSectionProps = PromptSectionBaseProps;

export const AgentInstructionsSection: React.FC<AgentInstructionsSectionProps> = ({
  settings,
  onChange,
}) => {
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [newInstructionDraft, setNewInstructionDraft] = useState<Partial<AgentInstruction> | null>(null);
  const [instructionFilesStatus, setInstructionFilesStatus] = useState<InstructionFilesState>({
    found: false,
    fileCount: 0,
    enabledCount: 0,
    files: [],
    byType: {},
    error: null,
    loading: true,
    expanded: false,
  });

  // Load instruction files status on mount
  useEffect(() => {
    setInstructionFilesStatus(prev => ({ ...prev, loading: false }));
  }, []);

  const handleRefreshInstructionFiles = useCallback(() => {
    // Instruction files refresh not available - workspace API removed
  }, []);

  const handleToggleInstructionFile = useCallback((_relativePath: string, _enabled: boolean) => {
    // Instruction file toggle not available - workspace API removed
  }, []);

  const handleAddInstruction = useCallback((instructionDraft: Partial<AgentInstruction>) => {
    if (!instructionDraft?.name || !instructionDraft?.instructions) return;
    
    const newInstruction: AgentInstruction = {
      id: `instruction-${Date.now()}`,
      name: instructionDraft.name,
      description: instructionDraft.description ?? '',
      instructions: instructionDraft.instructions,
      icon: 'Sparkles',
      isBuiltIn: false,
      enabled: true,
      scope: instructionDraft.scope ?? 'global',
      priority: (settings.agentInstructions?.length ?? 0) + 1,
      trigger: instructionDraft.trigger ?? { type: 'always' },
      tags: instructionDraft.tags ?? [],
    };
    
    onChange('agentInstructions', [...(settings.agentInstructions ?? []), newInstruction]);
    setNewInstructionDraft(null);
  }, [onChange, settings.agentInstructions]);

  const handleDeleteInstruction = useCallback((instructionId: string) => {
    const instruction = settings.agentInstructions?.find(i => i.id === instructionId);
    if (instruction?.isBuiltIn) return;
    
    const newInstructions = (settings.agentInstructions ?? []).filter(i => i.id !== instructionId);
    onChange('agentInstructions', newInstructions);
  }, [onChange, settings.agentInstructions]);

  const handleUpdateInstruction = useCallback((instructionId: string, updates: Partial<AgentInstruction>) => {
    const newInstructions = (settings.agentInstructions ?? []).map(i =>
      i.id === instructionId ? { ...i, ...updates } : i
    );
    onChange('agentInstructions', newInstructions);
    setEditingInstructionId(null);
  }, [onChange, settings.agentInstructions]);

  const handleToggleInstruction = useCallback((instructionId: string) => {
    const newInstructions = (settings.agentInstructions ?? []).map(i =>
      i.id === instructionId ? { ...i, enabled: !i.enabled } : i
    );
    onChange('agentInstructions', newInstructions);
  }, [onChange, settings.agentInstructions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
        <span>agent instructions</span>
        <button
          onClick={() => setNewInstructionDraft({ 
            name: '', 
            description: '', 
            instructions: '', 
            scope: 'global', 
            trigger: { type: 'always' } 
          })}
          className="flex items-center gap-1 text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]"
        >
          <Plus size={12} />
          <span>Add Instruction</span>
        </button>
      </div>

      {/* Project Instruction Files Panel */}
      <InstructionFilesPanel
        status={instructionFilesStatus}
        onToggleExpanded={() => setInstructionFilesStatus(prev => ({ ...prev, expanded: !prev.expanded }))}
        onRefresh={handleRefreshInstructionFiles}
        onToggleFile={handleToggleInstructionFile}
      />

      <div className="p-2 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-dim)]">
        <p className="mb-1"># Agent instructions define specialized behaviors loaded based on context.</p>
        <p># Trigger types: always, keyword, file-type, task-type, manual</p>
      </div>

      {/* New instruction form */}
      {newInstructionDraft && (
        <InstructionForm
          instruction={newInstructionDraft}
          onSave={handleAddInstruction}
          onCancel={() => setNewInstructionDraft(null)}
          isNew
        />
      )}

      {/* Empty state */}
      {(!settings.agentInstructions || settings.agentInstructions.length === 0) && !newInstructionDraft && (
        <div className="p-4 text-center text-[10px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-subtle)]">
          No agent instructions configured.
          <br />
          Click "Add Instruction" to create one.
        </div>
      )}

      {/* Instructions list */}
      <div className="space-y-2">
        {(settings.agentInstructions ?? []).map((instruction) => {
          if (editingInstructionId === instruction.id) {
            return (
              <InstructionForm
                key={instruction.id}
                instruction={instruction}
                onSave={(updates) => handleUpdateInstruction(instruction.id, updates)}
                onCancel={() => setEditingInstructionId(null)}
                isNew={false}
              />
            );
          }

          return (
            <InstructionCard
              key={instruction.id}
              instruction={instruction}
              onToggle={() => handleToggleInstruction(instruction.id)}
              onEdit={() => setEditingInstructionId(instruction.id)}
              onDelete={() => handleDeleteInstruction(instruction.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Instruction files panel */
interface InstructionFilesPanelProps {
  status: InstructionFilesState;
  onToggleExpanded: () => void;
  onRefresh: () => void;
  onToggleFile: (path: string, enabled: boolean) => void;
}

const InstructionFilesPanel: React.FC<InstructionFilesPanelProps> = ({
  status,
  onToggleExpanded,
  onRefresh,
  onToggleFile,
}) => {
  return (
    <div className={cn(
      "border transition-all",
      status.found
        ? "bg-[var(--color-surface-1)] border-[var(--color-success)]/30"
        : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]"
    )}>
      <div className="p-3 cursor-pointer" onClick={onToggleExpanded}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-primary)]">Project Instruction Files</span>
            {status.loading && (
              <span className="text-[9px] text-[var(--color-text-dim)]">Loading...</span>
            )}
            {!status.loading && status.found && (
              <span className="text-[8px] px-1 py-0.5 bg-[var(--color-success)]/20 text-[var(--color-success)]">
                {status.enabledCount}/{status.fileCount} enabled
              </span>
            )}
            {!status.loading && !status.found && !status.error && (
              <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                No files found
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              disabled={status.loading}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              title="Refresh"
            >
              <RotateCcw size={12} className={status.loading ? "animate-spin" : ""} />
            </button>
            {status.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
        </div>
        <p className="text-[9px] text-[var(--color-text-dim)]">
          Auto-loads from AGENTS.md, CLAUDE.md, copilot-instructions.md
        </p>
      </div>

      {status.expanded && (
        <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)]">
          {Object.keys(status.byType).length > 0 && (
            <div className="flex flex-wrap gap-1 py-2">
              {Object.entries(status.byType).map(([type, count]) => (
                <span key={type} className="text-[8px] px-1.5 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-muted)]">
                  {type.replace('-md', '.md')}: {count}
                </span>
              ))}
            </div>
          )}

          {status.files.length > 0 ? (
            <div className="space-y-1 pt-2">
              {status.files.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    "flex items-center justify-between p-2 border",
                    file.enabled
                      ? "bg-[var(--color-surface-base)] border-[var(--color-border-subtle)]"
                      : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]/50 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Toggle
                      label=""
                      checked={file.enabled}
                      onToggle={() => onToggleFile(file.path, !file.enabled)}
                    />
                    <div className="flex-1 min-w-0">
                      <code className="text-[10px] text-[var(--color-text-primary)] truncate block">
                        {file.path}
                      </code>
                      <div className="text-[8px] text-[var(--color-text-dim)] mt-0.5">
                        {file.sectionsCount} section{file.sectionsCount !== 1 ? 's' : ''} • priority {file.priority}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-[9px] text-[var(--color-text-dim)]">
              No instruction files found in workspace.
            </div>
          )}

          {status.error && (
            <p className="text-[9px] text-[var(--color-error)] mt-2">{status.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

/** Instruction card */
interface InstructionCardProps {
  instruction: AgentInstruction;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const InstructionCard: React.FC<InstructionCardProps> = ({
  instruction,
  onToggle,
  onEdit,
  onDelete,
}) => {
  return (
    <div
      className={cn(
        "p-3 border transition-all",
        instruction.enabled
          ? "bg-[var(--color-surface-1)] border-[var(--color-border-subtle)]"
          : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]/50 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Toggle label="" checked={instruction.enabled} onToggle={onToggle} />
            <span className="text-[11px] text-[var(--color-text-primary)]">{instruction.name}</span>
            {instruction.isBuiltIn && (
              <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                built-in
              </span>
            )}
            <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
              {instruction.trigger.type}
            </span>
            <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
              {instruction.scope}
            </span>
          </div>
          <p className="text-[9px] text-[var(--color-text-dim)] mb-1">{instruction.description}</p>
          <pre className="text-[9px] text-[var(--color-text-muted)] whitespace-pre-wrap line-clamp-2">
            {instruction.instructions}
          </pre>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Edit"
          >
            <Edit3 size={12} />
          </button>
          {!instruction.isBuiltIn && (
            <button
              onClick={onDelete}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Instruction form */
interface InstructionFormProps {
  instruction: Partial<AgentInstruction>;
  onSave: (instruction: Partial<AgentInstruction>) => void;
  onCancel: () => void;
  isNew: boolean;
}

const InstructionForm: React.FC<InstructionFormProps> = ({ instruction, onSave, onCancel, isNew }) => {
  const [localInstruction, setLocalInstruction] = useState<Partial<AgentInstruction>>(instruction);

  return (
    <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-accent-primary)]">
          {isNew ? 'New Agent Instruction' : 'Edit Instruction'}
        </span>
        <button onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1">
          <X size={12} />
        </button>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Instruction Name"
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.name ?? ''}
          onChange={(e) => setLocalInstruction({ ...localInstruction, name: e.target.value })}
        />
        
        <select
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.scope ?? 'global'}
          onChange={(e) => setLocalInstruction({ ...localInstruction, scope: e.target.value as AgentInstructionScope })}
        >
          <option value="global">Global Scope</option>
          <option value="workspace">Workspace Scope</option>
          <option value="session">Session Scope</option>
        </select>
      </div>

      <input
        type="text"
        placeholder="Short Description"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={localInstruction.description ?? ''}
        onChange={(e) => setLocalInstruction({ ...localInstruction, description: e.target.value })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.trigger?.type ?? 'always'}
          onChange={(e) => setLocalInstruction({ 
            ...localInstruction, 
            trigger: { type: e.target.value as AgentInstructionTrigger['type'] } 
          })}
        >
          <option value="always">Always Active</option>
          <option value="keyword">Keyword Trigger</option>
          <option value="file-type">File Type Trigger</option>
          <option value="task-type">Task Type Trigger</option>
          <option value="manual">Manual Only</option>
        </select>

        {localInstruction.trigger?.type && 
         localInstruction.trigger.type !== 'always' && 
         localInstruction.trigger.type !== 'manual' && (
          <input
            type="text"
            placeholder={
              localInstruction.trigger.type === 'keyword' ? 'research,find,search' :
              localInstruction.trigger.type === 'file-type' ? '*.ts, *.tsx' :
              'coding,debugging,planning'
            }
            className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
            value={localInstruction.trigger?.value ?? ''}
            onChange={(e) => setLocalInstruction({ 
              ...localInstruction, 
              trigger: { ...localInstruction.trigger, value: e.target.value } as AgentInstructionTrigger 
            })}
          />
        )}
      </div>

      <textarea
        placeholder="Agent instructions (how the agent should behave)..."
        className="w-full min-h-[120px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={localInstruction.instructions ?? ''}
        onChange={(e) => setLocalInstruction({ ...localInstruction, instructions: e.target.value })}
      />

      <input
        type="text"
        placeholder="Tags (comma-separated)"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={(localInstruction.tags ?? []).join(', ')}
        onChange={(e) => setLocalInstruction({ 
          ...localInstruction, 
          tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
        })}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSave(localInstruction)}
          disabled={!localInstruction.name || !localInstruction.instructions}
        >
          {isNew ? 'Add Instruction' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default AgentInstructionsSection;
