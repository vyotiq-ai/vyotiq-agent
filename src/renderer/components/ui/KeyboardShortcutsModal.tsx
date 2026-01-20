import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { cn } from '../../utils/cn';
import { KEYBOARD_SHORTCUTS } from '../../utils/constants';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const ShortcutKey: React.FC<{ keys: string }> = ({ keys }) => {
  const parts = keys.split('+').map(k => k.trim());
  
  return (
    <span className="flex items-center gap-0.5">
      {parts.map((key, index) => (
        <React.Fragment key={key}>
          <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-accent-primary)] min-w-[18px] text-center">
            {key === 'ctrl' ? '⌘/Ctrl' : key === 'shift' ? '⇧' : key === 'Enter' ? '↵' : key === 'Escape' ? 'Esc' : key}
          </kbd>
          {index < parts.length - 1 && <span className="text-[var(--color-text-placeholder)] text-[9px]">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

const formatShortcut = (shortcut: { key: string; modifier: string }): string => {
  if (shortcut.modifier) {
    return `${shortcut.modifier}+${shortcut.key}`;
  }
  return shortcut.key;
};

const shortcutCategories = [
  {
    title: 'general',
    shortcuts: [
      { ...KEYBOARD_SHORTCUTS.commandPalette, formatted: formatShortcut(KEYBOARD_SHORTCUTS.commandPalette) },
      { ...KEYBOARD_SHORTCUTS.settings, formatted: formatShortcut(KEYBOARD_SHORTCUTS.settings) },
      { ...KEYBOARD_SHORTCUTS.toggleSidebar, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleSidebar) },
      { ...KEYBOARD_SHORTCUTS.showShortcuts, formatted: formatShortcut(KEYBOARD_SHORTCUTS.showShortcuts) },
    ],
  },
  {
    title: 'chat',
    shortcuts: [
      { ...KEYBOARD_SHORTCUTS.newSession, formatted: formatShortcut(KEYBOARD_SHORTCUTS.newSession) },
      { ...KEYBOARD_SHORTCUTS.sendMessage, formatted: formatShortcut(KEYBOARD_SHORTCUTS.sendMessage) },
      { ...KEYBOARD_SHORTCUTS.newLine, formatted: formatShortcut(KEYBOARD_SHORTCUTS.newLine) },
      { ...KEYBOARD_SHORTCUTS.stopGeneration, formatted: formatShortcut(KEYBOARD_SHORTCUTS.stopGeneration) },
    ],
  },
  {
    title: 'panels',
    shortcuts: [
      { ...KEYBOARD_SHORTCUTS.toggleTerminal, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleTerminal) },
      { ...KEYBOARD_SHORTCUTS.toggleProblems, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleProblems) },
      { ...KEYBOARD_SHORTCUTS.toggleOutput, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleOutput) },
      { ...KEYBOARD_SHORTCUTS.toggleDebugConsole, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleDebugConsole) },
      { ...KEYBOARD_SHORTCUTS.toggleBrowser, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleBrowser) },
      { ...KEYBOARD_SHORTCUTS.toggleUndoHistory, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleUndoHistory) },
      { ...KEYBOARD_SHORTCUTS.toggleMetrics, formatted: formatShortcut(KEYBOARD_SHORTCUTS.toggleMetrics) },
    ],
  },
  {
    title: 'dev',
    shortcuts: [
      { ...KEYBOARD_SHORTCUTS.profileMetrics, formatted: formatShortcut(KEYBOARD_SHORTCUTS.profileMetrics) },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-md border border-[var(--color-border-subtle)]/80 bg-[var(--color-surface-1)] shadow-2xl overflow-hidden font-mono",
          "animate-in zoom-in-95 duration-200"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--color-error)]/80" />
              <span className="w-2 h-2 rounded-full bg-[var(--color-warning)]/80" />
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)]/80" />
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)] ml-2">
              <Keyboard size={10} className="inline mr-1" />
              shortcuts --list
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
          <div className="space-y-4">
            {shortcutCategories.map((category) => (
              <div key={category.title}>
                <h3 className="text-[10px] text-[var(--color-text-muted)] mb-2 flex items-center gap-1.5 border-b border-[var(--color-border-subtle)] pb-1">
                  <span className="text-[var(--color-accent-primary)]">›</span>
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.formatted}
                      className="flex items-center justify-between py-1.5 px-2 hover:bg-[var(--color-surface-3)] transition-colors"
                    >
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{shortcut.description}</span>
                      <ShortcutKey keys={shortcut.formatted} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <p className="text-[9px] text-[var(--color-text-placeholder)] text-center">
            <span className="text-[var(--color-text-muted)]">λ</span> press <kbd className="px-1 py-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-[var(--color-accent-primary)]/70 text-[9px]">?</kbd> anywhere to toggle
          </p>
        </div>
      </div>
    </div>
  );
};

