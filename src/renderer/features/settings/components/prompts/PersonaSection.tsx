/**
 * Persona Section
 * 
 * Manages agent personas - predefined and custom personality profiles.
 */
import React, { useState, useCallback } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../utils/cn';
import type { PromptSectionBaseProps } from './types';
import type { AgentPersona } from '../../../../../shared/types';

// Using type alias instead of empty interface to avoid lint error
type PersonaSectionProps = PromptSectionBaseProps;

export const PersonaSection: React.FC<PersonaSectionProps> = ({ settings, onChange }) => {
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [newPersonaDraft, setNewPersonaDraft] = useState<Partial<AgentPersona> | null>(null);

  const handleSelectPersona = useCallback((personaId: string) => {
    onChange('activePersonaId', personaId);
    const persona = settings.personas.find(p => p.id === personaId);
    if (persona && persona.systemPrompt && persona.id !== 'default') {
      onChange('useCustomSystemPrompt', false);
    }
  }, [onChange, settings.personas]);

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

  const handleDeletePersona = useCallback((personaId: string) => {
    const persona = settings.personas.find(p => p.id === personaId);
    if (persona?.isBuiltIn) return;
    
    const newPersonas = settings.personas.filter(p => p.id !== personaId);
    onChange('personas', newPersonas);
    
    if (settings.activePersonaId === personaId) {
      onChange('activePersonaId', 'default');
    }
  }, [onChange, settings.personas, settings.activePersonaId]);

  const handleUpdatePersona = useCallback((personaId: string, updates: Partial<AgentPersona>) => {
    const newPersonas = settings.personas.map(p =>
      p.id === personaId ? { ...p, ...updates } : p
    );
    onChange('personas', newPersonas);
    setEditingPersonaId(null);
  }, [onChange, settings.personas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
        <span>available personas</span>
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
        <PersonaForm
          draft={newPersonaDraft}
          onDraftChange={setNewPersonaDraft}
          onSave={handleAddPersona}
          onCancel={() => setNewPersonaDraft(null)}
          isNew
        />
      )}

      {/* Persona list */}
      <div className="space-y-2">
        {settings.personas.map((persona) => {
          const isActive = settings.activePersonaId === persona.id;
          const isEditing = editingPersonaId === persona.id;

          if (isEditing && !persona.isBuiltIn) {
            return (
              <PersonaForm
                key={persona.id}
                persona={persona}
                draft={{
                  name: persona.name,
                  description: persona.description,
                  systemPrompt: persona.systemPrompt,
                }}
                onDraftChange={(_draft) => {
                  // We need to merge with existing persona for the form
                }}
                onSave={() => handleUpdatePersona(persona.id, {
                  name: persona.name,
                  description: persona.description,
                  systemPrompt: persona.systemPrompt,
                })}
                onCancel={() => setEditingPersonaId(null)}
                isNew={false}
                // Use a specialized edit form that manages its own state
              />
            );
          }

          return (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isActive={isActive}
              onSelect={() => handleSelectPersona(persona.id)}
              onEdit={() => setEditingPersonaId(persona.id)}
              onDelete={() => handleDeletePersona(persona.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Individual persona card */
interface PersonaCardProps {
  persona: AgentPersona;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PersonaCard: React.FC<PersonaCardProps> = ({
  persona,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}) => {
  return (
    <div
      className={cn(
        "p-3 border transition-all cursor-pointer",
        isActive
          ? "bg-[var(--color-surface-2)] border-[var(--color-accent-primary)]/50"
          : "bg-[var(--color-surface-1)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-subtle)]/80"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
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
        {!persona.isBuiltIn && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              title="Edit persona"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={onDelete}
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
};

/** Persona form for creating/editing */
interface PersonaFormProps {
  persona?: AgentPersona;
  draft: Partial<AgentPersona>;
  onDraftChange: (draft: Partial<AgentPersona>) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}

const PersonaForm: React.FC<PersonaFormProps> = ({ 
  persona, 
  draft, 
  onDraftChange, 
  onSave, 
  onCancel, 
  isNew 
}) => {
  // Use local state for editing existing personas
  const [localDraft, setLocalDraft] = useState<Partial<AgentPersona>>(
    persona ? {
      name: persona.name,
      description: persona.description,
      systemPrompt: persona.systemPrompt,
    } : draft
  );

  const handleChange = (updates: Partial<AgentPersona>) => {
    if (isNew) {
      onDraftChange(updates);
    } else {
      setLocalDraft(updates);
    }
  };

  const currentDraft = isNew ? draft : localDraft;

  return (
    <div className="space-y-3 p-3 bg-[var(--color-surface-2)] border border-[var(--color-accent-primary)]/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-accent-primary)]">
          {isNew ? 'New Persona' : 'Edit Persona'}
        </span>
        <button
          onClick={onCancel}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1"
        >
          <X size={12} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Persona Name"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={currentDraft.name ?? ''}
        onChange={(e) => handleChange({ ...currentDraft, name: e.target.value })}
      />
      <input
        type="text"
        placeholder="Short Description"
        className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none focus-visible:border-[var(--color-accent-primary)]/30"
        value={currentDraft.description ?? ''}
        onChange={(e) => handleChange({ ...currentDraft, description: e.target.value })}
      />
      <textarea
        placeholder="System Prompt..."
        className="w-full min-h-[100px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={currentDraft.systemPrompt ?? ''}
        onChange={(e) => handleChange({ ...currentDraft, systemPrompt: e.target.value })}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={!currentDraft.name || !currentDraft.systemPrompt}
        >
          {isNew ? 'Add Persona' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default PersonaSection;
