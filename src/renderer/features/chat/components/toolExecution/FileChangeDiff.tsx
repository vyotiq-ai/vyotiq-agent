/**
 * FileChangeDiff Component
 * 
 * Wrapper component that displays file changes from tool results
 * using the DiffViewer. Handles the integration with tool metadata.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { DiffViewer } from './DiffViewer';
import { createLogger } from '../../../../utils/logger';
import type { ToolCall } from './types';

const logger = createLogger('FileChangeDiff');

interface FileChangeDiffProps {
  tool: ToolCall;
  showActions?: boolean;
  defaultCollapsed?: boolean;
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
}) => {
  const [isAccepted, setIsAccepted] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  
  const fileData = useMemo(() => extractFileChangeData(tool), [tool]);
  
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
  
  // If change was accepted or rejected, don't show the diff anymore
  if (isAccepted || isRejected) return null;
  
  const { filePath, originalContent, modifiedContent, isNewFile, diffId } = fileData;
  
  return (
    <DiffViewer
      filePath={filePath}
      originalContent={originalContent}
      modifiedContent={modifiedContent}
      isNewFile={isNewFile}
      diffId={diffId}
      onAccept={showActions ? handleAccept : undefined}
      onReject={showActions && !isNewFile ? handleReject : undefined}
      onEdit={undefined}
      defaultCollapsed={defaultCollapsed}
    />
  );
});

FileChangeDiff.displayName = 'FileChangeDiff';
