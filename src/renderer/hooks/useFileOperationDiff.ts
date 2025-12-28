/**
 * useFileOperationDiff Hook
 * 
 * Listens for file operation tool results (write, edit, create_file)
 * and automatically opens the modified file in a new editor tab.
 * 
 * This hook bridges the gap between tool execution in the agent
 * and the editor's file display functionality.
 */

import { useEffect, useRef } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import { useEditor } from '../state/EditorProvider';
import { createLogger } from '../utils/logger';

const logger = createLogger('useFileOperationDiff');

// Tools that produce file diffs
const FILE_OPERATION_TOOLS = ['write', 'edit', 'create_file'];

/**
 * Hook that automatically opens modified files in the editor.
 * 
 * @param options Configuration options
 * @param options.enabled Whether to enable auto-open (default: true)
 * @param options.autoOpenEditor Whether to automatically open file in editor tab (default: true)
 */
export function useFileOperationDiff(options?: {
  enabled?: boolean;
  autoOpenEditor?: boolean;
}) {
  const { enabled = true, autoOpenEditor = true } = options ?? {};

  const toolResults = useAgentSelector(
    (s) => s.toolResults,
    (a, b) => a === b,
  );
  const streamingDiff = useAgentSelector(
    (s) => s.streamingDiff,
    (a, b) => a === b,
  );
  const { openFile, isFileOpen, showDiff, isOperationDiffVisible } = useEditor();
  
  // Track processed tool results to avoid duplicates
  const processedResultsRef = useRef<Set<string>>(new Set());
  
  // Track streaming diff to detect when it completes
  const lastStreamingDiffRef = useRef<typeof streamingDiff>(null);
  
  // Listen for tool results and open modified files
  useEffect(() => {
    if (!enabled) return;
    
    // Process tool results from all sessions
    for (const runId of Object.keys(toolResults)) {
      const runResults = toolResults[runId];
      
      for (const callId of Object.keys(runResults)) {
        const resultKey = `${runId}-${callId}`;
        
        // Skip if already processed
        if (processedResultsRef.current.has(resultKey)) continue;
        
        const result = runResults[callId];
        
        // Check if this is a file operation tool
        if (!FILE_OPERATION_TOOLS.includes(result.toolName)) continue;
        
        const metadata = result.result.metadata;
        if (!metadata) continue;
        
        // Extract path and content from metadata
        const path = (metadata.filePath || metadata.path || metadata.file_path) as string;
        const newContent = (metadata.newContent || metadata.content) as string;
        const originalContent = metadata.originalContent as string | undefined;
        
        if (!path) continue;
        
        // Mark as processed
        processedResultsRef.current.add(resultKey);
        
        logger.debug('Detected file operation result', {
          toolName: result.toolName,
          path,
          hasOriginal: !!originalContent,
        });
        
        // Open the file and show diff
        if (autoOpenEditor && result.result.success) {
          // Open file in tab if not already open
          if (!isFileOpen(path)) {
            openFile(path);
          }
          
          // Show diff view if we have content to compare
          if (originalContent !== undefined && newContent) {
            showDiff(path, originalContent, newContent);
          }
        }
      }
    }
  }, [enabled, autoOpenEditor, toolResults, openFile, isFileOpen, showDiff]);
  
  // Handle streaming diff completion
  useEffect(() => {
    if (!enabled) return;
    
    const currentStreamingDiff = streamingDiff;
    const lastStreamingDiff = lastStreamingDiffRef.current;
    
    // Detect when streaming diff ends (goes from something to undefined/null)
    if (lastStreamingDiff && !currentStreamingDiff) {
      logger.debug('Streaming diff completed', { path: lastStreamingDiff.path });
      // The tool result handler will pick up the completed diff
    }
    
    lastStreamingDiffRef.current = currentStreamingDiff;
  }, [enabled, streamingDiff]);
  
  // Cleanup old processed results periodically to prevent memory leaks
  useEffect(() => {
    const cleanup = setInterval(() => {
      // Keep only the last 100 entries
      if (processedResultsRef.current.size > 100) {
        const entries = Array.from(processedResultsRef.current);
        processedResultsRef.current = new Set(entries.slice(-50));
      }
    }, 60000); // Every minute
    
    return () => clearInterval(cleanup);
  }, []);
  
  return {
    isOperationDiffVisible,
  };
}
