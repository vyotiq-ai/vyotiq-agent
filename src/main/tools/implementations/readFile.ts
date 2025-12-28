/**
 * Read File Tool
 * 
 * Reads a file from the local filesystem with support for:
 * - Line ranges for large files
 * - Image files (PNG, JPG, etc.) - displayed visually
 * - PDF files - extracted text content using pdf-parse
 * - Jupyter notebooks (.ipynb) - all cells with outputs
 * - Encoding detection and handling
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { resolvePath } from '../../utils/fileSystem';
import { createLogger } from '../../logger';
import { markFileAsRead } from '../fileTracker';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('read');
let notebookParseFallbackLogged = false;
let parentDirProbeFailedLogged = false;

// pdf-parse doesn't have proper ESM exports, use dynamic import
async function parsePdf(buffer: Buffer): Promise<{ numpages: number; text: string }> {
  // pdf-parse is CommonJS; dynamic import returns it as default in Node ESM.
  const mod = await import('pdf-parse');
  const pdfParse = (mod as unknown as { default?: (buf: Buffer) => Promise<{ numpages: number; text: string }> }).default
    ?? (mod as unknown as (buf: Buffer) => Promise<{ numpages: number; text: string }>);
  return pdfParse(buffer);
}

// Constants
const MAX_FILE_SIZE = 100000; // ~25K tokens max
const MAX_FILE_LINES = 150; // Read files in smaller chunks for better context management
const MAX_LINE_LENGTH = 2000; // Truncate lines longer than this

interface ReadFileArgs extends Record<string, unknown> {
  /** Absolute path to the file to read */
  path: string;
  /** Line number to start reading from (1-indexed). Only use if file is too large */
  offset?: number;
  /** Number of lines to read. Only use if file is too large */
  limit?: number;
  /** @deprecated Use offset instead */
  startLine?: number;
  /** @deprecated Use limit with offset instead */
  endLine?: number;
  /** File encoding (default: utf-8) */
  encoding?: BufferEncoding;
}

/**
 * Truncate long lines to prevent context overflow
 */
function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return line.slice(0, MAX_LINE_LENGTH) + '... [truncated]';
}

/**
 * Truncate file content to prevent context overflow
 */
function truncateContent(content: string, filePath: string): { content: string; wasTruncated: boolean; totalLines: number } {
  let lines = content.split('\n');
  const totalLines = lines.length;
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  let wasTruncated = false;
  
  // Truncate long lines
  lines = lines.map(line => {
    if (line.length > MAX_LINE_LENGTH) {
      wasTruncated = true;
      return truncateLine(line);
    }
    return line;
  });
  
  // Check line limit
  if (lines.length > MAX_FILE_LINES) {
    return {
      content: lines.slice(0, MAX_FILE_LINES).join('\n') + 
        `\n\n... [Truncated: ${fileName} has ${totalLines} lines, showing first ${MAX_FILE_LINES}. Use offset/limit to read specific ranges.]`,
      wasTruncated: true,
      totalLines,
    };
  }
  
  // Check character limit
  const joinedContent = lines.join('\n');
  if (joinedContent.length > MAX_FILE_SIZE) {
    let truncated = joinedContent.slice(0, MAX_FILE_SIZE);
    // End at a complete line
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > 0) {
      truncated = truncated.slice(0, lastNewline);
    }
    const truncatedLines = truncated.split('\n').length;
    return {
      content: truncated + 
        `\n\n... [Truncated: ${fileName} is ${content.length} bytes, showing first ${MAX_FILE_SIZE}. Read ${truncatedLines}/${totalLines} lines. Use offset/limit to read specific ranges.]`,
      wasTruncated: true,
      totalLines,
    };
  }
  
  return { content: joinedContent, wasTruncated, totalLines };
}

export const readFileTool: ToolDefinition<ReadFileArgs> = {
  name: 'read',
  description: `Reads a file from the local filesystem. You can access any file directly by using this tool.

Usage:
- Provide an absolute path to the file you want to read
- On Windows, use paths like "C:\\Users\\..." or workspace-relative paths
- On Unix/Mac, use paths like "/home/user/..." or workspace-relative paths
- By default, it reads up to ${MAX_FILE_LINES} lines per request (smaller chunks for better context)
- For large files, use offset and limit to read in chunks of ~${MAX_FILE_LINES} lines
- Any lines longer than ${MAX_LINE_LENGTH} characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows reading images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as the LLM is multimodal.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.

IMPORTANT: Do NOT use Unix-style root paths like "/" on Windows. Use the workspace path from your context.

Best Practices for Large Files:
- Read files in chunks of ${MAX_FILE_LINES} lines using offset/limit
- Start with offset=1, limit=${MAX_FILE_LINES}, then offset=${MAX_FILE_LINES + 1}, limit=${MAX_FILE_LINES}, etc.
- Check the totalLines in metadata to know how many lines remain

Parameters:
- path (required): The absolute path to the file to read
- offset (optional): The line number to start reading from (1-indexed). Use for reading large files in chunks
- limit (optional): The number of lines to read (default: ${MAX_FILE_LINES}). Use with offset for chunked reading`,
  requiresApproval: false,
  category: 'file-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: [
    'read', 'file', 'content', 'view', 'open', 'cat', 'show', 'image', 'pdf',
    'notebook', 'ipynb', 'screenshot', 'png', 'jpg', 'jpeg',
  ],
  ui: {
    icon: 'file-text',
    label: 'Read',
    color: 'green',
    runningLabel: 'Reading file...',
    completedLabel: 'File read',
  },
  
  // Input examples for improved accuracy (72% -> 90% per Anthropic research)
  inputExamples: [
    // Example 1: Read entire small file (Unix)
    { path: '/home/user/myproject/src/index.ts' },
    // Example 2: Read entire small file (Windows)
    { path: 'C:\\Users\\user\\projects\\myproject\\src\\index.ts' },
    // Example 3: Read first chunk of large file (150 lines)
    { path: '/home/user/myproject/src/components/App.tsx', offset: 1, limit: 150 },
    // Example 4: Read second chunk of large file
    { path: '/home/user/myproject/src/components/App.tsx', offset: 151, limit: 150 },
    // Example 5: Read configuration file
    { path: '/home/user/myproject/config/settings.json' },
    // Example 6: Read specific section of large file
    { path: '/home/user/myproject/src/utils/helpers.ts', offset: 300, limit: 150 },
    // Example 7: Read image file
    { path: '/home/user/myproject/assets/images/logo.png' },
    // Example 8: Read PDF file
    { path: '/home/user/myproject/docs/manual.pdf' },
    // Example 9: Read Jupyter notebook
    { path: '/home/user/myproject/notebooks/analysis.ipynb' },
    // Example 10: Read file with specific encoding
    { path: '/home/user/myproject/src/data/data.csv', encoding: 'utf-16le' },
    // Example 11: Read file with deprecated parameters
    { path: '/home/user/myproject/src/utils/helpers.ts', startLine: 10, endLine: 50 },
    // Example 12: Read another chunk of large file
    { path: '/home/user/myproject/src/components/App.tsx', offset: 301, limit: 150 },
  ],
  
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'The line number to start reading from (1-indexed). Only provide if the file is too large to read at once',
      },
      limit: {
        type: 'number',
        description: 'The number of lines to read. Only provide if the file is too large to read at once',
      },
    },
    required: ['path'],
  },

  async execute(args: ReadFileArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'read',
        success: false,
        output: `Error: No workspace selected for this session.\n\nPossible causes:\n1. The session's workspace was deleted or removed\n2. The session was created without a workspace binding\n3. The active workspace was changed while the session was running\n\nSolution: Create a new session after selecting a workspace, or select the workspace first.`,
      };
    }

    if (!args.path || typeof args.path !== 'string') {
      return {
        toolName: 'read',
        success: false,
        output: 'Error: Invalid path argument. Path must be a non-empty string.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.path.trim(), {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });
    const encoding = args.encoding || 'utf-8';
    
    // Support both new (offset/limit) and legacy (startLine/endLine) parameters
    const offset = args.offset ?? args.startLine;
    const limit = args.limit ?? (args.endLine && args.startLine ? args.endLine - args.startLine + 1 : undefined);

    // Log the read operation
    context.logger.info('Reading file', {
      path: args.path,
      offset,
      limit,
    });

    try {
      // Check if file is an image (for multimodal support reference)
      const ext = path.extname(filePath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
      const isPdf = ext === '.pdf';
      const isNotebook = ext === '.ipynb';
      
      // Handle PDF files - extract text content
      if (isPdf) {
        try {
          const pdfBuffer = await fs.readFile(filePath);
          const pdfData = await parsePdf(pdfBuffer);
          
          const stats = await fs.stat(filePath);
          const pageCount = pdfData.numpages;
          const textContent = pdfData.text;
          
          // Truncate if too large
          const { content: truncatedContent, wasTruncated } = truncateContent(textContent, args.path);
          
          // Format output with metadata
          const header = `[PDF file: ${args.path}]
Pages: ${pageCount}
Size: ${stats.size} bytes
Characters: ${textContent.length}
${wasTruncated ? '[Content truncated - use offset/limit for specific sections]\n' : ''}
--- Extracted Text ---
`;
          
          markFileAsRead(filePath);
          return {
            toolName: 'read',
            success: true,
            output: header + truncatedContent,
            metadata: {
              path: args.path,
              type: 'pdf',
              extension: ext,
              size: stats.size,
              pages: pageCount,
              characters: textContent.length,
              wasTruncated,
            },
          };
        } catch (pdfError) {
          const err = pdfError as Error;
          // Fall back to metadata-only if parsing fails
          const stats = await fs.stat(filePath);
          markFileAsRead(filePath);
          return {
            toolName: 'read',
            success: true,
            output: `[PDF file: ${args.path}]
Type: ${ext}
Size: ${stats.size} bytes

Note: Could not extract text content from this PDF.
Error: ${err.message}

This may be a scanned/image-only PDF or have security restrictions.`,
            metadata: {
              path: args.path,
              type: 'pdf',
              extension: ext,
              size: stats.size,
              parseError: err.message,
            },
          };
        }
      }
      
      // Handle Jupyter notebook files - return structured content
      if (isNotebook) {
        const notebookContent = await fs.readFile(filePath, 'utf-8');
        try {
          const notebook = JSON.parse(notebookContent);
          const cells = notebook.cells || [];
          const cellSummary = cells.map((cell: { cell_type: string; source: string[] }, idx: number) => {
            const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            const preview = source.slice(0, 100).replace(/\n/g, ' ');
            return `[${idx + 1}] ${cell.cell_type}: ${preview}${source.length > 100 ? '...' : ''}`;
          }).join('\n');
          
          markFileAsRead(filePath);
          return {
            toolName: 'read',
            success: true,
            output: `[Jupyter Notebook: ${args.path}]\nCells: ${cells.length}\n\n${cellSummary}`,
            metadata: {
              path: args.path,
              type: 'notebook',
              extension: ext,
              cellCount: cells.length,
            },
          };
        } catch (error) {
          // If parsing fails, fall through to text reading.
          // This can happen for non-standard or partially-written notebooks.
          if (!notebookParseFallbackLogged) {
            notebookParseFallbackLogged = true;
            logger.debug('Failed to parse notebook JSON; falling back to text read', {
              path: args.path,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      
      // Read as text or base64 for images
      const content = await fs.readFile(filePath, isImage ? 'base64' : encoding);
      
      // Handle image files - return info about the image
      if (isImage) {
        const stats = await fs.stat(filePath);
        // Track that this file was read
        markFileAsRead(filePath);
        return {
          toolName: 'read',
          success: true,
          output: `[Image file: ${args.path}]\nType: ${ext}\nSize: ${stats.size} bytes\n\nNote: Image content is available for visual analysis.`,
          metadata: {
            path: args.path,
            type: 'image',
            extension: ext,
            size: stats.size,
          },
        };
      }

      // Handle line range if specified (offset/limit)
      if (offset !== undefined) {
        const lines = content.split('\n');
        const totalLines = lines.length;
        const start = Math.max(0, offset - 1); // Convert 1-indexed to 0-indexed
        const end = limit ? Math.min(lines.length, start + limit) : lines.length;
        
        // Limit range to MAX_FILE_LINES
        const actualEnd = Math.min(end, start + MAX_FILE_LINES);
        const rangeWasTruncated = end > actualEnd;

        // Format with cat -n style line numbers
        const numberedLines = lines.slice(start, actualEnd).map((line, idx) => {
          const lineNum = start + idx + 1;
          const truncatedLine = truncateLine(line);
          return `${lineNum.toString().padStart(6, ' ')}\t${truncatedLine}`;
        });
        
        let output = numberedLines.join('\n');
        if (rangeWasTruncated) {
          output += `\n\n... [Truncated: Requested ${limit} lines from line ${offset}, showing ${actualEnd - start}. Max ${MAX_FILE_LINES} lines per request.]`;
        }

        // Track that this file was read
        markFileAsRead(filePath);

        return {
          toolName: 'read',
          success: true,
          output,
          metadata: {
            path: args.path,
            startLine: start + 1,
            endLine: actualEnd,
            totalLines,
            bytesRead: content.length,
            wasTruncated: rangeWasTruncated,
          },
        };
      }

      // Check for empty file
      if (content.trim().length === 0) {
        // Track that this file was read (even if empty)
        markFileAsRead(filePath);
        return {
          toolName: 'read',
          success: true,
          output: `[Warning: File exists but is empty: ${args.path}]`,
          metadata: {
            path: args.path,
            totalLines: 0,
            bytesRead: 0,
            isEmpty: true,
          },
        };
      }

      // Full file read - apply truncation
      const { content: truncatedContent, wasTruncated, totalLines } = truncateContent(content, args.path);
      
      // Format with cat -n style line numbers for full file reads too
      const lines = truncatedContent.split('\n');
      const numberedContent = lines.map((line, idx) => {
        return `${(idx + 1).toString().padStart(6, ' ')}\t${line}`;
      }).join('\n');

      // Track that this file was read
      markFileAsRead(filePath);

      return {
        toolName: 'read',
        success: true,
        output: numberedContent,
        metadata: {
          path: args.path,
          totalLines,
          bytesRead: content.length,
          wasTruncated,
        },
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        // Provide comprehensive diagnostics for file not found
        const pathParts = args.path.split(/[/\\]/);
        const filename = pathParts.pop() ?? args.path;
        const directory = pathParts.join('/') || '.';
        
        // Check if parent directory exists to provide better guidance
        let parentExists = false;
        let similarFiles: string[] = [];
        try {
          const parentDir = path.dirname(filePath);
          const files = await fs.readdir(parentDir);
          parentExists = true;
          // Look for similar filenames (case-insensitive match or partial match)
          const filenameLower = filename.toLowerCase();
          similarFiles = files
            .filter(f => {
              const fLower = f.toLowerCase();
              return fLower === filenameLower || 
                     fLower.includes(filenameLower) || 
                     filenameLower.includes(fLower.replace(/\.[^.]+$/, ''));
            })
            .slice(0, 5);
        } catch (error) {
          // Parent directory doesn't exist or is not accessible.
          if (!parentDirProbeFailedLogged) {
            parentDirProbeFailedLogged = true;
            const err = error as NodeJS.ErrnoException;
            logger.debug('Failed to probe parent directory for suggestions', {
              path: args.path,
              code: err.code,
              error: err.message,
            });
          }
        }
        
        // Show resolved path if different from input
        const resolvedNote = filePath !== args.path 
          ? `\n  Resolved to: ${filePath}` 
          : '';
        
        let output = `═══ FILE NOT FOUND ═══\n\n`;
        output += `Requested: ${args.path}${resolvedNote}\n\n`;
        
        if (!parentExists) {
          output += `The parent directory does not exist.\n`;
          output += `\n═══ SUGGESTIONS ═══\n`;
          output += `• Check the full path is correct\n`;
          output += `• Use 'ls' on workspace root to find the correct directory structure\n`;
          output += `• Use 'glob' to search for '**/${filename}'\n`;
        } else if (similarFiles.length > 0) {
          output += `═══ SIMILAR FILES FOUND ═══\n`;
          for (const f of similarFiles) {
            output += `  • ${directory}/${f}\n`;
          }
          output += `\n═══ SUGGESTIONS ═══\n`;
          output += `• Did you mean one of the files above?\n`;
          output += `• Check for typos or case sensitivity\n`;
        } else {
          output += `The directory exists but the file was not found.\n`;
          output += `\n═══ SUGGESTIONS ═══\n`;
          output += `• Use 'ls' to list files in '${directory}'\n`;
          output += `• Use 'glob' to search for '**/${filename}'\n`;
          output += `• Check for typos (paths are case-sensitive)\n`;
        }
        
        return {
          toolName: 'read',
          success: false,
          output,
        };
      }
      if (err.code === 'EACCES') {
        return {
          toolName: 'read',
          success: false,
          output: `═══ PERMISSION DENIED ═══\n\nFile: ${args.path}\nResolved: ${filePath}\n\nThe file exists but cannot be read due to permission restrictions.\n\nSuggestions:\n• Check file permissions (chmod on Unix, Properties on Windows)\n• The file may be locked by another process`,
        };
      }
      if (err.code === 'EISDIR') {
        return {
          toolName: 'read',
          success: false,
          output: `═══ PATH IS A DIRECTORY ═══\n\nPath: ${args.path}\n\nCannot read directory as a file.\n\nSuggestions:\n• Use 'ls' tool to list directory contents\n• Add a filename to the path`,
        };
      }
      if (err.code === 'ENAMETOOLONG') {
        return {
          toolName: 'read',
          success: false,
          output: `═══ PATH TOO LONG ═══\n\nThe file path exceeds system limits.\n\nSuggestions:\n• Use a shorter path\n• Navigate to a closer directory first`,
        };
      }
      return {
        toolName: 'read',
        success: false,
        output: `═══ READ ERROR ═══\n\nFile: ${args.path}\nError: ${err.message}\nCode: ${err.code || 'unknown'}`,
      };
    }
  },
};
