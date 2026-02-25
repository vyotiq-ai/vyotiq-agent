/**
 * Encoding Consistency Checker
 * 
 * Scans workspace files and reports encoding/line-ending inconsistencies.
 * Runs asynchronously and reports results in a structured format.
 */

export interface ConsistencyIssue {
  /** File path relative to workspace */
  path: string;
  /** Type of inconsistency */
  type: 'encoding' | 'lineEnding' | 'mixedLineEndings' | 'bom';
  /** Human-readable description */
  message: string;
  /** Current value */
  current: string;
  /** Expected value (most common in workspace) */
  expected?: string;
}

export interface ConsistencyReport {
  /** Total files scanned */
  totalFiles: number;
  /** Number of files with issues */
  issueCount: number;
  /** Individual issues */
  issues: ConsistencyIssue[];
  /** Most common encoding in workspace */
  dominantEncoding: string;
  /** Most common line ending in workspace */
  dominantLineEnding: string;
  /** Scan duration in ms */
  durationMs: number;
}

interface FileStats {
  path: string;
  encoding: string;
  lineEnding: 'LF' | 'CRLF' | 'mixed' | 'none';
  hasBom: boolean;
}

/**  
 * Common text file extensions to scan
 */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc',
  '.html', '.htm', '.css', '.scss', '.less',
  '.md', '.mdx', '.txt',
  '.yaml', '.yml', '.toml',
  '.xml', '.svg',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.cs',
  '.php', '.sql',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.env', '.ini', '.cfg',
  '.vue', '.svelte',
  '.graphql', '.gql',
  '.dockerfile',
  '.gitignore', '.gitattributes',
  '.editorconfig',
]);

function getExtension(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? '';
  const dotIdx = name.lastIndexOf('.');
  return dotIdx > 0 ? name.substring(dotIdx).toLowerCase() : '';
}

function isTextFile(filePath: string): boolean {
  const ext = getExtension(filePath);
  const name = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext) || 
         name === 'makefile' || 
         name === 'dockerfile' ||
         name === 'rakefile' ||
         name === 'gemfile';
}

function detectLineEnding(content: string): 'LF' | 'CRLF' | 'mixed' | 'none' {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const lfOnly = (content.match(/(?<!\r)\n/g) ?? []).length;
  
  if (crlfCount === 0 && lfOnly === 0) return 'none';
  if (crlfCount > 0 && lfOnly === 0) return 'CRLF';
  if (crlfCount === 0 && lfOnly > 0) return 'LF';
  return 'mixed';
}

function hasBOM(content: string): boolean {
  return content.charCodeAt(0) === 0xFEFF;
}

/**
 * Scan workspace files for encoding/line-ending inconsistencies.
 * Uses the IPC files API to list and read files.
 */
export async function checkEncodingConsistency(
  workspacePath: string,
  options?: {
    maxFiles?: number;
    onProgress?: (scanned: number, total: number) => void;
  }
): Promise<ConsistencyReport> {
  const startTime = performance.now();
  const maxFiles = options?.maxFiles ?? 500;
  const fileStats: FileStats[] = [];
  
  // Collect text files from workspace
  const textFiles: string[] = [];
  
  async function collectFiles(dirPath: string, depth = 0): Promise<void> {
    if (depth > 10 || textFiles.length >= maxFiles) return;
    
    try {
      const result = await window.vyotiq?.files?.list?.(dirPath);
      if (!result?.success || !result.entries) return;
      
      for (const entry of result.entries) {
        if (textFiles.length >= maxFiles) break;
        
        const fullPath = `${dirPath}/${entry.name}`;
        
        // Skip common non-essential directories
        if (entry.isDirectory) {
          const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'target', '.cache', 'coverage'];
          if (!skipDirs.includes(entry.name)) {
            await collectFiles(fullPath, depth + 1);
          }
          continue;
        }
        
        if (isTextFile(entry.name)) {
          textFiles.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  await collectFiles(workspacePath);
  
  // Analyze each file
  for (let i = 0; i < textFiles.length; i++) {
    options?.onProgress?.(i + 1, textFiles.length);
    
    try {
      const result = await window.vyotiq?.files?.read?.(textFiles[i]);
      if (!result?.success || result.content === undefined) continue;
      
      const content = String(result.content);
      const lineEnding = detectLineEnding(content);
      
      fileStats.push({
        path: textFiles[i].replace(workspacePath + '/', ''),
        encoding: hasBOM(content) ? 'UTF-8 BOM' : 'UTF-8', // Basic detection
        lineEnding,
        hasBom: hasBOM(content),
      });
    } catch {
      // Skip files we can't read
    }
  }
  
  // Determine dominant patterns
  const encodingCounts = new Map<string, number>();
  const lineEndingCounts = new Map<string, number>();
  
  for (const stat of fileStats) {
    encodingCounts.set(stat.encoding, (encodingCounts.get(stat.encoding) ?? 0) + 1);
    if (stat.lineEnding !== 'none') {
      lineEndingCounts.set(stat.lineEnding, (lineEndingCounts.get(stat.lineEnding) ?? 0) + 1);
    }
  }
  
  const dominantEncoding = [...encodingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UTF-8';
  const dominantLineEnding = [...lineEndingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'LF';
  
  // Find issues
  const issues: ConsistencyIssue[] = [];
  
  for (const stat of fileStats) {
    // Mixed line endings
    if (stat.lineEnding === 'mixed') {
      issues.push({
        path: stat.path,
        type: 'mixedLineEndings',
        message: 'File has mixed line endings (both LF and CRLF)',
        current: 'mixed',
        expected: dominantLineEnding,
      });
    }
    // Inconsistent line ending (not matching dominant)
    else if (stat.lineEnding !== 'none' && stat.lineEnding !== dominantLineEnding) {
      issues.push({
        path: stat.path,
        type: 'lineEnding',
        message: `Uses ${stat.lineEnding} but workspace standard is ${dominantLineEnding}`,
        current: stat.lineEnding,
        expected: dominantLineEnding,
      });
    }
    
    // BOM detected
    if (stat.hasBom) {
      issues.push({
        path: stat.path,
        type: 'bom',
        message: 'File has a UTF-8 BOM (Byte Order Mark)',
        current: 'BOM present',
      });
    }
    
    // Inconsistent encoding
    if (stat.encoding !== dominantEncoding) {
      issues.push({
        path: stat.path,
        type: 'encoding',
        message: `Uses ${stat.encoding} but workspace standard is ${dominantEncoding}`,
        current: stat.encoding,
        expected: dominantEncoding,
      });
    }
  }
  
  return {
    totalFiles: fileStats.length,
    issueCount: issues.length,
    issues: issues.sort((a, b) => a.path.localeCompare(b.path)),
    dominantEncoding,
    dominantLineEnding,
    durationMs: performance.now() - startTime,
  };
}
