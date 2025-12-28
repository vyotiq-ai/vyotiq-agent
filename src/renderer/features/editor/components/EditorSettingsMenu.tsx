/**
 * EditorSettingsMenu Component
 * 
 * Dropdown menu for editor settings.
 * Refactored to use standard UI components and consistent styling.
 */

import React, { memo, useRef, useEffect } from 'react';
import {
  Type,
  Hash,
  Check,
  Zap,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import type { EditorSettings } from '../types';

interface EditorSettingsMenuProps {
  isOpen: boolean;
  settings: EditorSettings;
  onClose: () => void;
  onSettingsChange: (settings: Partial<EditorSettings>) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export const EditorSettingsMenu: React.FC<EditorSettingsMenuProps> = memo(({
  isOpen,
  settings,
  onClose,
  onSettingsChange,
  anchorRef: _anchorRef,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fontSizes = [10, 11, 12, 13, 14, 15, 16, 18, 20];
  const tabSizes = [2, 4, 8];
  const themes = [
    { id: 'vyotiq-dark', name: 'Vyotiq Dark' },
    { id: 'vs-dark', name: 'VS Dark' },
    { id: 'vs', name: 'VS Light' },
    { id: 'hc-black', name: 'High Contrast' },
  ];

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 w-72 py-1',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
        'rounded-lg shadow-xl font-mono',
        'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200'
      )}
      style={{
        right: 16,
        bottom: 40,
      }}
    >
      {/* Header */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--color-border-subtle)] mb-1">
        <Zap size={14} className="text-[var(--color-accent-primary)]" />
        <span className="text-[11px] font-bold text-[var(--color-text-primary)] uppercase tracking-tight">
          Editor Configurations
        </span>
      </div>

      <div className="max-h-[70vh] overflow-y-auto scrollbar-thin px-1">
        {/* Appearance Group */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 mb-3">
            <Type size={12} className="text-[var(--color-accent-secondary)]" />
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Appearance</span>
          </div>

          <div className="space-y-4">
            {/* Font Size */}
            <div>
              <div className="text-[10px] text-[var(--color-text-secondary)] mb-2">Font Size</div>
              <div className="flex flex-wrap gap-1">
                {fontSizes.map(size => (
                  <button
                    key={size}
                    onClick={() => onSettingsChange({ fontSize: size })}
                    className={cn(
                      'px-2 py-1 text-[10px] rounded transition-all',
                      settings.fontSize === size
                        ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] shadow-sm'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <div className="text-[10px] text-[var(--color-text-secondary)] mb-2">Editor Theme</div>
              <div className="grid grid-cols-2 gap-1.5">
                {themes.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => onSettingsChange({ theme: theme.id as EditorSettings['theme'] })}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-1.5 text-[10px] rounded border transition-all',
                      settings.theme === theme.id
                        ? 'bg-[var(--color-surface-2)] border-[var(--color-accent-primary)]/50 text-[var(--color-accent-primary)]'
                        : 'border-transparent bg-[var(--color-surface-2)]/50 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-secondary)]'
                    )}
                  >
                    <span className="truncate">{theme.name}</span>
                    {settings.theme === theme.id && <Check size={10} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--color-border-subtle)] mx-3 my-2" />

        {/* Formatting Group */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Hash size={12} className="text-[var(--color-accent-secondary)]" />
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">Formatting</span>
          </div>

          <div className="space-y-1">
            <Toggle
              label="Word Wrap"
              description="Wrap long lines"
              checked={settings.wordWrap === 'on'}
              onToggle={() => onSettingsChange({ wordWrap: settings.wordWrap === 'on' ? 'off' : 'on' })}
              size="sm"
            />
            <Toggle
              label="Minimap"
              description="Outline view"
              checked={settings.minimap}
              onToggle={() => onSettingsChange({ minimap: !settings.minimap })}
              size="sm"
            />
            <Toggle
              label="Whitespace"
              description="Render spaces"
              checked={settings.renderWhitespace !== 'none'}
              onToggle={() => onSettingsChange({
                renderWhitespace: settings.renderWhitespace === 'none' ? 'selection' : 'none'
              })}
              size="sm"
            />
            <Toggle
              label="Insert Spaces"
              description="Tab as spaces"
              checked={settings.insertSpaces}
              onToggle={() => onSettingsChange({ insertSpaces: !settings.insertSpaces })}
              size="sm"
            />
          </div>

          <div className="mt-4">
            <div className="text-[10px] text-[var(--color-text-secondary)] mb-2">Tab Size</div>
            <div className="flex gap-1.5">
              {tabSizes.map(size => (
                <button
                  key={size}
                  onClick={() => onSettingsChange({ tabSize: size })}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[10px] rounded border transition-all',
                    settings.tabSize === size
                      ? 'bg-[var(--color-surface-2)] border-[var(--color-accent-primary)]/50 text-[var(--color-accent-primary)]'
                      : 'border-transparent bg-[var(--color-surface-2)]/50 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--color-border-subtle)] mx-3 my-2" />

        {/* AI Features Group */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={12} className="text-[var(--color-accent-primary)]" />
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">AI Features</span>
          </div>

          <div className="space-y-1">
            <Toggle
              label="AI Features"
              description="Enable all AI features"
              checked={settings.enableAI !== false}
              onToggle={() => onSettingsChange({ enableAI: settings.enableAI === false })}
              size="sm"
            />
            <Toggle
              label="Inline Completions"
              description="Ghost text suggestions"
              checked={settings.enableInlineCompletions !== false}
              onToggle={() => onSettingsChange({ enableInlineCompletions: settings.enableInlineCompletions === false })}
              size="sm"
            />
            <Toggle
              label="Quick Fixes"
              description="AI-powered error fixes"
              checked={settings.enableQuickFixes !== false}
              onToggle={() => onSettingsChange({ enableQuickFixes: settings.enableQuickFixes === false })}
              size="sm"
            />
            <Toggle
              label="Selection Toolbar"
              description="Floating AI toolbar"
              checked={settings.enableSelectionToolbar !== false}
              onToggle={() => onSettingsChange({ enableSelectionToolbar: settings.enableSelectionToolbar === false })}
              size="sm"
            />
            <Toggle
              label="Code Lens"
              description="AI hints on functions"
              checked={settings.enableCodeLens !== false}
              onToggle={() => onSettingsChange({ enableCodeLens: settings.enableCodeLens === false })}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 mt-1 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30">
        <div className="text-[9px] text-[var(--color-text-placeholder)] flex justify-between">
          <span>{settings.fontFamily}</span>
          <span className="text-[var(--color-accent-primary)] uppercase tracking-widest opacity-50">Vyotiq_OS</span>
        </div>
      </div>
    </div>
  );
});

EditorSettingsMenu.displayName = 'EditorSettingsMenu';

EditorSettingsMenu.displayName = 'EditorSettingsMenu';
