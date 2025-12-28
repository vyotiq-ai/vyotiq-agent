/**
 * Tool Creation Prompts
 *
 * Prompt templates for dynamic tool creation and management.
 * These prompts guide the agent in creating, validating, and using dynamic tools.
 */

// =============================================================================
// Dynamic Tool Creation Guidance
// =============================================================================

/**
 * Dynamic tool creation capability prompt
 */
export const DYNAMIC_TOOL_CREATION_PROMPT = `
## Dynamic Tool Creation

You have the ability to create custom tools during execution to handle specialized tasks. Use this capability when:

### When to Create Tools
- You need to perform a repetitive operation multiple times
- Existing tools don't quite fit the task requirements
- A specialized tool would be more efficient than general-purpose tools
- You need to encapsulate complex logic for reuse

### When NOT to Create Tools
- Built-in tools already handle the task well
- The operation is only needed once
- The tool would be too specific to be reusable
- Creating the tool takes longer than just doing the task

### Tool Creation Best Practices
1. **Clear Purpose**: Each tool should do one thing well
2. **Good Interface**: Parameters should be intuitive and well-documented
3. **Error Handling**: Tools should handle errors gracefully
4. **Validation**: Validate inputs before processing
5. **Reusability**: Design tools to be useful beyond the immediate task
`;

/**
 * Tool composition guidance
 */
export const TOOL_COMPOSITION_PROMPT = `
## Tool Composition

You can compose existing tools into more powerful workflows:

### Composition Patterns
1. **Sequential**: Run tools in order, passing outputs as inputs
2. **Parallel**: Run independent tools simultaneously
3. **Conditional**: Choose tools based on runtime conditions
4. **Iterative**: Loop over collections with tools

### Best Practices
- Keep compositions simple and debuggable
- Handle partial failures gracefully
- Cache intermediate results when useful
- Log key decision points for transparency
`;

// =============================================================================
// Tool Definition Templates
// =============================================================================

/**
 * Template for defining a new tool
 */
export function buildToolDefinitionPrompt(options: {
  purpose: string;
  suggestedName?: string;
  inputSchema?: object;
  outputDescription?: string;
}): string {
  let prompt = `
## Tool Definition

Create a tool for: ${options.purpose}

### Requirements
`;

  if (options.suggestedName) {
    prompt += `- Suggested name: ${options.suggestedName}\n`;
  }

  if (options.inputSchema) {
    prompt += `- Input schema: ${JSON.stringify(options.inputSchema, null, 2)}\n`;
  }

  if (options.outputDescription) {
    prompt += `- Expected output: ${options.outputDescription}\n`;
  }

  prompt += `
### Guidelines
- Define clear parameter types and descriptions
- Include validation for all inputs
- Return structured output that's easy to process
- Handle errors with informative messages
`;

  return prompt;
}

// =============================================================================
// Tool Validation Templates
// =============================================================================

/**
 * Tool validation checklist prompt
 */
export const TOOL_VALIDATION_PROMPT = `
## Tool Validation Checklist

Before using a created tool, verify:

### Correctness
- [ ] Tool does what it's supposed to do
- [ ] Parameters are correctly defined
- [ ] Return values match the schema
- [ ] Edge cases are handled

### Safety
- [ ] Input validation prevents injection attacks
- [ ] Resource usage is bounded
- [ ] No unintended side effects
- [ ] Permissions are appropriate

### Quality
- [ ] Error messages are helpful
- [ ] Documentation is accurate
- [ ] Performance is acceptable
- [ ] Tool is reusable for similar tasks
`;

// =============================================================================
// Tool Discovery Templates
// =============================================================================

/**
 * Tool discovery prompt
 */
export const TOOL_DISCOVERY_PROMPT = `
## Available Tools Discovery

When starting a task, understand what tools are available:

1. **Review Tool List**: Check the available tools and their capabilities
2. **Match to Task**: Identify which tools are relevant to your task
3. **Check Permissions**: Verify you have access to needed tools
4. **Plan Usage**: Decide the order and combination of tool usage

### Specialization Tool Access
Note that different specializations have access to different tools:
- Coding agents: Full access to file editing and terminal
- Research agents: Read-only access, focused on search and reading
- Testing agents: Access to test runners and assertions
- Review agents: Read-only access for analysis
`;

/**
 * Tool matching prompt
 */
export function buildToolMatchingPrompt(task: string, availableTools: string[]): string {
  return `
## Tool Selection

Task: ${task}

Available tools:
${availableTools.map(t => `- ${t}`).join('\n')}

Select the appropriate tools for this task. Consider:
1. Which tools directly support the task?
2. What's the most efficient order to use them?
3. Are there any missing capabilities that would need a custom tool?
`;
}

// =============================================================================
// Tool Execution Templates
// =============================================================================

/**
 * Tool execution best practices
 */
export const TOOL_EXECUTION_PROMPT = `
## Tool Execution Best Practices

When executing tools:

### Before Execution
- Verify parameters are correct
- Consider potential side effects
- Have a plan for handling failures

### During Execution
- Use appropriate timeouts
- Monitor for errors
- Don't run dangerous operations without confirmation

### After Execution
- Validate the result
- Handle errors gracefully
- Log important outcomes
- Clean up any temporary resources
`;

/**
 * Build tool chain execution prompt
 */
export function buildToolChainPrompt(steps: {
  tool: string;
  purpose: string;
  dependsOn?: string[];
}[]): string {
  let prompt = `
## Tool Chain Execution

Execute the following tool chain:

`;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    prompt += `### Step ${i + 1}: ${step.tool}
Purpose: ${step.purpose}
${step.dependsOn ? `Depends on: ${step.dependsOn.join(', ')}` : ''}

`;
  }

  prompt += `
Execute each step in order, passing results as needed. Handle failures at each step before proceeding.
`;

  return prompt;
}
