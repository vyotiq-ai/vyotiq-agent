/**
 * Context Rules Section
 * 
 * Manages context injection rules for dynamic prompt augmentation.
 */
import React, { useState, useCallback } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { Toggle } from '../../../../components/ui/Toggle';
import { cn } from '../../../../utils/cn';
import type { PromptSectionBaseProps } from './types';
import type { ContextInjectionRule, ContextInjectionCondition } from '../../../../../shared/types';

// Using type alias instead of empty interface to avoid lint error
type ContextRulesSectionProps = PromptSectionBaseProps;

export const ContextRulesSection: React.FC<ContextRulesSectionProps> = ({
  settings,
  onChange,
}) => {
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newRuleDraft, setNewRuleDraft] = useState<Partial<ContextInjectionRule> | null>(null);

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

  const handleDeleteRule = useCallback((ruleId: string) => {
    const newRules = settings.contextInjectionRules.filter(r => r.id !== ruleId);
    onChange('contextInjectionRules', newRules);
  }, [onChange, settings.contextInjectionRules]);

  const handleUpdateRule = useCallback((ruleId: string, updates: Partial<ContextInjectionRule>) => {
    const newRules = settings.contextInjectionRules.map(r =>
      r.id === ruleId ? { ...r, ...updates } : r
    );
    onChange('contextInjectionRules', newRules);
    setEditingRuleId(null);
  }, [onChange, settings.contextInjectionRules]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
        <span>context injection rules</span>
        <button
          onClick={() => setNewRuleDraft({ name: '', template: '', condition: { type: 'always' }, position: 'append' })}
          className="flex items-center gap-1 text-[var(--color-accent-primary)] hover:text-[var(--color-accent-hover)]"
        >
          <Plus size={12} />
          <span>Add Rule</span>
        </button>
      </div>

      <div className="p-2 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-dim)]">
        <p className="mb-1"># Context injection rules add extra context to prompts.</p>
        <p># Placeholders: {'{{workspace}}'}, {'{{session}}'}, {'{{provider}}'}</p>
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

      {/* Empty state */}
      {settings.contextInjectionRules.length === 0 && !newRuleDraft && (
        <div className="p-4 text-center text-[10px] text-[var(--color-text-dim)] border border-dashed border-[var(--color-border-subtle)]">
          No context injection rules configured.
          <br />
          Click "Add Rule" to create one.
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {settings.contextInjectionRules.map((rule) => {
          if (editingRuleId === rule.id) {
            return (
              <ContextRuleForm
                key={rule.id}
                rule={rule}
                onSave={() => {}}
                onCancel={() => setEditingRuleId(null)}
                onChange={(updates) => handleUpdateRule(rule.id, updates as ContextInjectionRule)}
                isNew={false}
              />
            );
          }

          return (
            <ContextRuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => handleUpdateRule(rule.id, { enabled: !rule.enabled })}
              onEdit={() => setEditingRuleId(rule.id)}
              onDelete={() => handleDeleteRule(rule.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Context rule card */
interface ContextRuleCardProps {
  rule: ContextInjectionRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ContextRuleCard: React.FC<ContextRuleCardProps> = ({
  rule,
  onToggle,
  onEdit,
  onDelete,
}) => {
  return (
    <div
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
            <Toggle label="" checked={rule.enabled} onToggle={onToggle} />
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
            onClick={onEdit}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Edit"
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

/** Context rule form */
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
        <button onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1">
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

      <textarea
        placeholder="Context template to inject..."
        className="w-full min-h-[80px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] font-mono outline-none focus-visible:border-[var(--color-accent-primary)]/30 resize-y"
        value={rule.template ?? ''}
        onChange={(e) => onChange({ ...rule, template: e.target.value })}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
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

export default ContextRulesSection;
