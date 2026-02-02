/**
 * Settings Prompts Section
 * 
 * System prompt customization including:
 * - Custom system prompt
 * - Role/persona selection
 * - Agent instructions (specialized behavior definitions)
 * - AGENTS.md file support (project-specific agent instructions)
 * - Context injection rules
 * - Response format preferences
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  MessageSquare,
  User,
  FileText,
  Settings2,
  Plus,
  Trash2,
  Edit3,
  X,
  ChevronDown,
  ChevronUp,
  Bot,
  Code2,
  Zap,
  GraduationCap,
  Search,
  Building2,
  RotateCcw,
  ListTodo,
  CheckCircle2,
  Bug,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { cn } from '../../../utils/cn';
import type {
  PromptSettings,
  AgentPersona,
  ContextInjectionRule,
  ResponseFormatPreferences,
  ContextInjectionCondition,
  AgentInstruction,
  AgentInstructionTrigger,
  AgentInstructionScope,
} from '../../../../shared/types';
import { DEFAULT_RESPONSE_FORMAT } from '../../../../shared/types';

interface SettingsPromptsProps {
  settings: PromptSettings;
  onChange: <K extends keyof PromptSettings>(field: K, value: PromptSettings[K]) => void;
}

// Icon mapping for personas and instructions
const ICON_MAP: Record<string, React.ReactNode> = {
  Bot: <Bot size={14} />,
  Code2: <Code2 size={14} />,
  Zap: <Zap size={14} />,
  GraduationCap: <GraduationCap size={14} />,
  Search: <Search size={14} />,
  Building2: <Building2 size={14} />,
  User: <User size={14} />,
  ListTodo: <ListTodo size={14} />,
  CheckCircle2: <CheckCircle2 size={14} />,
  Bug: <Bug size={14} />,
  RefreshCw: <RefreshCw size={14} />,
  Sparkles: <Sparkles size={14} />,
};

// Backward compatibility alias
const PERSONA_ICONS = ICON_MAP;

// Sub-sections for the prompts settings
type PromptsSubSection = 'system-prompt' | 'personas' | 'agent-instructions' | 'context-rules' | 'response-format';

export const SettingsPrompts: React.FC<SettingsPromptsProps> = ({ settings, onChange }) => {
  const [activeSubSection, setActiveSubSection] = useState<PromptsSubSection>('system-prompt');
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [newPersonaDraft, setNewPersonaDraft] = useState<Partial<AgentPersona> | null>(null);
  const [newRuleDraft, setNewRuleDraft] = useState<Partial<ContextInjectionRule> | null>(null);
  const [newInstructionDraft, setNewInstructionDraft] = useState<Partial<AgentInstruction> | null>(null);

  // Instruction files status (AGENTS.md, CLAUDE.md, copilot-instructions.md, etc.)
  const [instructionFilesStatus, setInstructionFilesStatus] = useState<{
    found: boolean;
    fileCount: number;
    enabledCount: number;
    files: Array<{
      path: string;
      type: string;
      enabled: boolean;
      priority: number;
      sectionsCount: number;
      hasFrontmatter: boolean;
    }>;
    byType: Record<string, number>;
    error: string | null;
    loading: boolean;
    expanded: boolean;
  }>({ found: false, fileCount: 0, enabledCount: 0, files: [], byType: {}, error: null, loading: true, expanded: false });

  // Load instruction files status on mount and when section changes
  useEffect(() => {
    if (activeSubSection === 'agent-instructions') {
      // Load instruction files status
      setInstructionFilesStatus(prev => ({ ...prev, loading: true }));
      window.vyotiq.workspace.getInstructionFilesStatus?.()
        .then(status => {
          setInstructionFilesStatus(prev => ({ 
            ...status, 
            loading: false, 
            expanded: prev.expanded,
            error: status.error ?? null 
          }));
        })
        .catch(err => {
          setInstructionFilesStatus(prev => ({ 
            ...prev, 
            error: String(err), 
            loading: false 
          }));
        });
    }
  }, [activeSubSection]);

  const handleRefreshInstructionFiles = useCallback(() => {
    setInstructionFilesStatus(prev => ({ ...prev, loading: true }));
    window.vyotiq.workspace.refreshInstructionFiles?.()
      .then(() => window.vyotiq.workspace.getInstructionFilesStatus?.())
      .then(status => {
        if (status) setInstructionFilesStatus(prev => ({ 
          ...status, 
          loading: false,
          expanded: prev.expanded,
          error: status.error ?? null 
        }));
      })
      .catch(err => {
        setInstructionFilesStatus(prev => ({ ...prev, error: String(err), loading: false }));
      });
  }, []);

  const handleToggleInstructionFile = useCallback((relativePath: string, enabled: boolean) => {
    window.vyotiq.workspace.toggleInstructionFile?.(relativePath, enabled)
      .then(() => window.vyotiq.workspace.getInstructionFilesStatus?.())
      .then(status => {
        if (status) setInstructionFilesStatus(prev => ({ 
          ...status, 
          loading: false,
          expanded: prev.expanded,
          error: status.error ?? null 
        }));
      })
      .catch(err => {
        console.error('Failed to toggle instruction file:', err);
      });
  }, []);

  // Get the active persona
  const activePersona = useMemo(() => {
    return settings.personas.find(p => p.id === settings.activePersonaId) ?? settings.personas[0];
  }, [settings.personas, settings.activePersonaId]);

  // Handle persona selection
  const handleSelectPersona = useCallback((personaId: string) => {
    onChange('activePersonaId', personaId);
    // If selecting a persona with a system prompt, disable custom system prompt
    const persona = settings.personas.find(p => p.id === personaId);
    if (persona && persona.systemPrompt && persona.id !== 'default') {
      onChange('useCustomSystemPrompt', false);
    }
  }, [onChange, settings.personas]);

  // Handle adding a new persona
  const handleAddPersona = useCallback(() => {
    if (!newPersonaDraft?.name || !newPersonaDraft?.systemPrompt) return;
    
    const newPersona: AgentPersona = {
      id: `custom-${Date.now()}`,
      name: newPersonaDraft.name,
      description: newPersonaDraft.description ?? '',
      systemPrompt: newPersonaDraft.systemPrompt,
      icon: 'User',
      isBuiltIn: false,
    };
    
    onChange('personas', [...settings.personas, newPersona]);
    setNewPersonaDraft(null);
  }, [newPersonaDraft, onChange, settings.personas]);

  // Handle deleting a persona
  const handleDeletePersona = useCallback((personaId: string) => {
    const persona = settings.personas.find(p => p.id === personaId);
    if (persona?.isBuiltIn) return; // Can't delete built-in personas
    
    const newPersonas = settings.personas.filter(p => p.id !== personaId);
    onChange('personas', newPersonas);
    
    // If deleting the active persona, switch to default
    if (settings.activePersonaId === personaId) {
      onChange('activePersonaId', 'default');
    }
  }, [onChange, settings.personas, settings.activePersonaId]);

  // Handle updating a persona
  const handleUpdatePersona = useCallback((personaId: string, updates: Partial<AgentPersona>) => {
    const newPersonas = settings.personas.map(p =>
      p.id === personaId ? { ...p, ...updates } : p
    );
    onChange('personas', newPersonas);
    setEditingPersonaId(null);
  }, [onChange, settings.personas]);

  // Handle adding a context injection rule
  const handleAddRule = useCallback(() => {
    if (!newRuleDraft?.name || !newRuleDraft?.template) return;
    
    const newRule: ContextInjectionRule = {
      id: `rule-${Date.now()}`,
      name: newRuleDraft.name,
      enabled: true,
      priority: settings.contextInjectionRules.length + 1,
      condition: newRuleDraft.condition ?? { type: 'always' },
      template: newRuleDraft.template,
      position: newRuleDraft.position ?? 'append',
    };
    
    onChange('contextInjectionRules', [...settings.contextInjectionRules, newRule]);
    setNewRuleDraft(null);
  }, [newRuleDraft, onChange, settings.contextInjectionRules]);

  // Handle deleting a context injection rule
  const handleDeleteRule = useCallback((ruleId: string) => {
    const newRules = settings.contextInjectionRules.filter(r => r.id !== ruleId);
    onChange('contextInjectionRules', newRules);
  }, [onChange, settings.contextInjectionRules]);

  // Handle updating a context injection rule
  const handleUpdateRule = useCallback((ruleId: string, updates: Partial<ContextInjectionRule>) => {
    const newRules = settings.contextInjectionRules.map(r =>
      r.id === ruleId ? { ...r, ...updates } : r
    );
    onChange('contextInjectionRules', newRules);
    setEditingRuleId(null);
  }, [onChange, settings.contextInjectionRules]);

  // ==========================================================================
  // Agent Instruction Handlers
  // ==========================================================================

  // Handle adding a new agent instruction
  const handleAddInstruction = useCallback((instructionDraft: Partial<AgentInstruction>) => {
    if (!instructionDraft?.name || !instructionDraft?.instructions) return;
    
    const newInstruction: AgentInstruction = {
      id: `instruction-${Date.now()}`,
      name: instructionDraft.name,
      description: instructionDraft.description ?? '',
      instructions: instructionDraft.instructions,
      icon: instructionDraft.icon ?? 'Sparkles',
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

  // Handle deleting an agent instruction
  const handleDeleteInstruction = useCallback((instructionId: string) => {
    const instruction = settings.agentInstructions?.find(i => i.id === instructionId);
    if (instruction?.isBuiltIn) return; // Can't delete built-in instructions
    
    const newInstructions = (settings.agentInstructions ?? []).filter(i => i.id !== instructionId);
    onChange('agentInstructions', newInstructions);
  }, [onChange, settings.agentInstructions]);

  // Handle updating an agent instruction
  const handleUpdateInstruction = useCallback((instructionId: string, updates: Partial<AgentInstruction>) => {
    const newInstructions = (settings.agentInstructions ?? []).map(i =>
      i.id === instructionId ? { ...i, ...updates } : i
    );
    onChange('agentInstructions', newInstructions);
    setEditingInstructionId(null);
  }, [onChange, settings.agentInstructions]);

  // Handle toggling an agent instruction enabled state
  const handleToggleInstruction = useCallback((instructionId: string) => {
    const newInstructions = (settings.agentInstructions ?? []).map(i =>
      i.id === instructionId ? { ...i, enabled: !i.enabled } : i
    );
    onChange('agentInstructions', newInstructions);
  }, [onChange, settings.agentInstructions]);

  // Handle response format change
  const handleResponseFormatChange = useCallback(<K extends keyof ResponseFormatPreferences>(
    field: K,
    value: ResponseFormatPreferences[K]
  ) => {
    onChange('responseFormat', {
      ...settings.responseFormat,
      [field]: value,
    });
  }, [onChange, settings.responseFormat]);

  // Render sub-section navigation
  const subSections: { id: PromptsSubSection; label: string; icon: React.ReactNode }[] = [
    { id: 'system-prompt', label: 'System Prompt', icon: <MessageSquare size={12} /> },
    { id: 'personas', label: 'Personas', icon: <User size={12} /> },
    { id: 'agent-instructions', label: 'Agents', icon: <Sparkles size={12} /> },
    { id: 'context-rules', label: 'Context Rules', icon: <FileText size={12} /> },
    { id: 'response-format', label: 'Response Format', icon: <Settings2 size={12} /> },
  ];

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">prompts</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Customize system prompts, personas, and response behavior
        </p>
      </header>

      {/* Sub-section tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {subSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSubSection(section.id)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-[10px] transition-all",
              activeSubSection === section.id
                ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-b border-[var(--color-accent-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]"
            )}
          >
            {section.icon}
            <span>{section.label}</span>
          </button>
        ))}
      </div>

      {/* System Prompt Section */}
      {activeSubSection === 'system-prompt' && (
        <div className="space-y-4">
          {/* Info banner about prompt layering */}
          <div className="p-3 bg-[var(--color-info)]/10 border border-[var(--color-info)]/30 text-[10px]">
            <p className="text-[var(--color-info)] mb-1">
              <span className="font-semibold">ℹ️ How prompt customization works:</span>
            </p>
            <p className="text-[var(--color-text-secondary)]">
              Custom prompts and personas are <strong>layered on top of</strong> the core system prompt.
              The core identity, tool access, and safety guidelines are always preserved to ensure the agent functions correctly.
            </p>
          </div>

          <Toggle
            label="--custom-prompt"
            description="# Add custom instructions to the system prompt"
            checked={settings.useCustomSystemPrompt}
            onToggle={() => onChange('useCustomSystemPrompt', !settings.useCustomSystemPrompt)}
          />

          {settings.useCustomSystemPrompt && (
            <div className="space-y-2">
              <label className="text-[10px] text-[var(--color-text-muted)]">
                Custom Instructions
              </label>
              <textarea
                className="w-full min-h-[200px] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-3 py-2 text-[11px] font-mono outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
                value={settings.customSystemPrompt}
                onChange={(e) => onChange('customSystemPrompt', e.target.value)}
                placeholder="Enter custom instructions to add to the system prompt..."
              />
              <p className="text-[9px] text-[var(--color-text-dim)]">
                # These instructions will be added as a "CUSTOM INSTRUCTIONS" section (core prompt is preserved)
              </p>
            </div>
          )}

          {!settings.useCustomSystemPrompt && activePersona && (
            <div className="space-y-2 p-3 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                {PERSONA_ICONS[activePersona.icon ?? 'Bot']}
                <span>Active Persona: {activePersona.name}</span>
              </div>
              {activePersona.systemPrompt && (
                <pre className="text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                  {activePersona.systemPrompt}
                </pre>
              )}
              {!activePersona.systemPrompt && activePersona.id === 'default' && (
                <p className="text-[10px] text-[var(--color-text-dim)] italic">
                  Using the built-in default system prompt
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <Toggle
              label="--workspace-context"
              description="# Include workspace info in prompts"
              checked={settings.includeWorkspaceContext}
              onToggle={() => onChange('includeWorkspaceContext', !settings.includeWorkspaceContext)}
            />
          </div>

          {/* Prompt Structure Preview */}
          <PromptStructurePreview settings={settings} activePersona={activePersona} />
        </div>
      )}

      {/* Personas Section */}
      {activeSubSection === 'personas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
            <span>Available Personas</span>
            <button
              onClick={() => setNewPersonaDraft({ name: '', description: '', systemPrompt: '' })}
              className="flex items-center gap-1 text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]"
            >
              <Plus size={12} />
              <span>Add Custom</span>
            </button>
          </div>

          {/* New persona form */}
          {newPersonaDraft && (
            <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-accent-primary)]">New Persona</span>
                <button
                  onClick={() => setNewPersonaDraft(null)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Persona Name"
                className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={newPersonaDraft.name ?? ''}
                onChange={(e) => setNewPersonaDraft({ ...newPersonaDraft, name: e.target.value })}
              />
              <input
                type="text"
                placeholder="Short Description"
                className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={newPersonaDraft.description ?? ''}
                onChange={(e) => setNewPersonaDraft({ ...newPersonaDraft, description: e.target.value })}
              />
              <textarea
                placeholder="System Prompt..."
                className="w-full min-h-[100px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
                value={newPersonaDraft.systemPrompt ?? ''}
                onChange={(e) => setNewPersonaDraft({ ...newPersonaDraft, systemPrompt: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setNewPersonaDraft(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddPersona}
                  disabled={!newPersonaDraft.name || !newPersonaDraft.systemPrompt}
                >
                  Add Persona
                </Button>
              </div>
            </div>
          )}

          {/* Persona list */}
          <div className="space-y-2">
            {settings.personas.map((persona) => {
              const isActive = settings.activePersonaId === persona.id;
              const isEditing = editingPersonaId === persona.id;

              if (isEditing && !persona.isBuiltIn) {
                return (
                  <PersonaEditForm
                    key={persona.id}
                    persona={persona}
                    onSave={(updates) => handleUpdatePersona(persona.id, updates)}
                    onCancel={() => setEditingPersonaId(null)}
                  />
                );
              }

              return (
                <div
                  key={persona.id}
                  className={cn(
                    "p-3 border transition-all cursor-pointer",
                    isActive
                      ? "bg-[var(--color-surface-2)] border-[var(--color-accent-primary)]/50"
                      : "bg-[var(--color-surface-1)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-subtle)]/80"
                  )}
                  onClick={() => handleSelectPersona(persona.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "transition-colors",
                        isActive ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-muted)]"
                      )}>
                        {PERSONA_ICONS[persona.icon ?? 'Bot']}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[11px] font-medium",
                            isActive ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"
                          )}>
                            {persona.name}
                          </span>
                          {persona.isBuiltIn && (
                            <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                              built-in
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[8px] px-1 py-0.5 bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]">
                              active
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-[var(--color-text-dim)]">{persona.description}</p>
                      </div>
                    </div>
                    {!persona.isBuiltIn && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingPersonaId(persona.id)}
                          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          title="Edit persona"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeletePersona(persona.id)}
                          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                          title="Delete persona"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Instructions Section */}
      {activeSubSection === 'agent-instructions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
            <span>Agent Instructions</span>
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
          <div className={cn(
            "border transition-all",
            instructionFilesStatus.found
              ? "bg-[var(--color-surface-1)] border-[var(--color-success)]/30"
              : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]"
          )}>
            {/* Header */}
            <div 
              className="p-3 cursor-pointer"
              onClick={() => setInstructionFilesStatus(prev => ({ ...prev, expanded: !prev.expanded }))}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText size={14} className={instructionFilesStatus.found ? "text-[var(--color-success)]" : "text-[var(--color-text-dim)]"} />
                  <span className="text-[11px] text-[var(--color-text-primary)]">Project Instruction Files</span>
                  {instructionFilesStatus.loading && (
                    <span className="text-[9px] text-[var(--color-text-dim)]">Loading...</span>
                  )}
                  {!instructionFilesStatus.loading && instructionFilesStatus.found && (
                    <span className="text-[8px] px-1 py-0.5 bg-[var(--color-success)]/20 text-[var(--color-success)]">
                      {instructionFilesStatus.enabledCount}/{instructionFilesStatus.fileCount} enabled
                    </span>
                  )}
                  {!instructionFilesStatus.loading && !instructionFilesStatus.found && !instructionFilesStatus.error && (
                    <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                      No files found
                    </span>
                  )}
                  {instructionFilesStatus.error && (
                    <span className="text-[8px] px-1 py-0.5 bg-[var(--color-error)]/20 text-[var(--color-error)]">
                      Error
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRefreshInstructionFiles(); }}
                    disabled={instructionFilesStatus.loading}
                    className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Refresh instruction files"
                  >
                    <RotateCcw size={12} className={instructionFilesStatus.loading ? "animate-spin" : ""} />
                  </button>
                  {instructionFilesStatus.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </div>
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)]">
                Automatically loads instructions from AGENTS.md, CLAUDE.md, copilot-instructions.md, and more.
                <a 
                  href="https://agents.md/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-1 text-[var(--color-accent-primary)] hover:underline"
                >
                  Learn more →
                </a>
              </p>
            </div>

            {/* Expanded content */}
            {instructionFilesStatus.expanded && (
              <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)]">
                {/* File type summary */}
                {Object.keys(instructionFilesStatus.byType).length > 0 && (
                  <div className="flex flex-wrap gap-1 py-2">
                    {Object.entries(instructionFilesStatus.byType).map(([type, count]) => (
                      <span 
                        key={type} 
                        className="text-[8px] px-1.5 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-muted)]"
                      >
                        {type.replace('-md', '.md').replace('-', ' ')}: {count}
                      </span>
                    ))}
                  </div>
                )}

                {/* Files list */}
                {instructionFilesStatus.files.length > 0 ? (
                  <div className="space-y-1 pt-2">
                    {instructionFilesStatus.files.map((file) => (
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
                            onToggle={() => handleToggleInstructionFile(file.path, !file.enabled)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <code className="text-[10px] text-[var(--color-text-primary)] truncate">
                                {file.path}
                              </code>
                              <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)] shrink-0">
                                {file.type.replace('-md', '.md').replace('copilot-instructions', 'Copilot').replace('github-instructions', 'GitHub').replace('cursor-rules', 'Cursor')}
                              </span>
                              {file.hasFrontmatter && (
                                <span className="text-[8px] px-1 py-0.5 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] shrink-0">
                                  frontmatter
                                </span>
                              )}
                            </div>
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
                    <br />
                    Create an AGENTS.md, CLAUDE.md, or .github/copilot-instructions.md file to get started.
                  </div>
                )}

                {instructionFilesStatus.error && (
                  <p className="text-[9px] text-[var(--color-error)] mt-2">{instructionFilesStatus.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="p-2 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-dim)]">
            <p className="mb-1">
              # Agent instructions define specialized behaviors that are dynamically loaded based on context.
            </p>
            <p>
              # Trigger types: <code className="text-[var(--color-accent-primary)]">always</code>, <code className="text-[var(--color-accent-primary)]">keyword</code>, <code className="text-[var(--color-accent-primary)]">file-type</code>, <code className="text-[var(--color-accent-primary)]">task-type</code>, <code className="text-[var(--color-accent-primary)]">manual</code>
            </p>
          </div>

          {/* New instruction form */}
          {newInstructionDraft && (
            <AgentInstructionForm
              instruction={newInstructionDraft}
              onSave={handleAddInstruction}
              onCancel={() => setNewInstructionDraft(null)}
              isNew
            />
          )}

          {/* Instructions list */}
          {(!settings.agentInstructions || settings.agentInstructions.length === 0) && !newInstructionDraft && (
            <div className="p-4 text-center text-[10px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-subtle)]">
              No agent instructions configured.
              <br />
              Click "Add Instruction" to create one.
            </div>
          )}

          <div className="space-y-2">
            {(settings.agentInstructions ?? []).map((instruction) => {
              const isEditing = editingInstructionId === instruction.id;

              if (isEditing) {
                return (
                  <AgentInstructionForm
                    key={instruction.id}
                    instruction={instruction}
                    onSave={(updates) => handleUpdateInstruction(instruction.id, updates)}
                    onCancel={() => setEditingInstructionId(null)}
                    isNew={false}
                  />
                );
              }

              return (
                <div
                  key={instruction.id}
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
                        <Toggle
                          label=""
                          checked={instruction.enabled}
                          onToggle={() => handleToggleInstruction(instruction.id)}
                        />
                        <span className="text-[var(--color-text-muted)]">
                          {ICON_MAP[instruction.icon ?? 'Sparkles']}
                        </span>
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
                        onClick={() => setEditingInstructionId(instruction.id)}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        title="Edit instruction"
                      >
                        <Edit3 size={12} />
                      </button>
                      {!instruction.isBuiltIn && (
                        <button
                          onClick={() => handleDeleteInstruction(instruction.id)}
                          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                          title="Delete instruction"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context Injection Rules Section */}
      {activeSubSection === 'context-rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
            <span>Context Injection Rules</span>
            <button
              onClick={() => setNewRuleDraft({ name: '', template: '', condition: { type: 'always' }, position: 'append' })}
              className="flex items-center gap-1 text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]"
            >
              <Plus size={12} />
              <span>Add Rule</span>
            </button>
          </div>

          <div className="p-2 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-dim)]">
            <p className="mb-1">
              # Context injection rules add extra context to prompts. Core system prompt is always preserved.
            </p>
            <p>
              # Available placeholders: <code className="text-[var(--color-accent-primary)]">{'{{workspace}}'}</code>, <code className="text-[var(--color-accent-primary)]">{'{{session}}'}</code>, <code className="text-[var(--color-accent-primary)]">{'{{provider}}'}</code>
            </p>
          </div>

          {/* New rule form */}
          {newRuleDraft && (
            <ContextRuleForm
              rule={newRuleDraft}
              onSave={handleAddRule}
              onCancel={() => setNewRuleDraft(null)}
              onChange={setNewRuleDraft}
              isNew
            />
          )}

          {/* Rules list */}
          {settings.contextInjectionRules.length === 0 && !newRuleDraft && (
            <div className="p-4 text-center text-[10px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-subtle)]">
              No context injection rules configured.
              <br />
              Click "Add Rule" to create one.
            </div>
          )}

          <div className="space-y-2">
            {settings.contextInjectionRules.map((rule) => {
              const isEditing = editingRuleId === rule.id;

              if (isEditing) {
                return (
                  <ContextRuleForm
                    key={rule.id}
                    rule={rule}
                    onSave={() => handleUpdateRule(rule.id, rule)}
                    onCancel={() => setEditingRuleId(null)}
                    onChange={(updates) => handleUpdateRule(rule.id, updates as ContextInjectionRule)}
                    isNew={false}
                  />
                );
              }

              return (
                <div
                  key={rule.id}
                  className={cn(
                    "p-3 border transition-all",
                    rule.enabled
                      ? "bg-[var(--color-surface-1)] border-[var(--color-border-subtle)]"
                      : "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]/50 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Toggle
                          label=""
                          checked={rule.enabled}
                          onToggle={() => handleUpdateRule(rule.id, { enabled: !rule.enabled })}
                        />
                        <span className="text-[11px] text-[var(--color-text-primary)]">{rule.name}</span>
                        <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                          {rule.condition.type}
                        </span>
                        <span className="text-[8px] px-1 py-0.5 bg-[var(--color-surface-3)] text-[var(--color-text-dim)]">
                          {rule.position}
                        </span>
                      </div>
                      <pre className="text-[9px] text-[var(--color-text-muted)] whitespace-pre-wrap line-clamp-2">
                        {rule.template}
                      </pre>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingRuleId(rule.id)}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        title="Edit rule"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                        title="Delete rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Response Format Section */}
      {activeSubSection === 'response-format' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
            <span>Response Format Preferences</span>
            <button
              onClick={() => onChange('responseFormat', DEFAULT_RESPONSE_FORMAT)}
              className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              title="Reset to defaults"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Code Block Style */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--code-style</label>
              <select
                className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={settings.responseFormat.codeBlockStyle}
                onChange={(e) => handleResponseFormatChange('codeBlockStyle', e.target.value as 'fenced' | 'indented')}
              >
                <option value="fenced">Fenced (```)</option>
                <option value="indented">Indented</option>
              </select>
            </div>

            {/* Explanation Detail */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--explanation-level</label>
              <select
                className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={settings.responseFormat.explanationDetail}
                onChange={(e) => handleResponseFormatChange('explanationDetail', e.target.value as 'minimal' | 'moderate' | 'detailed')}
              >
                <option value="minimal">Minimal</option>
                <option value="moderate">Moderate</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>

            {/* Max Response Length */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-length</label>
              <select
                className="w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={settings.responseFormat.maxResponseLength}
                onChange={(e) => handleResponseFormatChange('maxResponseLength', e.target.value as 'short' | 'medium' | 'long' | 'unlimited')}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--tone</label>
              <select
                className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
                value={settings.responseFormat.tone}
                onChange={(e) => handleResponseFormatChange('tone', e.target.value as 'professional' | 'casual' | 'technical' | 'friendly')}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="technical">Technical</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              label="--line-numbers"
              description="# Include line numbers in code blocks"
              checked={settings.responseFormat.includeLineNumbers}
              onToggle={() => handleResponseFormatChange('includeLineNumbers', !settings.responseFormat.includeLineNumbers)}
            />
            <Toggle
              label="--include-examples"
              description="# Include examples in explanations"
              checked={settings.responseFormat.includeExamples}
              onToggle={() => handleResponseFormatChange('includeExamples', !settings.responseFormat.includeExamples)}
            />
            <Toggle
              label="--use-markdown"
              description="# Use markdown formatting"
              checked={settings.responseFormat.useMarkdown}
              onToggle={() => handleResponseFormatChange('useMarkdown', !settings.responseFormat.useMarkdown)}
            />
            <Toggle
              label="--use-headers"
              description="# Break up responses with headers"
              checked={settings.responseFormat.useHeaders}
              onToggle={() => handleResponseFormatChange('useHeaders', !settings.responseFormat.useHeaders)}
            />
          </div>
        </div>
      )}
    </section>
  );
};

// Persona edit form component
interface PersonaEditFormProps {
  persona: AgentPersona;
  onSave: (updates: Partial<AgentPersona>) => void;
  onCancel: () => void;
}

const PersonaEditForm: React.FC<PersonaEditFormProps> = ({ persona, onSave, onCancel }) => {
  const [draft, setDraft] = useState<Partial<AgentPersona>>({
    name: persona.name,
    description: persona.description,
    systemPrompt: persona.systemPrompt,
  });

  return (
    <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-accent-primary)]">Edit Persona</span>
        <button
          onClick={onCancel}
          className={cn(
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "p-1 rounded-sm",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          aria-label="Cancel persona editing"
        >
          <X size={12} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Persona Name"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={draft.name ?? ''}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <input
        type="text"
        placeholder="Short Description"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={draft.description ?? ''}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <textarea
        placeholder="System Prompt..."
        className="w-full min-h-[100px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={draft.systemPrompt ?? ''}
        onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(draft)} disabled={!draft.name}>
          Save
        </Button>
      </div>
    </div>
  );
};

// Context rule form component
interface ContextRuleFormProps {
  rule: Partial<ContextInjectionRule>;
  onSave: () => void;
  onCancel: () => void;
  onChange: (rule: Partial<ContextInjectionRule>) => void;
  isNew: boolean;
}

const ContextRuleForm: React.FC<ContextRuleFormProps> = ({ rule, onSave, onCancel, onChange, isNew }) => {
  return (
    <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-accent-primary)]">
          {isNew ? 'New Context Rule' : 'Edit Rule'}
        </span>
        <button
          onClick={onCancel}
          className={cn(
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "p-1 rounded-sm",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          aria-label="Cancel context rule editing"
        >
          <X size={12} />
        </button>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Rule Name"
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={rule.name ?? ''}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
        />
        
        <select
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={rule.condition?.type ?? 'always'}
          onChange={(e) => onChange({ 
            ...rule, 
            condition: { type: e.target.value as ContextInjectionCondition['type'] } 
          })}
        >
          <option value="always">Always</option>
          <option value="file-type">File Type Match</option>
          <option value="workspace-pattern">Workspace Pattern</option>
          <option value="keyword">Keyword Match</option>
        </select>
      </div>

      {rule.condition?.type && rule.condition.type !== 'always' && (
        <input
          type="text"
          placeholder={
            rule.condition.type === 'file-type' ? '*.ts, *.tsx' :
            rule.condition.type === 'workspace-pattern' ? '**/src/**' :
            'keyword to match'
          }
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={rule.condition?.value ?? ''}
          onChange={(e) => onChange({ 
            ...rule, 
            condition: { ...rule.condition, value: e.target.value } as ContextInjectionCondition 
          })}
        />
      )}

      <div className="text-[9px] text-[var(--color-text-dim)] space-y-1">
        <div># Context will be appended as "INJECTED CONTEXT" section</div>
        <div># Available placeholders: {'{{workspace}}'}, {'{{session}}'}, {'{{provider}}'}, {'{{activeFile}}'}, {'{{activeFileName}}'}, {'{{fileLanguage}}'}, {'{{selection}}'}, {'{{diagnostics}}'}</div>
      </div>

      <textarea
        placeholder="Context template to inject..."
        className="w-full min-h-[80px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={rule.template ?? ''}
        onChange={(e) => onChange({ ...rule, template: e.target.value })}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={!rule.name || !rule.template}
        >
          {isNew ? 'Add Rule' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

// Agent instruction form component
interface AgentInstructionFormProps {
  instruction: Partial<AgentInstruction>;
  onSave: (instruction: Partial<AgentInstruction>) => void;
  onCancel: () => void;
  isNew: boolean;
}

const AgentInstructionForm: React.FC<AgentInstructionFormProps> = ({ instruction, onSave, onCancel, isNew }) => {
  // Use local state for editing - only save when user clicks Save
  const [localInstruction, setLocalInstruction] = useState<Partial<AgentInstruction>>(instruction);

  const handleChange = useCallback((updates: Partial<AgentInstruction>) => {
    setLocalInstruction(updates);
  }, []);

  const handleSave = useCallback(() => {
    onSave(localInstruction);
  }, [onSave, localInstruction]);

  return (
    <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-accent-primary)]">
          {isNew ? 'New Agent Instruction' : 'Edit Instruction'}
        </span>
        <button
          onClick={onCancel}
          className={cn(
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "p-1 rounded-sm",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          aria-label="Cancel instruction editing"
        >
          <X size={12} />
        </button>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Instruction Name"
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.name ?? ''}
          onChange={(e) => handleChange({ ...localInstruction, name: e.target.value })}
        />
        
        <select
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.scope ?? 'global'}
          onChange={(e) => handleChange({ 
            ...localInstruction, 
            scope: e.target.value as AgentInstructionScope
          })}
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
        onChange={(e) => handleChange({ ...localInstruction, description: e.target.value })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
          value={localInstruction.trigger?.type ?? 'always'}
          onChange={(e) => handleChange({ 
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

        {localInstruction.trigger?.type && localInstruction.trigger.type !== 'always' && localInstruction.trigger.type !== 'manual' && (
          <input
            type="text"
            placeholder={
              localInstruction.trigger.type === 'keyword' ? 'research,find,search' :
              localInstruction.trigger.type === 'file-type' ? '*.ts, *.tsx' :
              'coding,debugging,planning'
            }
            className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
            value={localInstruction.trigger?.value ?? ''}
            onChange={(e) => handleChange({ 
              ...localInstruction, 
              trigger: { ...localInstruction.trigger, value: e.target.value } as AgentInstructionTrigger 
            })}
          />
        )}
      </div>

      <div className="text-[9px] text-[var(--color-text-dim)] space-y-1">
        <div># Instructions are injected into the system prompt when trigger conditions are met</div>
        <div># Use clear, actionable instructions that define agent behavior</div>
      </div>

      <textarea
        placeholder="Agent instructions (how the agent should behave)..."
        className="w-full min-h-[120px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={localInstruction.instructions ?? ''}
        onChange={(e) => handleChange({ ...localInstruction, instructions: e.target.value })}
      />

      <input
        type="text"
        placeholder="Tags (comma-separated, e.g., research,documentation)"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={(localInstruction.tags ?? []).join(', ')}
        onChange={(e) => handleChange({ 
          ...localInstruction, 
          tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
        })}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!localInstruction.name || !localInstruction.instructions}
        >
          {isNew ? 'Add Instruction' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

// Prompt Structure Preview Component
interface PromptStructurePreviewProps {
  settings: PromptSettings;
  activePersona: AgentPersona | undefined;
}

const PromptStructurePreview: React.FC<PromptStructurePreviewProps> = ({ settings, activePersona }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Build the sections that will be included
  const sections = useMemo(() => {
    const result: { name: string; status: 'always' | 'active' | 'inactive'; description: string }[] = [];

    // Core sections (always present)
    result.push({
      name: '1. Core Identity',
      status: 'always',
      description: 'You are Vyotiq, an expert AI coding assistant...',
    });

    result.push({
      name: '2. Workspace Context',
      status: settings.includeWorkspaceContext ? 'active' : 'inactive',
      description: 'Current workspace, session, and provider info',
    });

    result.push({
      name: '3. Tool Information',
      status: 'always',
      description: 'List of available tools (CRITICAL)',
    });

    result.push({
      name: '4. Active Persona',
      status: activePersona && activePersona.id !== 'default' && activePersona.systemPrompt ? 'active' : 'inactive',
      description: activePersona?.name ?? 'Default',
    });

    result.push({
      name: '5. Custom Instructions',
      status: settings.useCustomSystemPrompt && settings.customSystemPrompt ? 'active' : 'inactive',
      description: settings.customSystemPrompt ? `${settings.customSystemPrompt.slice(0, 50)}...` : 'Not set',
    });

    result.push({
      name: '6. Communication Style',
      status: 'active',
      description: `Tone: ${settings.responseFormat.tone}, Detail: ${settings.responseFormat.explanationDetail}`,
    });

    result.push({
      name: '7. Core Guidelines',
      status: 'always',
      description: 'File reading, code verification, safety rules (CRITICAL)',
    });

    // Agent instructions
    const enabledAgentInstructions = (settings.agentInstructions ?? []).filter(i => i.enabled);
    result.push({
      name: '8. Agent Instructions',
      status: enabledAgentInstructions.length > 0 ? 'active' : 'inactive',
      description: enabledAgentInstructions.length > 0 
        ? `${enabledAgentInstructions.length} enabled (${enabledAgentInstructions.map(i => i.name).slice(0, 3).join(', ')}${enabledAgentInstructions.length > 3 ? '...' : ''})`
        : 'None enabled',
    });

    // AGENTS.md (project-specific instructions)
    result.push({
      name: '9. Project Instructions (AGENTS.md)',
      status: 'active',
      description: 'Project-specific instructions from AGENTS.md, CLAUDE.md, copilot-instructions.md, etc. (auto-detected)',
    });

    const activeRules = settings.contextInjectionRules.filter(r => r.enabled);
    result.push({
      name: '10. Injected Context',
      status: activeRules.length > 0 ? 'active' : 'inactive',
      description: activeRules.length > 0 ? `${activeRules.length} active rule(s)` : 'No rules',
    });

    return result;
  }, [settings, activePersona]);

  return (
    <div className="mt-4 border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 text-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <FileText size={12} />
          <span>Prompt Structure Preview</span>
        </span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[var(--color-border-subtle)] space-y-1.5">
          <p className="text-[9px] text-[var(--color-text-dim)] mb-2">
            # This shows how your system prompt is assembled. Sections marked as "ALWAYS" cannot be disabled.
          </p>
          {sections.map((section, index) => (
            <div
              key={index}
              className={cn(
                "flex items-start gap-2 py-1 px-2 text-[9px]",
                section.status === 'always' && "bg-[var(--color-success)]/10 border-l-2 border-[var(--color-success)]",
                section.status === 'active' && "bg-[var(--color-info)]/10 border-l-2 border-[var(--color-info)]",
                section.status === 'inactive' && "bg-[var(--color-surface-3)] opacity-50"
              )}
            >
              <span className={cn(
                "font-medium min-w-[140px]",
                section.status === 'always' && "text-[var(--color-success)]",
                section.status === 'active' && "text-[var(--color-info)]",
                section.status === 'inactive' && "text-[var(--color-text-dim)]"
              )}>
                {section.name}
              </span>
              <span className="text-[var(--color-text-muted)] flex-1 truncate">
                {section.description}
              </span>
              <span className={cn(
                "text-[8px] px-1 py-0.5 uppercase",
                section.status === 'always' && "bg-[var(--color-success)]/20 text-[var(--color-success)]",
                section.status === 'active' && "bg-[var(--color-info)]/20 text-[var(--color-info)]",
                section.status === 'inactive' && "bg-[var(--color-surface-3)] text-[var(--color-text-dim)]"
              )}>
                {section.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingsPrompts;
