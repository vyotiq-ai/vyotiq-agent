/**
 * Browser Fill Form Tool
 * 
 * Fill multiple form fields at once for efficient form handling.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';
import type { FormField } from './types';

interface FillFormArgs extends Record<string, unknown> {
  /** Fields to fill */
  fields: FormField[];
  /** Submit form after filling */
  submit?: boolean;
  /** Form selector (for submit) */
  formSelector?: string;
}

async function executeFillForm(
  args: FillFormArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { fields, submit = false, formSelector } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Filling form', { fieldCount: fields?.length, submit });

  if (!fields || fields.length === 0) {
    return {
      toolName: 'browser_fill_form',
      success: false,
      output: 'Error: fields array is required',
    };
  }

  try {
    const results: { field: string; success: boolean; error?: string }[] = [];
    
    for (const field of fields) {
      const { ref, name, type, value } = field;
      
      // Build selector from ref
      const selector = ref.startsWith('e') 
        ? `[data-vyotiq-ref="${ref}"]`
        : ref;
      
      let success = false;
      let error: string | undefined;
      
      try {
        switch (type) {
          case 'textbox':
          case 'textarea': {
            const script = `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return false;
                el.focus();
                el.value = '${value.replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `;
            success = await browser.evaluate<boolean>(script);
            break;
          }
          
          case 'checkbox': {
            const checked = value === 'true' || String(value) === 'true';
            const script = `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return false;
                if (el.checked !== ${checked}) {
                  el.click();
                }
                return true;
              })()
            `;
            success = await browser.evaluate<boolean>(script);
            break;
          }
          
          case 'radio': {
            const script = `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return false;
                el.checked = true;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `;
            success = await browser.evaluate<boolean>(script);
            break;
          }
          
          case 'combobox': {
            const script = `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return false;
                
                // Try to find option by value or text
                const options = el.options || el.querySelectorAll('option');
                for (const opt of options) {
                  if (opt.value === '${value.replace(/'/g, "\\'")}' || 
                      opt.textContent?.trim() === '${value.replace(/'/g, "\\'")}') {
                    el.value = opt.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                  }
                }
                return false;
              })()
            `;
            success = await browser.evaluate<boolean>(script);
            if (!success) error = `Option "${value}" not found`;
            break;
          }
          
          case 'slider': {
            const script = `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (!el) return false;
                el.value = '${value}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              })()
            `;
            success = await browser.evaluate<boolean>(script);
            break;
          }
          
          default:
            error = `Unknown field type: ${type}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      
      results.push({ field: name, success, error });
    }
    
    // Submit form if requested
    const submitResult: { attempted: boolean; success: boolean; error?: string } = { attempted: false, success: false };
    if (submit) {
      submitResult.attempted = true;
      const submitScript = formSelector
        ? `document.querySelector('${formSelector.replace(/'/g, "\\'")}')?.submit() ?? false`
        : `(document.querySelector('form') || document.querySelector('[data-vyotiq-ref]')?.closest('form'))?.submit() ?? false`;
      
      try {
        await browser.evaluate(submitScript);
        submitResult.success = true;
      } catch (e) {
        submitResult.success = false;
        submitResult.error = e instanceof Error ? e.message : String(e);
      }
    }
    
    // Build output
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    let output = `Form Fill Results: ${successCount}/${results.length} fields filled\n\n`;
    
    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      output += `${status} ${result.field}${result.error ? `: ${result.error}` : ''}\n`;
    }
    
    if (submit) {
      output += `\nForm submit: ${submitResult.success ? 'Success' : `Failed${submitResult.error ? `: ${submitResult.error}` : ''}`}`;
    }

    return {
      toolName: 'browser_fill_form',
      success: failedCount === 0,
      output,
      metadata: { results, submitResult },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Fill form error', { error: errorMessage });
    
    return {
      toolName: 'browser_fill_form',
      success: false,
      output: `Fill form failed: ${errorMessage}`,
    };
  }
}

export const browserFillFormTool: ToolDefinition<FillFormArgs> = {
  name: 'browser_fill_form',
  description: `Fill multiple form fields in one operation. Efficient for complex forms.

## When to Use
- **Complex forms**: Fill many fields at once
- **Registration**: Complete signup forms
- **Data entry**: Fill structured data forms
- **Testing**: Automate form submission tests

## Workflow Integration
Use with snapshot for reliable form filling:
\`\`\`
browser_navigate(url) → load form page
browser_snapshot(interactiveOnly: true) → get field refs
browser_fill_form(fields: [...], submit: true) → fill and submit
browser_wait(text: "Success") → wait for confirmation
browser_screenshot() → verify result
\`\`\`

## Registration Pattern
\`\`\`
browser_navigate("http://localhost:3000/register")
browser_snapshot(interactiveOnly: true)
browser_fill_form(fields: [
  { ref: "e5", name: "Name", type: "textbox", value: "John Doe" },
  { ref: "e6", name: "Email", type: "textbox", value: "john@example.com" },
  { ref: "e7", name: "Password", type: "textbox", value: "secure123" },
  { ref: "e8", name: "Terms", type: "checkbox", value: "true" }
], submit: true)
\`\`\`

## Supported Field Types
- **textbox**: Text input fields
- **textarea**: Multi-line text
- **checkbox**: Check/uncheck (value: "true"/"false")
- **radio**: Select radio option
- **combobox**: Select dropdown option
- **slider**: Range inputs

## Parameters
- **fields** (required): Array of fields to fill
  - ref: Element ref from snapshot or CSS selector
  - name: Human-readable field name
  - type: Field type (textbox, checkbox, etc.)
  - value: Value to set
- **submit** (optional): Submit form after filling
- **formSelector** (optional): Form selector for submit

## Best Practices
- Use browser_snapshot first to get accurate refs
- Use refs from snapshot for reliable targeting
- Set submit: true to complete the form
- Check results for partial failures`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'Fields to fill',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'Element ref from snapshot or CSS selector' },
            name: { type: 'string', description: 'Human-readable field name' },
            type: { type: 'string', enum: ['textbox', 'checkbox', 'radio', 'combobox', 'slider', 'textarea'] },
            value: { type: 'string', description: 'Value to set' },
          },
          required: ['ref', 'name', 'type', 'value'],
        },
      },
      submit: {
        type: 'boolean',
        description: 'Submit form after filling',
      },
      formSelector: {
        type: 'string',
        description: 'Form selector for submit (auto-detected if not provided)',
      },
    },
    required: ['fields'],
  },

  ui: {
    icon: 'FormInput',
    label: 'Fill Form',
    color: 'text-emerald-400',
    runningLabel: 'Filling...',
    completedLabel: 'Filled',
  },

  inputExamples: [
    {
      fields: [
        { ref: 'e5', name: 'Email', type: 'textbox', value: 'user@example.com' },
        { ref: 'e6', name: 'Password', type: 'textbox', value: 'secret123' },
        { ref: 'e7', name: 'Remember me', type: 'checkbox', value: 'true' },
      ],
      submit: true,
    },
  ],

  execute: executeFillForm,
};
