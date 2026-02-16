import { useMemo, useState, useEffect, useCallback } from 'react';
import { useAgentActions, useAgentSelector } from '../state/AgentProvider';
import { getCurrentWorkspacePath } from '../state/WorkspaceProvider';

export const useAgentStatus = () => {
  const actions = useAgentActions();
  const [elapsedTime, setElapsedTime] = useState(0);

  const snapshot = useAgentSelector(
    (state) => {
      const activeSession = state.activeSessionId
        ? state.sessions.find((session) => session.id === state.activeSessionId)
        : undefined;

      const activeSessionId = state.activeSessionId;
      return {
        activeSessionId,
        sessionStatus: activeSession?.status ?? 'idle',
        yoloEnabled: activeSession?.config.yoloMode,
        messageCount: activeSession?.messages.length ?? 0,
        agentStatusInfo: activeSessionId ? state.agentStatus[activeSessionId] : undefined,
        contextMetricsInfo: activeSessionId ? state.contextMetrics[activeSessionId] : undefined,
      };
    },
    (a, b) =>
      a.activeSessionId === b.activeSessionId &&
      a.sessionStatus === b.sessionStatus &&
      a.yoloEnabled === b.yoloEnabled &&
      a.messageCount === b.messageCount &&
      a.agentStatusInfo === b.agentStatusInfo &&
      a.contextMetricsInfo === b.contextMetricsInfo,
  );
  
  // Use the actual message from the backend.
  // Only clean duplicate iteration text when the IterationControl component
  // is able to display the iteration count (both values are defined).
  // Otherwise, preserve the iteration info in the status message as it's
  // the only indication of progress the user sees.
  const statusMessage = useMemo(() => {
    const rawMessage = snapshot.agentStatusInfo?.message ?? '';
    if (!rawMessage) return '';
    
    // Only strip iteration text if the structured iteration metadata
    // is available (so IterationControl can display it instead)
    const hasStructuredIteration = 
      snapshot.agentStatusInfo?.currentIteration !== undefined &&
      snapshot.agentStatusInfo?.maxIterations !== undefined;
    
    if (hasStructuredIteration) {
      const cleaned = rawMessage
        .replace(/iteration[s]?:?\s*\d+\s*(?:\/|of)\s*\d+/gi, '')
        .trim();
      return cleaned || '';
    }
    
    return rawMessage;
  }, [snapshot.agentStatusInfo?.message, snapshot.agentStatusInfo?.currentIteration, snapshot.agentStatusInfo?.maxIterations]);
  
  // Check if paused from status or metadata flag
  const isPaused = snapshot.sessionStatus === 'paused' 
    || snapshot.agentStatusInfo?.status === 'paused'
    || Boolean(snapshot.agentStatusInfo && 'metadata' in snapshot.agentStatusInfo && (snapshot.agentStatusInfo as { metadata?: { paused?: boolean } }).metadata?.paused);
  
  // Determine if agent is actively working
  const isWorking = !isPaused && (snapshot.sessionStatus === 'running' || snapshot.sessionStatus === 'awaiting-confirmation');
  
  // Get the status phase for styling
  const statusPhase = snapshot.agentStatusInfo?.status;
  
  // Track elapsed time when working or paused
  useEffect(() => {
    // Only reset time if not working AND not paused (truly idle)
    if (!isWorking && !isPaused) {
      setElapsedTime(0);
      return;
    }
    
    // Keep timer running when paused
    if (!isWorking && isPaused) {
      // Timer stays at current value, don't update
      return;
    }
    
    const startTime = snapshot.agentStatusInfo?.runStartedAt ?? snapshot.agentStatusInfo?.timestamp ?? Date.now();
    
    const updateElapsed = () => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    
    return () => clearInterval(interval);
  }, [isWorking, isPaused, snapshot.agentStatusInfo?.runStartedAt, snapshot.agentStatusInfo?.timestamp]);
  
  // Format elapsed time as mm:ss
  const formattedElapsedTime = useMemo(() => {
    const mins = Math.floor(elapsedTime / 60);
    const secs = elapsedTime % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [elapsedTime]);
  
  // Get short session ID for display (first 6 chars)
  const shortSessionId = useMemo(() => {
    if (!snapshot.activeSessionId) return '------';
    return snapshot.activeSessionId.substring(0, 6);
  }, [snapshot.activeSessionId]);
  
  // Count messages in session — wrapped in useCallback for stable identity
  const handleNewSession = useCallback(() => {
    actions.startSession?.(undefined, getCurrentWorkspacePath());
  }, [actions]);

  return {
    status: snapshot.sessionStatus,
    yoloEnabled: snapshot.yoloEnabled,
    handleNewSession,
    // Real-time status from backend
    isWorking,
    statusMessage,
    statusPhase,
    contextUtilization: snapshot.contextMetricsInfo?.metrics.utilization ?? snapshot.agentStatusInfo?.contextUtilization,
    contextMetrics: snapshot.contextMetricsInfo,
    // New fields for enhanced display
    elapsedTime,
    formattedElapsedTime,
    shortSessionId,
    messageCount: snapshot.messageCount,
    activeSessionId: snapshot.activeSessionId,
    isPaused,
    // Provider/model info for current iteration
    activeProvider: snapshot.agentStatusInfo?.provider,
    activeModelId: snapshot.agentStatusInfo?.modelId,
    currentIteration: snapshot.agentStatusInfo?.currentIteration,
    maxIterations: snapshot.agentStatusInfo?.maxIterations,
  };
};
