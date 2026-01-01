/**
 * Browser Snapshot Tool
 * 
 * Capture accessibility snapshot of the page structure.
 * This is more useful than screenshots for understanding page structure
 * and interacting with elements.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface SnapshotArgs extends Record<string, unknown> {
  /** Root element selector (default: whole page) */
  selector?: string;
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Include interactive elements only */
  interactiveOnly?: boolean;
}

interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  focused?: boolean;
  checked?: boolean | 'mixed';
  ref: string;
  tag?: string;
  children?: AccessibilityNode[];
}

/**
 * Format accessibility tree as readable text output
 */
function formatTree(node: AccessibilityNode | AccessibilityNode[], indent = 0): string {
  if (Array.isArray(node)) {
    return node.map(n => formatTree(n, indent)).join('\n');
  }
  
  const prefix = '  '.repeat(indent);
  let line = `${prefix}- [${node.ref}] ${node.role}`;
  
  // Safely handle name - ensure it's a string before slicing
  if (node.name && typeof node.name === 'string') {
    line += `: "${node.name.slice(0, 50)}"`;
  } else if (node.name) {
    line += `: "${String(node.name).slice(0, 50)}"`;
  }
  
  // Safely handle value - ensure it's a string before displaying
  if (node.value && typeof node.value === 'string') {
    line += ` (value: "${node.value}")`;
  } else if (node.value) {
    line += ` (value: "${String(node.value)}")`;
  }
  
  if (node.disabled) line += ' [disabled]';
  if (node.focused) line += ' [focused]';
  if (node.checked !== undefined) line += node.checked ? ' [checked]' : ' [unchecked]';
  
  let output = line;
  if (node.children?.length) {
    output += '\n' + node.children.map(c => formatTree(c, indent + 1)).join('\n');
  }
  
  return output;
}

async function executeSnapshot(
  args: SnapshotArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { selector, maxDepth = 10, interactiveOnly = false } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Taking accessibility snapshot', { selector, maxDepth, interactiveOnly });

  try {
    // Build accessibility tree from DOM
    const script = `
      (function() {
        let refCounter = 0;
        
        function getAccessibleName(el) {
          // aria-label takes precedence
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
          // aria-labelledby
          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const label = document.getElementById(labelledBy);
            if (label) return label.textContent?.trim();
          }
          // label element for form controls
          if (el.id) {
            const label = document.querySelector('label[for="' + el.id + '"]');
            if (label) return label.textContent?.trim();
          }
          // For images, use alt
          if (el.tagName === 'IMG') return el.alt || '';
          // For inputs, use placeholder
          if (el.tagName === 'INPUT' && el.placeholder) return el.placeholder;
          // Text content for buttons, links
          if (['BUTTON', 'A', 'LABEL'].includes(el.tagName)) {
            return el.textContent?.trim().slice(0, 100) || '';
          }
          // Title attribute
          if (el.title) return el.title;
          // For headings, use content
          if (/^H[1-6]$/.test(el.tagName)) return el.textContent?.trim().slice(0, 100);
          return '';
        }
        
        function getRole(el) {
          // Explicit role
          if (el.getAttribute('role')) return el.getAttribute('role');
          
          // Implicit roles
          const tag = el.tagName;
          const type = el.type;
          
          const roleMap = {
            'A': el.href ? 'link' : 'generic',
            'BUTTON': 'button',
            'IMG': 'img',
            'INPUT': {
              'button': 'button',
              'checkbox': 'checkbox',
              'radio': 'radio',
              'text': 'textbox',
              'password': 'textbox',
              'email': 'textbox',
              'tel': 'textbox',
              'url': 'textbox',
              'search': 'searchbox',
              'number': 'spinbutton',
              'range': 'slider',
              'submit': 'button',
              'reset': 'button',
            }[type] || 'textbox',
            'SELECT': 'combobox',
            'TEXTAREA': 'textbox',
            'NAV': 'navigation',
            'MAIN': 'main',
            'HEADER': 'banner',
            'FOOTER': 'contentinfo',
            'ASIDE': 'complementary',
            'ARTICLE': 'article',
            'SECTION': 'region',
            'FORM': 'form',
            'UL': 'list',
            'OL': 'list',
            'LI': 'listitem',
            'TABLE': 'table',
            'TR': 'row',
            'TH': 'columnheader',
            'TD': 'cell',
            'H1': 'heading',
            'H2': 'heading',
            'H3': 'heading',
            'H4': 'heading',
            'H5': 'heading',
            'H6': 'heading',
            'DIALOG': 'dialog',
            'MENU': 'menu',
            'MENUITEM': 'menuitem',
          };
          
          return roleMap[tag] || 'generic';
        }
        
        function isInteractive(el) {
          const tag = el.tagName;
          const role = getRole(el);
          
          // Always interactive
          if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return true;
          if (['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'slider', 'menuitem', 'tab'].includes(role)) return true;
          
          // Has click handler or tabindex
          if (el.onclick || el.getAttribute('tabindex') !== null) return true;
          
          // Contenteditable
          if (el.contentEditable === 'true') return true;
          
          return false;
        }
        
        function buildTree(element, depth, interactiveOnly) {
          if (depth <= 0) return null;
          
          // Skip hidden elements
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return null;
          
          const role = getRole(element);
          const interactive = isInteractive(element);
          
          // Skip non-interactive elements if filter enabled
          if (interactiveOnly && !interactive && depth > 1) {
            // But still process children
            const childNodes = [];
            for (const child of element.children) {
              const childNode = buildTree(child, depth - 1, interactiveOnly);
              if (childNode) {
                if (Array.isArray(childNode)) {
                  childNodes.push(...childNode);
                } else {
                  childNodes.push(childNode);
                }
              }
            }
            return childNodes.length > 0 ? childNodes : null;
          }
          
          const node = {
            role: role,
            name: getAccessibleName(element),
            ref: 'e' + (refCounter++),
            tag: element.tagName.toLowerCase(),
          };
          
          // Add value for form elements (only if value is a string)
          // Capture value once to avoid getter side effects
          try {
            const elemValue = element.value;
            if (elemValue !== undefined && elemValue !== '' && typeof elemValue === 'string') {
              node.value = elemValue.slice(0, 100);
            }
          } catch (e) {
            // Some elements may throw when accessing value
          }
          
          // Add states
          if (element.disabled) node.disabled = true;
          if (element === document.activeElement) node.focused = true;
          if (element.checked !== undefined) node.checked = element.checked;
          if (element.getAttribute('aria-expanded')) {
            node.expanded = element.getAttribute('aria-expanded') === 'true';
          }
          
          // Store reference for later interaction
          element.setAttribute('data-vyotiq-ref', node.ref);
          
          // Process children
          if (element.children.length > 0 && depth > 1) {
            const children = [];
            for (const child of element.children) {
              const childNode = buildTree(child, depth - 1, interactiveOnly);
              if (childNode) {
                if (Array.isArray(childNode)) {
                  children.push(...childNode);
                } else {
                  children.push(childNode);
                }
              }
            }
            if (children.length > 0) {
              node.children = children;
            }
          }
          
          return node;
        }
        
        const root = ${selector ? `document.querySelector('${selector.replace(/'/g, "\\'")}')` : 'document.body'};
        if (!root) return { success: false, error: 'Root element not found' };
        
        const tree = buildTree(root, ${maxDepth}, ${interactiveOnly});
        
        return {
          success: true,
          url: window.location.href,
          title: document.title,
          tree: tree,
        };
      })()
    `;

    const result = await browser.evaluate<{
      success: boolean;
      error?: string;
      url?: string;
      title?: string;
      tree?: AccessibilityNode;
    }>(script);

    if (!result?.success) {
      return {
        toolName: 'browser_snapshot',
        success: false,
        output: `Snapshot failed: ${result?.error ?? 'Unknown error'}`,
      };
    }

    // Format tree using helper function

    const treeOutput = result.tree ? formatTree(result.tree) : '(empty)';
    const output = `# Page Snapshot: ${result.title}\n**URL:** ${result.url}\n\n## Element Tree\n\n${treeOutput}\n\n---\nUse ref values (e.g., "e5") with browser_click or browser_type selectors: [data-vyotiq-ref="e5"]`;

    return {
      toolName: 'browser_snapshot',
      success: true,
      output,
      metadata: {
        url: result.url,
        title: result.title,
        tree: result.tree,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Snapshot error', { error: errorMessage });
    
    return {
      toolName: 'browser_snapshot',
      success: false,
      output: `Snapshot failed: ${errorMessage}`,
    };
  }
}

export const browserSnapshotTool: ToolDefinition<SnapshotArgs> = {
  name: 'browser_snapshot',
  description: `Capture accessibility snapshot of the page structure.

**Better than screenshots for:**
- Understanding page structure
- Finding interactive elements
- Getting element references for interactions

**Returns:**
- Hierarchical tree of elements with roles and names
- Reference IDs (ref) for use with other browser tools
- Element states (focused, checked, disabled)

**Use refs in selectors:** [data-vyotiq-ref="e5"]`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'Root element to snapshot (default: whole page)',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth to traverse (default: 10)',
      },
      interactiveOnly: {
        type: 'boolean',
        description: 'Only include interactive elements',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Layers',
    label: 'Snapshot',
    color: 'text-indigo-400',
    runningLabel: 'Capturing...',
    completedLabel: 'Captured',
  },

  inputExamples: [
    {},
    { interactiveOnly: true },
    { selector: 'form', maxDepth: 5 },
  ],

  execute: executeSnapshot,
};
