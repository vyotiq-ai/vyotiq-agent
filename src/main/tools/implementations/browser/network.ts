/**
 * Browser Network Tool
 * 
 * Monitor and retrieve network requests for debugging web applications.
 * Essential for understanding API calls, failed requests, and load times.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface NetworkArgs extends Record<string, unknown> {
  /** Filter by resource type */
  type?: 'all' | 'xhr' | 'fetch' | 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'other';
  /** Filter by status (success, error, pending) */
  status?: 'all' | 'success' | 'error' | 'pending';
  /** Maximum number of requests to return */
  limit?: number;
  /** Clear requests after retrieving */
  clear?: boolean;
  /** Filter by URL pattern */
  urlPattern?: string;
}

// Store network requests in memory
export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  status: number | null;
  statusText: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  size?: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

const networkRequests: NetworkRequest[] = [];

// Maximum requests to keep
const MAX_REQUESTS = 200;

/**
 * Add a network request entry
 */
export function addNetworkRequest(request: NetworkRequest): void {
  networkRequests.push(request);
  
  // Keep only recent requests
  if (networkRequests.length > MAX_REQUESTS) {
    networkRequests.splice(0, networkRequests.length - MAX_REQUESTS);
  }
}

/**
 * Update a network request with response data
 */
export function updateNetworkRequest(
  id: string, 
  update: Partial<NetworkRequest>
): void {
  const request = networkRequests.find(r => r.id === id);
  if (request) {
    Object.assign(request, update);
    if (update.endTime && request.startTime) {
      request.duration = update.endTime - request.startTime;
    }
  }
}

/**
 * Clear all network requests
 */
export function clearNetworkRequests(): void {
  networkRequests.length = 0;
}

/**
 * Get network requests with filtering
 */
export function getNetworkRequests(options?: {
  type?: string;
  status?: string;
  limit?: number;
  urlPattern?: string;
}): NetworkRequest[] {
  let requests = [...networkRequests];
  
  // Filter by resource type
  if (options?.type && options.type !== 'all') {
    requests = requests.filter(req => {
      if (options.type === 'xhr' || options.type === 'fetch') {
        return req.resourceType === 'xhr' || req.resourceType === 'fetch';
      }
      return req.resourceType === options.type;
    });
  }
  
  // Filter by status
  if (options?.status && options.status !== 'all') {
    requests = requests.filter(req => {
      if (options.status === 'success') {
        return req.status !== null && req.status >= 200 && req.status < 400;
      }
      if (options.status === 'error') {
        return req.status === null || req.status >= 400 || req.error;
      }
      if (options.status === 'pending') {
        return req.status === null && !req.error && !req.endTime;
      }
      return true;
    });
  }
  
  // Filter by URL pattern
  if (options?.urlPattern) {
    const pattern = options.urlPattern.toLowerCase();
    requests = requests.filter(req => req.url.toLowerCase().includes(pattern));
  }
  
  // Apply limit
  if (options?.limit) {
    requests = requests.slice(-options.limit);
  }
  
  return requests;
}

async function executeNetwork(
  args: NetworkArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { type = 'all', status = 'all', limit = 50, clear = false, urlPattern } = args;
  
  context.logger.info('Getting network requests', { type, status, limit, urlPattern });

  try {
    const requests = getNetworkRequests({ type, status, limit, urlPattern });
    
    if (clear) {
      clearNetworkRequests();
    }

    if (requests.length === 0) {
      return {
        toolName: 'browser_network',
        success: true,
        output: 'No network requests captured. Navigate to a page to capture network activity.',
        metadata: { requestCount: 0 },
      };
    }

    // Format requests for output
    let output = `## Network Requests (${requests.length})\n\n`;
    
    const statusIcons: Record<string, string> = {
      success: '[OK]',
      error: '[ERR]',
      pending: '[...]',
    };
    
    for (const req of requests) {
      const isError = req.status === null || req.status >= 400 || req.error;
      const isPending = req.status === null && !req.error && !req.endTime;
      
      const icon = isPending ? statusIcons.pending : (isError ? statusIcons.error : statusIcons.success);
      const statusStr = req.status !== null ? `${req.status} ${req.statusText}` : (req.error || 'Pending');
      const durationStr = req.duration ? `${req.duration}ms` : '-';
      const sizeStr = req.size ? formatBytes(req.size) : '-';
      
      output += `${icon} **${req.method}** \`${truncateUrl(req.url, 60)}\`\n`;
      output += `   Status: ${statusStr} | Time: ${durationStr} | Size: ${sizeStr} | Type: ${req.resourceType}\n\n`;
    }
    
    // Summary
    const successCount = requests.filter(r => r.status !== null && r.status >= 200 && r.status < 400).length;
    const errorCount = requests.filter(r => r.status === null || r.status >= 400 || r.error).length;
    const pendingCount = requests.filter(r => r.status === null && !r.error && !r.endTime).length;
    
    output += `---\n**Summary:** ${successCount} successful, ${errorCount} failed, ${pendingCount} pending\n`;

    return {
      toolName: 'browser_network',
      success: true,
      output,
      metadata: {
        requestCount: requests.length,
        successCount,
        errorCount,
        pendingCount,
        cleared: clear,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Network request error', { error: errorMessage });
    
    return {
      toolName: 'browser_network',
      success: false,
      output: `Failed to get network requests: ${errorMessage}`,
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function truncateUrl(url: string, maxLength: number): string {
  if (url.length <= maxLength) return url;
  const start = url.slice(0, maxLength / 2);
  const end = url.slice(-(maxLength / 2 - 3));
  return `${start}...${end}`;
}

export const browserNetworkTool: ToolDefinition<NetworkArgs> = {
  name: 'browser_network',
  description: `Monitor and retrieve network requests made by the browser. Essential for debugging API issues.

## When to Use
- **Debug API calls**: Check if requests succeed or fail
- **Verify requests**: Confirm expected API calls are made
- **Performance**: Monitor request timing and sizes
- **Troubleshoot**: Find CORS, auth, or network issues

## Workflow Integration
Use after interactions to check API responses:
\`\`\`
browser_navigate(url)
browser_click(submit_button)
browser_network(type: "xhr", status: "error") → check for failed API calls
[if errors found, investigate]
\`\`\`

## API Debugging Pattern
\`\`\`
browser_fill_form(fields, submit: true)
browser_wait(text: "Success")
browser_network(urlPattern: "/api/") → check API calls
browser_console(level: "errors") → check for JS errors
\`\`\`

## Captures
- XHR/Fetch API calls
- Document/script/stylesheet loads
- Image and font requests
- Request/response status and timing

## Parameters
- **type** (optional): Filter by resource type - all, xhr, fetch, document, script, etc.
- **status** (optional): Filter by request status - all, success, error, pending
- **limit** (optional): Maximum number of requests to return (default: 50)
- **clear** (optional): Clear requests after retrieving (default: false)
- **urlPattern** (optional): Filter by URL pattern

## Best Practices
- Use type: "xhr" to focus on API calls
- Use status: "error" to find failed requests
- Use urlPattern to filter specific endpoints
- Combine with browser_console for full debugging`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'xhr', 'fetch', 'document', 'script', 'stylesheet', 'image', 'font', 'other'],
        description: 'Filter by resource type (default: all)',
      },
      status: {
        type: 'string',
        enum: ['all', 'success', 'error', 'pending'],
        description: 'Filter by request status (default: all)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of requests to return (default: 50)',
      },
      clear: {
        type: 'boolean',
        description: 'Clear requests after retrieving (default: false)',
      },
      urlPattern: {
        type: 'string',
        description: 'Filter by URL pattern',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Network',
    label: 'Network',
    color: 'text-cyan-400',
    runningLabel: 'Getting requests...',
    completedLabel: 'Requests retrieved',
  },

  inputExamples: [
    {},
    { type: 'xhr', status: 'error' },
    { urlPattern: '/api/' },
    { status: 'error', limit: 20 },
  ],

  execute: executeNetwork,
};
