import React, { memo, useCallback, useState, useEffect } from 'react';
import { Terminal, AlertCircle, FileOutput, Bug } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SidebarFileTree } from '../../features/fileTree/components/SidebarFileTree';
import { SearchPanel, IndexStatusPanel } from '../../features/workspace';
import { openFileInEditor } from '../../features/editor/components/EditorPanel';
import { useWorkspaceState } from '../../state/WorkspaceProvider';

interface SidebarProps {
  collapsed: boolean;
  width?: number;
}

// Panel toggle icon button with optional badge
interface PanelIconProps {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  badge?: number;
  badgeType?: 'error' | 'warning' | 'info';
}

const PanelIcon = memo<PanelIconProps>(({ icon, label, shortcut, onClick, badge, badgeType = 'info' }) => (
  <button
    onClick={onClick}
    className={cn(
      'group relative p-1.5 rounded transition-all duration-150',
      'text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]',
      'hover:bg-[var(--color-accent-primary)]/10',
      'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
      badge && badge > 0 && badgeType === 'error' && 'text-[var(--color-error)]'
    )}
    title={`${label}${badge ? ` (${badge})` : ''} (${shortcut})`}
    aria-label={`${label}${badge ? `, ${badge} issues` : ''}`}
  >
    {icon}
    {/* Badge for counts */}
    {badge !== undefined && badge > 0 && (
      <span className={cn(
        'absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5',
        'flex items-center justify-center',
        'text-[8px] font-bold rounded-full',
        badgeType === 'error'
          ? 'bg-[var(--color-error)] text-white'
          : badgeType === 'warning'
          ? 'bg-[var(--color-warning)] text-black'
          : 'bg-[var(--color-info)] text-white'
      )}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
    {/* Hover indicator line */}
    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-[var(--color-accent-primary)] rounded-full transition-all duration-150 group-hover:w-3/4" />
  </button>
));
PanelIcon.displayName = 'PanelIcon';

interface ProblemCounts {
  errors: number;
  warnings: number;
}

const SidebarComponent: React.FC<SidebarProps> = ({ collapsed, width = 248 }) => {
  const [activeTab, setActiveTab] = useState<'files' | 'search'>('files');
  const [problemCounts, setProblemCounts] = useState<ProblemCounts>({ errors: 0, warnings: 0 });

  // Access workspace context for Rust backend integration
  const wsState = useWorkspaceState();
  const rustWorkspaceId = wsState?.rustWorkspaceId ?? null;

  // Listen for problem count updates
  useEffect(() => {
    const handleProblemCounts = (e: CustomEvent<ProblemCounts>) => {
      setProblemCounts(e.detail);
    };

    document.addEventListener('vyotiq:problems:counts', handleProblemCounts as EventListener);
    return () => {
      document.removeEventListener('vyotiq:problems:counts', handleProblemCounts as EventListener);
    };
  }, []);

  // Listen for global keyboard shortcuts to switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setActiveTab('search');
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setActiveTab('files');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Dispatch custom events to toggle panels
  const toggleTerminal = useCallback(() => {
    document.dispatchEvent(new CustomEvent('vyotiq:terminal:toggle'));
  }, []);

  const toggleProblems = useCallback(() => {
    document.dispatchEvent(new CustomEvent('vyotiq:problems:toggle'));
  }, []);

  const toggleOutput = useCallback(() => {
    document.dispatchEvent(new CustomEvent('vyotiq:output:toggle'));
  }, []);

  const toggleDebugConsole = useCallback(() => {
    document.dispatchEvent(new CustomEvent('vyotiq:debug-console:toggle'));
  }, []);

  const totalProblems = problemCounts.errors + problemCounts.warnings;

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-[var(--color-surface-sidebar)] border-r border-[var(--color-border-subtle)] shrink-0 z-20 box-border overflow-hidden font-mono',
        collapsed ? 'w-0 border-none opacity-0 transition-all duration-300 ease-in-out' : 'opacity-100',
      )}
      style={{ width: collapsed ? 0 : width }}
      role="complementary"
      aria-label="Sidebar navigation"
      aria-hidden={collapsed}
    >
      {/* Sidebar content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab switcher — replaces activity bar icons */}
        <div className="shrink-0 flex items-center border-b border-[var(--color-border-subtle)] px-1 h-[28px] gap-px">
          {(['files', 'search'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest rounded-sm transition-colors',
                activeTab === tab
                  ? 'text-[var(--color-text-primary)] bg-[var(--color-surface-2)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
              title={tab === 'files' ? 'Explorer (Ctrl+Shift+E)' : 'Search (Ctrl+Shift+F)'}
            >
              {tab === 'files' ? 'explorer' : 'search'}
            </button>
          ))}
        </div>

        {/* Tab content - fills remaining space */}
        <div className="flex-1 min-h-0 px-2 sm:px-3 pt-3 pb-3 overflow-hidden">
          {activeTab === 'files' && (
            <SidebarFileTree collapsed={collapsed} onFileOpen={openFileInEditor} />
          )}
          {activeTab === 'search' && (
            <SearchPanel
              workspaceId={rustWorkspaceId}
              onFileOpen={(path, _line) => openFileInEditor(path)}
            />
          )}
        </div>

        {/* Index status bar – shows progress/status when workspace is active */}
        {rustWorkspaceId && (
          <IndexStatusPanel workspaceId={rustWorkspaceId} />
        )}
      </div>

      {/* Bottom panel toggles - refined compact bar */}
      <div className={cn(
        'shrink-0 border-t border-[var(--color-border-subtle)]',
        'flex items-center justify-center gap-0.5 px-2 py-1',
        'bg-[var(--color-surface-sidebar)]'
      )}>
        <PanelIcon
          icon={<AlertCircle size={13} />}
          label="Problems"
          shortcut="Ctrl+Shift+M"
          onClick={toggleProblems}
          badge={totalProblems}
          badgeType={problemCounts.errors > 0 ? 'error' : 'warning'}
        />
        <PanelIcon
          icon={<FileOutput size={13} />}
          label="Output"
          shortcut="Ctrl+Shift+U"
          onClick={toggleOutput}
        />
        <PanelIcon
          icon={<Bug size={13} />}
          label="Debug Console"
          shortcut="Ctrl+Shift+Y"
          onClick={toggleDebugConsole}
        />
        <PanelIcon
          icon={<Terminal size={13} />}
          label="Terminal"
          shortcut="Ctrl+`"
          onClick={toggleTerminal}
        />
      </div>
    </aside>
  );
};

export const Sidebar = memo(SidebarComponent);
Sidebar.displayName = 'Sidebar';

