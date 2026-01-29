/**
 * Breakpoint Configuration Component
 * 
 * Allows users to configure debugging breakpoints:
 * - Break on specific tools
 * - Break on errors
 * - Conditional breakpoints
 */
import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Pause, AlertTriangle, Wrench } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface BreakpointConfigProps {
  sessionId: string;
}

interface Breakpoint {
  id: string;
  type: 'tool' | 'error' | 'condition';
  enabled: boolean;
  toolName?: string;
  condition?: string;
}

export const BreakpointConfig: React.FC<BreakpointConfigProps> = ({
  sessionId,
}) => {
  // Breakpoints are stored per session - in production this would sync with IPC
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([
    { id: 'bp-1', type: 'error', enabled: true },
    { id: 'bp-2', type: 'tool', enabled: true, toolName: 'bash' },
  ]);
  const [newToolName, setNewToolName] = useState('');

  // Sync breakpoints with backend when they change
  const syncBreakpoints = useCallback((bps: Breakpoint[]) => {
    // In production: window.vyotiq?.debug?.setBreakpoints(sessionId, bps)
    console.debug(`[BreakpointConfig] Syncing ${bps.length} breakpoints for session ${sessionId}`);
  }, [sessionId]);

  const toggleBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => {
      const updated = prev.map(bp => 
        bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
      );
      syncBreakpoints(updated);
      return updated;
    });
  }, [syncBreakpoints]);

  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => {
      const updated = prev.filter(bp => bp.id !== id);
      syncBreakpoints(updated);
      return updated;
    });
  }, [syncBreakpoints]);

  const addToolBreakpoint = useCallback(() => {
    if (!newToolName.trim()) return;
    setBreakpoints(prev => {
      const updated = [
        ...prev,
        {
          id: `bp-${Date.now()}`,
          type: 'tool' as const,
          enabled: true,
          toolName: newToolName.trim(),
        },
      ];
      syncBreakpoints(updated);
      return updated;
    });
    setNewToolName('');
  }, [newToolName, syncBreakpoints]);

  const addErrorBreakpoint = useCallback(() => {
    const hasErrorBp = breakpoints.some(bp => bp.type === 'error');
    if (hasErrorBp) return;
    setBreakpoints(prev => {
      const updated = [
        ...prev,
        { id: `bp-${Date.now()}`, type: 'error' as const, enabled: true },
      ];
      syncBreakpoints(updated);
      return updated;
    });
  }, [breakpoints, syncBreakpoints]);

  const getBreakpointIcon = (bp: Breakpoint) => {
    switch (bp.type) {
      case 'error':
        return <AlertTriangle size={12} className="text-[var(--color-error)]" />;
      case 'tool':
        return <Wrench size={12} className="text-[var(--color-accent-secondary)]" />;
      default:
        return <Pause size={12} className="text-[var(--color-accent-primary)]" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
      <div className="p-3 space-y-4">
        {/* Add breakpoint section */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono text-[var(--color-text-secondary)] uppercase tracking-wider">
            Add Breakpoint
          </h4>
          
          {/* Tool breakpoint */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newToolName}
              onChange={(e) => setNewToolName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addToolBreakpoint()}
              placeholder="Tool name (e.g., bash, write)"
              className="flex-1 px-2 py-1 text-[10px] font-mono bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded outline-none focus:border-[var(--color-accent-primary)]/50 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]"
            />
            <button
              onClick={addToolBreakpoint}
              disabled={!newToolName.trim()}
              className={cn(
                'px-2 py-1 rounded text-[10px] font-mono transition-colors',
                newToolName.trim()
                  ? 'bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-primary)]/80'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] cursor-not-allowed'
              )}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Error breakpoint button */}
          <button
            onClick={addErrorBreakpoint}
            disabled={breakpoints.some(bp => bp.type === 'error')}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded text-[10px] font-mono transition-colors',
              breakpoints.some(bp => bp.type === 'error')
                ? 'bg-[var(--color-surface-2)] text-[var(--color-text-dim)] cursor-not-allowed'
                : 'bg-[var(--color-error)]/10 text-[var(--color-error)] hover:bg-[var(--color-error)]/20 border border-[var(--color-error)]/30'
            )}
          >
            <AlertTriangle size={12} />
            Break on errors
          </button>
        </div>

        {/* Active breakpoints */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono text-[var(--color-text-secondary)] uppercase tracking-wider">
            Active Breakpoints ({breakpoints.filter(bp => bp.enabled).length})
          </h4>
          
          {breakpoints.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-dim)] italic">
              No breakpoints configured
            </p>
          ) : (
            <div className="space-y-1">
              {breakpoints.map(bp => (
                <div
                  key={bp.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded border transition-colors',
                    bp.enabled
                      ? 'bg-[var(--color-surface-1)] border-[var(--color-border-subtle)]'
                      : 'bg-[var(--color-surface-base)] border-transparent opacity-50'
                  )}
                >
                  <button
                    onClick={() => toggleBreakpoint(bp.id)}
                    className={cn(
                      'w-3 h-3 rounded-full border-2 transition-colors',
                      bp.enabled
                        ? 'bg-[var(--color-error)] border-[var(--color-error)]'
                        : 'bg-transparent border-[var(--color-text-dim)]'
                    )}
                    title={bp.enabled ? 'Disable' : 'Enable'}
                  />
                  
                  {getBreakpointIcon(bp)}
                  
                  <span className="flex-1 text-[10px] font-mono text-[var(--color-text-secondary)]">
                    {bp.type === 'error' && 'On any error'}
                    {bp.type === 'tool' && `On tool: ${bp.toolName}`}
                    {bp.type === 'condition' && `Condition: ${bp.condition}`}
                  </span>
                  
                  <button
                    onClick={() => removeBreakpoint(bp.id)}
                    className="p-1 rounded hover:bg-[var(--color-surface-2)] transition-colors text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
                    title="Remove"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
          <p className="text-[9px] text-[var(--color-text-dim)]">
            Breakpoints pause execution before the specified action, allowing you to inspect state and step through manually.
          </p>
        </div>
      </div>
    </div>
  );
};
