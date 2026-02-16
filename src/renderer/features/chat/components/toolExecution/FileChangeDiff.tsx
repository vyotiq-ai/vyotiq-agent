/**
 * FileChangeDiff Component
 * 
 * Wrapper component that displays file changes from tool results
 * using the DiffViewer. Handles the integration with tool metadata
 * and real-time streaming diffs during tool execution.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { DiffViewer } from './DiffViewer';
import { useFileDiffStream } from '../../../../hooks/useFileDiffStream';
import { createLogger } from '../../../../utils/logger';
import type { ToolCall } from './types';

const logger = createLogger('FileChangeDiff');

interface FileChangeDiffProps {
  tool: ToolCall;
  showActions?: boolean;
  defaultCollapsed?: boolean;
  /** Run ID for looking up streaming diff data */
  runId?: string;
}

function extractFileChangeData(tool: ToolCall): {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  isNewFile: boolean;
  diffId: string;
} | null {
  const meta = tool.resultMetadata;
  if (!meta) return null;
  
  const filePath = (meta.filePath as string) || 
                   (meta.path as string) || 
                   (tool.arguments?.file_path as string) ||
                   (tool.arguments?.path as string) || '';
  
  if (!filePath) return null;
  
  const originalContent = (meta.originalContent as string) || '';
  const modifiedContent = (meta.newContent as string) || 
                          (meta.content as string) || '';
  
  const isNewFile = !originalContent || originalContent.length === 0;
  
  // Generate unique diff ID from tool call ID for persistence
  const diffId = `${tool.callId}-${filePath}`;
  
  return { filePath, originalContent, modifiedContent, isNewFile, diffId };
}

export const FileChangeDiff: React.FC<FileChangeDiffProps> = memo(({
  tool,
  showActions = false,
  defaultCollapsed = false,
  runId,
}) => {
  const [isAccepted, setIsAccepted] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  
  // Get streaming diff state if available (for in-progress tools)
  const streamingDiff = useFileDiffStream(runId, tool.callId);
  
  const fileData = useMemo(() => {
    // Prefer streaming diff data when available (real-time updates)
    if (streamingDiff) {
      return {
        filePath: streamingDiff.filePath,
        originalContent: streamingDiff.originalContent,
        modifiedContent: streamingDiff.modifiedContent,
        isNewFile: streamingDiff.isNewFile,
        diffId: `${tool.callId}-${streamingDiff.filePath}`,
      };
    }
    // Fall back to tool result metadata
    return extractFileChangeData(tool);
  }, [tool, streamingDiff]);
  
  const isStreaming = streamingDiff ? !streamingDiff.isComplete : false;
  
  // Handle accept - mark the change as accepted (change is already applied)
  const handleAccept = useCallback(() => {
    setIsAccepted(true);
  }, []);
  
  // Handle reject - revert the file to original content
  const handleReject = useCallback(async () => {
    if (!fileData) return;
    
    try {
      // Write original content back to file
      const result = await window.vyotiq?.files?.write(fileData.filePath, fileData.originalContent);
      if (result?.success) {
        setIsRejected(true);
      }
    } catch (err) {
      logger.warn('Failed to reject file change', { filePath: fileData.filePath, error: err instanceof Error ? err.message : String(err) });
    }
  }, [fileData]);
  
  if (!fileData) return null;
  
  const { filePath, originalContent, modifiedContent, isNewFile, diffId } = fileData;
  
  // Completed diffs persist — show collapsed with resolved state badge
  const resolvedCollapsed = isAccepted || isRejected || defaultCollapsed;
  
  return (
    <DiffViewer
      filePath={filePath}
      originalContent={originalContent}
      modifiedContent={modifiedContent}
      isNewFile={isNewFile}
      diffId={diffId}
      onAccept={showActions && !isAccepted && !isRejected ? handleAccept : undefined}
      onReject={showActions && !isNewFile && !isAccepted && !isRejected ? handleReject : undefined}
      onEdit={undefined}
      defaultCollapsed={resolvedCollapsed}
      isStreaming={isStreaming}
    />
  );

});

FileChangeDiff.displayName = 'FileChangeDiff';
