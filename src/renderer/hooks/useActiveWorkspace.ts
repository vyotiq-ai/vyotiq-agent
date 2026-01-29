import { useAgentSelector } from '../state/AgentProvider';

export const useActiveWorkspace = () => {
  return useAgentSelector(
    (state) => state.workspaces.find((workspace) => workspace.isActive),
    (a, b) => a === b,
  );
};
