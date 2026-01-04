/**
 * FileChangeDiff Component
 * 
 * Wrapper component that displays file changes from tool results
 * using the DiffViewer. Handles the integration with tool metadata.
 */
import React, { memo, useCallback, useMemo } from 'react';
import { DiffViewer } from './DiffViewer';
import { useEditor } from '../../../../state/EditorProvider';
import type { ToolCall } from './types';

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
  const { openFile, showEditor } = useEditor();
  
  const fileData = useMemo(() => extractFileChangeData(tool), [tool]);
  
  // Handle edit - open file in editor (must be before conditional return)
  const handleEdit = useCallback(() => {
    if (fileData) {
      openFile(fileData.filePath);
      showEditor();
    }
  }, [fileData, openFile, showEditor]);
  
  if (!fileData) return null;
  
  const { filePath, originalContent, modifiedContent, isNewFile, diffId } = fileData;
  
  return (
    <DiffViewer
      filePath={filePath}
      originalContent={originalContent}
      modifiedContent={modifiedContent}
      isNewFile={isNewFile}
      diffId={diffId}
      onAccept={showActions ? () => {} : undefined}
      onReject={showActions && !isNewFile ? () => {} : undefined}
      onEdit={showActions ? handleEdit : undefined}
      defaultCollapsed={defaultCollapsed}
    />
  );
});

FileChangeDiff.displayName = 'FileChangeDiff';
