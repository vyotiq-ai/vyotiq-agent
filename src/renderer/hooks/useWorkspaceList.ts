import { useCallback, useMemo, useState } from 'react';
import { useAgentActions, useAgentSelector } from '../state/AgentProvider';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkspaceList');

/**
 * Hook to manage workspace list and selection.
 * 
 * When a workspace is selected, the active session is cleared to ensure
 * the agent operates in the correct workspace context.
 */
export const useWorkspaceList = () => {
  const actions = useAgentActions();
  const workspaces = useAgentSelector(
    (state) => state.workspaces ?? [],
    (a, b) => a === b,
  );
  const [isLoading, setIsLoading] = useState(false);
  
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.isActive),
    [workspaces]
  );

  const handleAddWorkspace = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      await actions.openWorkspaceDialog();
    } finally {
      setIsLoading(false);
    }
  }, [actions, isLoading]);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    // Don't switch if already active
    if (activeWorkspace?.id === workspaceId) return;
    
    if (isLoading) return;
    
    logger.info('Selecting workspace', { workspaceId });
    
    setIsLoading(true);
    try {
      await actions.setActiveWorkspace(workspaceId);
    } catch (error) {
      logger.error('Failed to set active workspace', { error });
    } finally {
      setIsLoading(false);
    }
  }, [actions, activeWorkspace?.id, isLoading]);

  const handleRemoveWorkspace = useCallback(async (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    if (isLoading) return;
    
    // Confirm removal if this is the active workspace
    if (activeWorkspace?.id === workspaceId) {
      logger.info('Removing active workspace', { workspaceId });
    }
    
    setIsLoading(true);
    try {
      if (window.vyotiq?.workspace) {
        await window.vyotiq.workspace.remove(workspaceId);
      }
    } catch (error) {
      logger.error('Failed to remove workspace', { error });
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace?.id, isLoading]);

  return {
    workspaces,
    activeWorkspace,
    isLoading,
    handleAddWorkspace,
    handleSelectWorkspace,
    handleRemoveWorkspace,
  };
};
