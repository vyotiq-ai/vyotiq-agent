/**
 * Editor AI Prompts
 * 
 * Prompt templates and response parsers for editor AI actions.
 */

import type { EditorAIAction, EditorAIResult, EditorDiagnostic } from './types';

interface PromptContext {
  language?: string;
  code?: string;
  prefix?: string;
  suffix?: string;
  contextBefore?: string;
  contextAfter?: string;
  filePath?: string;
  error?: string;
  line?: number;
  diagnostics?: EditorDiagnostic[];
  userInstructions?: string;
}

/**
 * Build a prompt for the given action
 */
export function buildEditorPrompt(action: EditorAIAction, context: PromptContext): string {
  switch (action) {
    case 'complete-inline':
      return buildInlineCompletionPrompt(context);
    case 'explain':
      return buildExplainPrompt(context);
    case 'refactor':
      return buildRefactorPrompt(context);
    case 'fix-errors':
      return buildFixErrorsPrompt(context);
    case 'generate-tests':
      return buildGenerateTestsPrompt(context);
    case 'add-documentation':
      return buildDocumentationPrompt(context);
    case 'optimize':
      return buildOptimizePrompt(context);
    case 'summarize-file':
      return buildSummarizePrompt(context);
    case 'find-issues':
      return buildFindIssuesPrompt(context);
    case 'convert':
      return buildConvertPrompt(context);
    default:
      return context.code || '';
  }
}

function buildInlineCompletionPrompt(context: PromptContext): string {
  const parts: string[] = [];
  
  if (context.language) {
    parts.push(`Language: ${context.language}`);
  }
  
  if (context.contextBefore) {
    parts.push(`Code before cursor:\n${context.contextBefore}`);
  }
  
  parts.push(`Current line before cursor: ${context.prefix || ''}`);
  
  if (context.suffix) {
    parts.push(`Current line after cursor: ${context.suffix}`);
  }
  
  if (context.contextAfter) {
    parts.push(`Code after cursor:\n${context.contextAfter}`);
  }
  
  parts.push('\nComplete the code naturally. Output ONLY the completion text, nothing else.');
  
  return parts.join('\n');
}

function buildExplainPrompt(context: PromptContext): string {
  return `Explain the following ${context.language || 'code'} code:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Provide a clear, concise explanation of:
1. What this code does 
2. How it works 
3. Any important patterns or techniques used 
4. Any potential improvements or optimizations
5. Any known issues or limitations
6. Any relevant context or background information
${context.userInstructions ? `\nAdditional context: ${context.userInstructions}` : ''}`;
}

function buildRefactorPrompt(context: PromptContext): string {
  return `Refactor the following ${context.language || 'code'} code to improve it:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Provide the refactored code with improvements for:
- Readability and clarity
- Efficiency
- Maintainability
- Best practices
- Performance (if applicable)
- Error handling (if applicable)

Output the refactored code in a code block, followed by a brief explanation of changes.
${context.userInstructions ? `\nSpecific requirements: ${context.userInstructions}` : ''}`;
}

function buildFixErrorsPrompt(context: PromptContext): string {
  let prompt = `Fix the errors in the following ${context.language || 'code'} code:

\`\`\`${context.language || ''}
${context.code}
\`\`\``;

  if (context.error) {
    prompt += `\n\nError message: ${context.error}`;
  }
  
  if (context.line) {
    prompt += `\nError location: line ${context.line}`;
  }

  if (context.diagnostics && context.diagnostics.length > 0) {
    prompt += '\n\nDiagnostics:';
    for (const diag of context.diagnostics) {
      prompt += `\n- Line ${diag.line}: ${diag.message} (${diag.severity})`;
    }
  }

  prompt += '\n\nProvide the corrected code in a code block, followed by an explanation of what was fixed.';
  
  return prompt;
}

function buildGenerateTestsPrompt(context: PromptContext): string {
  return `Generate comprehensive unit tests for the following ${context.language || 'code'} code:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Requirements:
- Use appropriate testing framework (Jest/Vitest for JS/TS, pytest for Python, etc.) 
- Cover main functionality and edge cases
- Include multiple test cases for different scenarios
- Use assertions for expected behavior
- Include edge cases (e.g., empty input, null values, etc.)
- Include error cases (e.g., invalid inputs, edge cases, etc.)
- Use descriptive test names (e.g., 'test_1', 'test_2', etc.)
- Include comments explaining the test cases

Output the test code in a code block.
${context.userInstructions ? `\nAdditional requirements: ${context.userInstructions}` : ''}`;
}

function buildDocumentationPrompt(context: PromptContext): string {
  return `Add documentation comments to the following ${context.language || 'code'} code:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Requirements:
- Use appropriate documentation format (JSDoc/TSDoc for JS/TS, docstrings for Python, etc.)
- Document all public functions, classes, and methods
- Include parameter descriptions
- Include return value descriptions
- Include examples where helpful (e.g., for functions)
- Use Markdown format for documentation
- Follow best practices for documentation (e.g., clear, concise, and accurate)
- Include any relevant information (e.g., dependencies, error handling, etc.)
${context.userInstructions ? `\nAdditional requirements: ${context.userInstructions}` : ''}

Output the documented code in a code block.`;
}

function buildOptimizePrompt(context: PromptContext): string {
  return `Optimize the following ${context.language || 'code'} code for better performance:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Consider:
- Time complexity improvements 
- Space complexity improvements
- Reducing unnecessary operations
- Better algorithms or data structures
- Caching opportunities- Parallelization or concurrency improvements
- Any other performance-related optimizations

Output the optimized code in a code block, followed by an explanation of optimizations made.
${context.userInstructions ? `\nSpecific focus: ${context.userInstructions}` : ''}`;
}

function buildSummarizePrompt(context: PromptContext): string {
  return `Summarize what this ${context.language || ''} file does:

File: ${context.filePath || 'unknown'}

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Provide:
1. A brief one-line summary of what the file does
2. Main purpose and functionality 
3. Key exports/public API 
4. Dependencies and relationships with other parts of the codebase 
5. Any notable patterns or architecture decisions`;
}

function buildFindIssuesPrompt(context: PromptContext): string {
  return `Review the following ${context.language || 'code'} code and identify potential issues:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

Look for:
- Bugs and logic errors (e.g., incorrect variable names, type mismatches, etc.)
- Security vulnerabilities (e.g., SQL injection, cross-site scripting, etc.)
- Code smells (e.g., code duplication, large functions, etc.)
- Missing error handling (e.g., unhandled exceptions, failed assertions, etc.)
- Type safety issues (e.g., type mismatches, incorrect type annotations, etc.)
- Best practice violations (e.g., code style issues, naming conventions, etc.)
- Performance issues (e.g., inefficient algorithms, unnecessary operations, etc.)
- Code smells
- Missing error handling
- Type safety issues
- Best practice violations

For each issue found, provide:
1. Issue description 
2. Severity (high/medium/low) 
3. Line number
4. Suggested fix`;
}

function buildConvertPrompt(context: PromptContext): string {
  return `Convert the following code:

\`\`\`${context.language || ''}
${context.code}
\`\`\`

${context.userInstructions || 'Convert to a different format/pattern as appropriate.'}

Output the converted code in a code block.`;
}

/**
 * Parse AI response into structured result
 */
export function parseAIResponse(action: EditorAIAction, content: string): EditorAIResult {
  switch (action) {
    case 'explain':
    case 'summarize-file':
      return { text: content };
      
    case 'refactor':
    case 'fix-errors':
    case 'generate-tests':
    case 'add-documentation':
    case 'optimize':
    case 'convert':
      return parseCodeResponse(content);
      
    case 'find-issues':
      return parseIssuesResponse(content);
      
    default:
      return { text: content };
  }
}

function parseCodeResponse(content: string): EditorAIResult {
  // Extract code blocks
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  const matches = [...content.matchAll(codeBlockRegex)];
  
  if (matches.length > 0) {
    const code = matches[0][1].trim();
    // Get explanation (text outside code blocks)
    const text = content.replace(codeBlockRegex, '').trim();
    return { code, text: text || undefined };
  }
  
  // No code block found, return as text
  return { text: content };
}

function parseIssuesResponse(content: string): EditorAIResult {
  const suggestions: EditorAIResult['suggestions'] = [];
  
  // Try to parse structured issues
  const issueRegex = /(?:^|\n)(?:\d+\.|[-*])\s*(?:\*\*)?([^:\n]+?)(?:\*\*)?:\s*([^\n]+)/g;
  const severityRegex = /\b(high|medium|low)\b/i;
  const lineRegex = /line\s*(\d+)/i;
  
  let match;
  while ((match = issueRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const description = match[2].trim();
    
    const severityMatch = description.match(severityRegex);
    const lineMatch = description.match(lineRegex);
    
    suggestions.push({
      title,
      description,
      severity: (severityMatch?.[1]?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
    });
  }
  
  return {
    text: content,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
