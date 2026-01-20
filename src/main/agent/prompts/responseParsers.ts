/**
 * Response Parsers
 *
 * Parsers for extracting structured information from LLM responses.
 * Used for task extraction and result processing.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed task from agent response
 */
export interface ParsedTask {
  id: string;
  description: string;
  dependencies?: string[];
  estimatedComplexity?: 'low' | 'medium' | 'high';
}

/**
 * Parsed progress update
 */
export interface ParsedProgress {
  percentComplete: number;
  currentStep?: string;
  filesModified?: string[];
  blockers?: string[];
}

/**
 * Parsed completion result
 */
export interface ParsedCompletion {
  success: boolean;
  summary: string;
  outputs?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

// =============================================================================
// Task Parsing
// =============================================================================

/**
 * Extract task decomposition from response
 */
export function parseTasks(response: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  
  // Try to find JSON task list
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.description) {
            tasks.push({
              id: item.id || `task_${tasks.length + 1}`,
              description: item.description,
              dependencies: item.dependencies,
              estimatedComplexity: parseComplexity(item.complexity),
            });
          }
        }
        return tasks;
      }
    } catch {
      // Fall through to pattern matching
    }
  }

  // Pattern matching for numbered/bulleted tasks
  const taskPatterns = [
    /(?:^|\n)\s*[-*]\s*(?:\[(.+?)\])?\s*(.+?)(?:\s*\((.+?)\))?(?=\n|$)/gm,
    /(?:^|\n)\s*(\d+)[.)]\s*(.+?)(?:\s*\((.+?)\))?(?=\n|$)/gm,
  ];

  for (const pattern of taskPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const description = match[2]?.trim();
      if (description && description.length > 10) {
        tasks.push({
          id: `task_${tasks.length + 1}`,
          description,
        });
      }
    }
    if (tasks.length > 0) break;
  }

  return tasks;
}

/**
 * Parse complexity string
 */
function parseComplexity(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (typeof value !== 'string') return undefined;
  
  const normalized = value.toLowerCase().trim();
  if (normalized.includes('low') || normalized.includes('simple')) return 'low';
  if (normalized.includes('high') || normalized.includes('complex')) return 'high';
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'medium';
  
  return undefined;
}

/**
 * Parse specialization from string
 */
function parseSpecialization(value: unknown): string {
  if (typeof value !== 'string') return 'general';
  
  const lower = value.toLowerCase().trim();
  if (lower.match(/\b(code|coding|development|programming)\b/)) {
    return 'coding';
  }
  if (lower.match(/\b(test|testing|qa|quality)\b/)) {
    return 'testing';
  }
  if (lower.match(/\b(review|analyze|audit|inspect|examine)\b/)) {
    return 'review';
  }
  if (lower.match(/\b(document|docs|readme|comment|explain|describe)\b/)) {
    return 'documentation';
  }
  if (lower.match(/\b(debug|fix|troubleshoot|investigate|diagnose)\b/)) {
    return 'debugging';
  }
  if (lower.match(/\b(research|find|search|explore|learn|understand)\b/)) {
    return 'research';
  }
  
  return 'general';
}

/**
 * Parse priority from string or response
 */
function parsePriority(value: unknown): number {
  if (typeof value === 'number') return Math.max(1, Math.min(10, value));
  if (typeof value !== 'string') return 5;
  
  const lower = value.toLowerCase();
  if (lower.includes('urgent') || lower.includes('critical') || lower.includes('high')) return 8;
  if (lower.includes('low') || lower.includes('minor')) return 3;
  return 5;
}

/**
 * Parsed spawn request
 */
export interface ParsedSpawnRequest {
  specialization: string;
  task: string;
  priority?: number;
  context?: string;
  tools?: string[];
}

// =============================================================================
// Spawn Request Parsing
// =============================================================================

/**
 * Parse spawn request from response
 */
export function parseSpawnRequest(response: string): ParsedSpawnRequest | null {
  // Try JSON format first
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.task || parsed.description) {
        return {
          specialization: parseSpecialization(parsed.specialization || parsed.type),
          task: parsed.task || parsed.description,
          priority: parsePriority(parsed.priority),
          context: parsed.context,
          tools: parsed.tools,
        };
      }
    } catch {
      // Fall through
    }
  }

  // Try structured format
  const specMatch = response.match(/specialization\s*:\s*(\w+)/i);
  const taskMatch = response.match(/task\s*:\s*(.+?)(?:\n|$)/i);
  
  if (taskMatch) {
    return {
      specialization: specMatch ? parseSpecialization(specMatch[1]) : 'general',
      task: taskMatch[1].trim(),
      priority: parsePriority(response),
    };
  }

  return null;
}

// =============================================================================
// Progress Parsing
// =============================================================================

/**
 * Parse progress update from response
 */
export function parseProgress(response: string): ParsedProgress | null {
  const progress: ParsedProgress = {
    percentComplete: 0,
  };

  // Look for percentage
  const percentMatch = response.match(/(\d+)\s*%/);
  if (percentMatch) {
    progress.percentComplete = parseInt(percentMatch[1], 10);
  }

  // Look for current step
  const stepMatch = response.match(/(?:current(?:ly)?|working on|step)\s*:?\s*(.+?)(?:\n|$)/i);
  if (stepMatch) {
    progress.currentStep = stepMatch[1].trim();
  }

  // Look for files
  const filesMatch = response.match(/(?:files?|modified)\s*:?\s*(.+?)(?:\n|$)/i);
  if (filesMatch) {
    progress.filesModified = filesMatch[1]
      .split(/[,;]/)
      .map(f => f.trim())
      .filter(f => f.length > 0);
  }

  // Look for blockers
  const blockerMatch = response.match(/(?:blocked?|issue|problem)\s*:?\s*(.+?)(?:\n|$)/i);
  if (blockerMatch) {
    progress.blockers = [blockerMatch[1].trim()];
  }

  return progress.percentComplete > 0 || progress.currentStep ? progress : null;
}

// =============================================================================
// Completion Parsing
// =============================================================================

/**
 * Parse completion result from response
 */
export function parseCompletion(response: string): ParsedCompletion {
  const completion: ParsedCompletion = {
    success: true,
    summary: '',
  };

  // Check for failure indicators
  if (response.match(/\b(failed?|error|unable|couldn't|cannot|blocked)\b/i)) {
    completion.success = false;
  }

  // Extract summary (first paragraph or sentence)
  const summaryMatch = response.match(/^(.+?)(?:\n\n|\n[-*]|$)/s);
  if (summaryMatch) {
    completion.summary = summaryMatch[1].trim().slice(0, 500);
  }

  // Extract outputs
  const outputMatch = response.match(/(?:outputs?|deliverables?|results?)\s*:?\s*([\s\S]*?)(?:\n\n|$)/i);
  if (outputMatch) {
    completion.outputs = outputMatch[1]
      .split(/\n/)
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 0);
  }

  // Extract warnings
  const warningMatch = response.match(/(?:warnings?|notes?|caveats?)\s*:?\s*([\s\S]*?)(?:\n\n|$)/i);
  if (warningMatch) {
    completion.warnings = warningMatch[1]
      .split(/\n/)
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 0);
  }

  // Extract next steps
  const nextMatch = response.match(/(?:next\s*steps?|follow[-\s]?up)\s*:?\s*([\s\S]*?)(?:\n\n|$)/i);
  if (nextMatch) {
    completion.nextSteps = nextMatch[1]
      .split(/\n/)
      .map(l => l.replace(/^[-*\d.]+\s*/, '').trim())
      .filter(l => l.length > 0);
  }

  return completion;
}

// =============================================================================
// Code Block Extraction
// =============================================================================

/**
 * Extract code blocks from response
 */
export function extractCodeBlocks(response: string): {
  language: string;
  code: string;
  filename?: string;
}[] {
  const blocks: { language: string; code: string; filename?: string }[] = [];
  
  const codeBlockPattern = /```(\w+)?(?:\s+(\S+))?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockPattern.exec(response)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      filename: match[2],
      code: match[3].trim(),
    });
  }

  return blocks;
}

/**
 * Extract file paths from response
 */
export function extractFilePaths(response: string): string[] {
  const paths = new Set<string>();
  
  // Match various path patterns
  const patterns = [
    /`([^`]+\.[a-z]{1,10})`/gi,  // `path/file.ext`
    /(?:^|\s)([\w./\\-]+\.[a-z]{1,10})(?:\s|$|:)/gim,  // bare paths
    /(?:file|path)\s*:?\s*([^\s,]+\.[a-z]{1,10})/gi,  // file: path
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const path = match[1];
      // Filter out URLs and invalid paths
      if (path && !path.includes('://') && path.length < 200) {
        paths.add(path);
      }
    }
  }

  return Array.from(paths);
}
