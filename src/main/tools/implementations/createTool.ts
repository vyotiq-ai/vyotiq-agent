/**
 * Create Tool Implementation
 *
 * Allows the agent to create composite tools that chain existing tools together.
 */

import type { ToolDefinition, ToolExecutionContext, ToolCategory } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import { getDynamicToolFactory, type CompositeStep } from '../factory/DynamicToolFactory';
import { createLogger } from '../../logger';

const logger = createLogger('CreateToolTool');

interface CreateToolArgs {
  /** Name for the new tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Steps to execute (chain of existing tools) */
  steps: CompositeStep[];
  /** Optional category for organization */
  category?: ToolCategory;
  [key: string]: unknown;
}

export const createToolTool: ToolDefinition<CreateToolArgs> = {
  name: 'create_tool',
  description: `Create a composite tool that chains existing tools together.

Use this to create reusable workflows that combine multiple tool calls.

**Example:**
\`\`\`json
{
  "name": "search_and_read",
  "description": "Search for a file and read its contents",
  "steps": [
    {
      "toolName": "glob",
      "input": { "pattern": "$input.pattern" }
    },
    {
      "toolName": "read",
      "input": { "path": "$step1.files[0]" }
    }
  ]
}
\`\`\`

**Input References:**
- \`$input.field\` - Reference initial input
- \`$stepN.field\` - Reference output from step N
- \`$stepN.success\` - Check if step N succeeded (for conditions)`,

  requiresApproval: true,
  riskLevel: 'moderate',
  allowedCallers: ['direct'],
  category: 'other',

  schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Unique name for the tool (use snake_case)',
      },
      description: {
        type: 'string',
        description: 'What the tool does',
      },
      steps: {
        type: 'array',
        description: 'Chain of tool calls to execute',
        items: {
          type: 'object',
          properties: {
            toolName: {
              type: 'string',
              description: 'Name of existing tool to call',
            },
            input: {
              type: 'object',
              description: 'Input to pass (use $input or $stepN for references)',
            },
            condition: {
              type: 'string',
              description: 'Optional condition (e.g., "$step1.success")',
            },
            onError: {
              type: 'string',
              enum: ['stop', 'continue'],
              description: 'Error handling: stop (default) or continue',
            },
          },
          required: ['toolName', 'input'],
        },
      },
      category: {
        type: 'string',
        description: 'Optional category for organization',
      },
    },
    required: ['name', 'description', 'steps'],
  },

  async execute(args: CreateToolArgs, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { name, description, steps, category } = args;

    logger.info('Creating composite tool', { name, stepsCount: steps.length });

    // Validate inputs
    if (!name || !description) {
      return {
        toolName: 'create_tool',
        success: false,
        output: 'Name and description are required',
      };
    }

    if (!steps || steps.length === 0) {
      return {
        toolName: 'create_tool',
        success: false,
        output: 'At least one step is required',
      };
    }

    try {
      const factory = getDynamicToolFactory();

      const result = await factory.createTool({
        name,
        description,
        steps,
        category,
      });

      if (!result.success) {
        return {
          toolName: 'create_tool',
          success: false,
          output: `Failed to create tool: ${result.error}`,
        };
      }

      // Format success message
      const stepList = steps
        .map((s, i) => `  ${i + 1}. ${s.toolName}`)
        .join('\n');

      return {
        toolName: 'create_tool',
        success: true,
        output: [
          `[OK] Created composite tool: "${name}"`,
          '',
          `**Description**: ${description}`,
          `**Steps**:`,
          stepList,
          '',
          `Use it by calling: \`${name}\``,
        ].join('\n'),
      };
    } catch (error) {
      logger.error('Failed to create tool', { name, error });
      return {
        toolName: 'create_tool',
        success: false,
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
