/**
 * Browser Interact Tool (Unified)
 *
 * Consolidates 10 previously-separate deferred browser tools into a single tool
 * with an `action` parameter. This reduces the model's decision surface while
 * preserving every capability.
 *
 * Inspired by Vercel's "addition by subtraction" insight: fewer tools → fewer
 * choices the model must evaluate → faster, cheaper, more accurate runs.
 *
 * Replaces: browser_fill_form, browser_hover, browser_evaluate, browser_state,
 *           browser_back, browser_forward, browser_reload, browser_network,
 *           browser_tabs, browser_security_status
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager, getBrowserSecurity } from '../../../browser';
import { getConsoleLogs } from './console';
import { getNetworkRequests, clearNetworkRequests, type NetworkRequest } from './network';
import type { FormField } from './types';
import { createLogger } from '../../../logger';

const logger = createLogger('browser_interact');

// ---------------------------------------------------------------------------
// Args union
// ---------------------------------------------------------------------------
type InteractAction =
  | 'fill_form'
  | 'hover'
  | 'evaluate'
  | 'state'
  | 'back'
  | 'forward'
  | 'reload'
  | 'network'
  | 'tabs'
  | 'security_status';

interface InteractArgs extends Record<string, unknown> {
  /** Which interaction to perform */
  action: InteractAction;

  // --- fill_form ---
  /** Fields to fill (fill_form) */
  fields?: FormField[];
  /** Submit form after filling (fill_form) */
  submit?: boolean;
  /** Form selector for submit (fill_form) */
  formSelector?: string;

  // --- hover ---
  /** CSS selector (hover, evaluate with element) */
  selector?: string;
  /** Hover duration in ms (hover, default: 500) */
  duration?: number;

  // --- evaluate ---
  /** JavaScript to execute (evaluate) */
  script?: string;

  // --- state ---
  /** Include console logs (state) */
  includeConsole?: boolean;
  /** Include network requests (state) */
  includeNetwork?: boolean;

  // --- network ---
  /** Filter resource type (network) */
  type?: 'all' | 'xhr' | 'fetch' | 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'other';
  /** Filter status (network) */
  status?: 'all' | 'success' | 'error' | 'pending';
  /** Max requests (network) */
  limit?: number;
  /** Clear after retrieving (network) */
  clear?: boolean;
  /** URL filter pattern (network) */
  urlPattern?: string;

  // --- tabs ---
  /** Tab sub-action (tabs) */
  tabAction?: 'list' | 'new' | 'close' | 'switch';
  /** Tab index (tabs) */
  index?: number;
  /** URL for new tab (tabs) */
  url?: string;

  // --- security_status ---
  /** Include security events (security_status) */
  includeEvents?: boolean;
  /** Event limit (security_status) */
  eventLimit?: number;
  /** Include security config (security_status) */
  includeConfig?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-handlers
// ---------------------------------------------------------------------------

async function handleFillForm(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { fields, submit = false, formSelector } = args;
  const browser = getBrowserManager();

  if (!fields || fields.length === 0) {
    return { toolName: 'browser_interact', success: false, output: 'Error: fields array is required for fill_form action' };
  }

  context.logger.info('Filling form', { fieldCount: fields.length, submit });

  const results: { field: string; success: boolean; error?: string }[] = [];
  for (const field of fields) {
    const { ref, name, type, value } = field;
    const selector = ref.startsWith('e') ? `[data-vyotiq-ref="${ref}"]` : ref;
    let success = false;
    let error: string | undefined;
    try {
      switch (type) {
        case 'textbox':
        case 'textarea': {
          success = await browser.evaluate<boolean>(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return false; el.focus(); el.value='${value.replace(/'/g, "\\'")}'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
          break;
        }
        case 'checkbox': {
          const checked = value === 'true' || String(value) === 'true';
          success = await browser.evaluate<boolean>(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return false; if(el.checked!==${checked}) el.click(); return true; })()`);
          break;
        }
        case 'radio': {
          success = await browser.evaluate<boolean>(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return false; el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
          break;
        }
        case 'combobox': {
          success = await browser.evaluate<boolean>(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return false; for(var o of (el.options||el.querySelectorAll('option'))){ if(o.value==='${value.replace(/'/g, "\\'")}'||o.textContent?.trim()==='${value.replace(/'/g, "\\'")}'){ el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); return true; } } return false; })()`);
          if (!success) error = `Option "${value}" not found`;
          break;
        }
        case 'slider': {
          success = await browser.evaluate<boolean>(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return false; el.value='${value}'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
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

  // Optional submit
  if (submit) {
    const submitScript = formSelector
      ? `document.querySelector('${formSelector.replace(/'/g, "\\'")}')?.submit() ?? false`
      : `(document.querySelector('form') || document.querySelector('[data-vyotiq-ref]')?.closest('form'))?.submit() ?? false`;
    try { await browser.evaluate(submitScript); } catch { /* best-effort */ }
  }

  const ok = results.filter(r => r.success).length;
  const fail = results.length - ok;
  let output = `Form Fill: ${ok}/${results.length} fields filled\n`;
  for (const r of results) output += `${r.success ? '[OK]' : '[ERR]'} ${r.field}${r.error ? ': ' + r.error : ''}\n`;
  if (submit) output += `Form submitted.`;

  return { toolName: 'browser_interact', success: fail === 0, output, metadata: { action: 'fill_form', filledCount: ok, failedCount: fail } };
}

async function handleHover(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { selector, duration = 500 } = args;
  const browser = getBrowserManager();
  if (!selector) return { toolName: 'browser_interact', success: false, output: 'Error: selector required for hover action' };

  context.logger.info('Hovering', { selector, duration });

  const result = await browser.evaluate<{ success: boolean; error?: string; element?: { tag: string; text: string } }>(`
    (function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!el) return {success:false,error:'Element not found'};
    var r=el.getBoundingClientRect(); var x=r.left+r.width/2; var y=r.top+r.height/2;
    el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true,clientX:x,clientY:y}));
    el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:x,clientY:y}));
    return {success:true,element:{tag:el.tagName.toLowerCase(),text:(el.textContent||'').trim().slice(0,50)}}; })()`);

  if (!result?.success) return { toolName: 'browser_interact', success: false, output: result?.error ?? 'Hover failed' };

  await new Promise(resolve => setTimeout(resolve, duration));
  await browser.evaluate(`(function(){ var el=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(el){ el.dispatchEvent(new MouseEvent('mouseleave',{bubbles:true})); } })()`);

  return { toolName: 'browser_interact', success: true, output: `Hovered: ${selector} (<${result.element?.tag}> "${result.element?.text}")`, metadata: { action: 'hover', selector } };
}

async function handleEvaluate(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { script, selector } = args;
  const browser = getBrowserManager();
  if (!script) return { toolName: 'browser_interact', success: false, output: 'Error: script required for evaluate action' };

  context.logger.info('Evaluating JS', { scriptLength: script.length });

  let wrappedScript: string;
  if (selector) {
    wrappedScript = `(function(){ var element=document.querySelector('${selector.replace(/'/g, "\\'")}'); if(!element) return {__error:'Element not found'}; try{ var fn=${script}; return typeof fn==='function'?fn(element):fn; }catch(e){return {__error:e.message};} })()`;
  } else {
    wrappedScript = `(function(){ try{ var result=${script}; return typeof result==='function'?result():result; }catch(e){return {__error:e.message};} })()`;
  }

  const result = await browser.evaluate<unknown>(wrappedScript);
  if (result && typeof result === 'object' && '__error' in result) {
    return { toolName: 'browser_interact', success: false, output: `Script error: ${(result as { __error: string }).__error}` };
  }

  let output: string;
  if (result === undefined) output = 'Script executed (returned undefined)';
  else if (result === null) output = 'Result: null';
  else if (typeof result === 'object') {
    try { output = `Result:\n${JSON.stringify(result, null, 2)}`; } catch { output = 'Result: [Object - could not stringify]'; }
  } else output = `Result: ${String(result)}`;

  return { toolName: 'browser_interact', success: true, output, metadata: { action: 'evaluate', result } };
}

async function handleState(args: InteractArgs): Promise<ToolExecutionResult> {
  const { includeConsole = false, includeNetwork = false } = args;
  const browser = getBrowserManager();
  const state = browser.getState();

  let output = `URL: ${state.url || '(none)'}\nTitle: ${state.title}\nLoading: ${state.isLoading ? 'Yes' : 'No'}\nBack: ${state.canGoBack ? 'Yes' : 'No'} | Forward: ${state.canGoForward ? 'Yes' : 'No'}`;
  if (state.error) output += `\nError: ${state.error}`;

  if (state.url) {
    try {
      const info = await browser.evaluate<{ viewport: { width: number; height: number }; forms: number; links: number; images: number }>(`
        (function(){ return { viewport:{width:window.innerWidth,height:window.innerHeight}, forms:document.forms.length, links:document.links.length, images:document.images.length }; })()`);
      if (info) output += `\nViewport: ${info.viewport.width}x${info.viewport.height} | Forms: ${info.forms} | Links: ${info.links} | Images: ${info.images}`;
    } catch { /* page info unavailable */ }
  }

  if (includeConsole) {
    const logs = getConsoleLogs({ limit: 10 });
    if (logs.length > 0) output += '\n\nConsole:\n' + logs.map(l => `[${l.level.toUpperCase()}] ${l.message.slice(0, 150)}`).join('\n');
  }
  if (includeNetwork) {
    const reqs = getNetworkRequests({ limit: 10 });
    if (reqs.length > 0) output += '\n\nNetwork:\n' + reqs.map(r => `${r.method} ${r.url.slice(0, 60)} → ${r.status ?? 'pending'}`).join('\n');
  }

  return { toolName: 'browser_interact', success: true, output, metadata: { action: 'state', ...state } };
}

async function handleNavigation(direction: 'back' | 'forward' | 'reload', context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const browser = getBrowserManager();
  context.logger.info(`Browser ${direction}`);

  try {
    if (direction === 'back') {
      const ok = await browser.goBack();
      if (!ok) return { toolName: 'browser_interact', success: false, output: 'Cannot go back — no history' };
    } else if (direction === 'forward') {
      const ok = await browser.goForward();
      if (!ok) return { toolName: 'browser_interact', success: false, output: 'Cannot go forward — no forward history' };
    } else {
      await browser.reload();
    }

    await new Promise(resolve => setTimeout(resolve, direction === 'reload' ? 1000 : 500));
    const state = browser.getState();
    return { toolName: 'browser_interact', success: true, output: `${direction}: ${state.url}\nTitle: ${state.title}`, metadata: { action: direction, url: state.url } };
  } catch (error) {
    return { toolName: 'browser_interact', success: false, output: `${direction} failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function handleNetwork(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { type = 'all', status = 'all', limit: maxLimit = 50, clear: shouldClear = false, urlPattern } = args;
  context.logger.info('Getting network requests', { type, status, maxLimit });

  const requests = getNetworkRequests({ type, status, limit: maxLimit, urlPattern });
  if (shouldClear) clearNetworkRequests();
  if (requests.length === 0) return { toolName: 'browser_interact', success: true, output: 'No network requests captured.', metadata: { action: 'network', requestCount: 0 } };

  let output = `Network Requests (${requests.length}):\n\n`;
  for (const req of requests) {
    const isErr = req.status === null || req.status >= 400 || req.error;
    const icon = isErr ? '[ERR]' : '[OK]';
    const dur = req.duration ? `${req.duration}ms` : '-';
    output += `${icon} ${req.method} ${req.url.slice(0, 60)} → ${req.status ?? 'pending'} (${dur})\n`;
  }

  return { toolName: 'browser_interact', success: true, output, metadata: { action: 'network', requestCount: requests.length } };
}

async function handleTabs(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { tabAction = 'list', url } = args;
  const browser = getBrowserManager();
  context.logger.info('Browser tabs', { tabAction });

  const state = browser.getState();
  switch (tabAction) {
    case 'list':
      return { toolName: 'browser_interact', success: true, output: `Current tab:\nURL: ${state.url || '(empty)'}\nTitle: ${state.title || 'New Tab'}`, metadata: { action: 'tabs' } };
    case 'new':
      if (url) {
        const result = await browser.navigate(url);
        return { toolName: 'browser_interact', success: result.success, output: result.success ? `Navigated to: ${result.url}` : `Failed: ${result.error}`, metadata: { action: 'tabs' } };
      }
      return { toolName: 'browser_interact', success: true, output: 'Ready. Use browser_navigate to go to a URL.' };
    case 'close':
      browser.stop();
      return { toolName: 'browser_interact', success: true, output: 'Page loading stopped.' };
    case 'switch':
      return { toolName: 'browser_interact', success: true, output: 'Single-tab mode — already on current tab.' };
    default:
      return { toolName: 'browser_interact', success: false, output: `Unknown tab action: ${tabAction}` };
  }
}

async function handleSecurityStatus(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { includeEvents = true, eventLimit = 20, includeConfig = false } = args;
  context.logger.info('Getting security status');

  try {
    const security = getBrowserSecurity();
    const browser = getBrowserManager();
    const stats = security.getStats();
    const browserState = browser.getState();

    let output = `Security Status\nURL: ${browserState.url || 'No page'}\nBlocked: URLs=${stats.blockedUrls} Popups=${stats.blockedPopups} Ads=${stats.blockedAds} Trackers=${stats.blockedTrackers}`;

    if (includeConfig) {
      const config = security.getConfig();
      output += `\n\nConfig: URL filter=${config.urlFilteringEnabled ? 'ON' : 'OFF'} Popup block=${config.popupBlockingEnabled ? 'ON' : 'OFF'} Ad block=${config.adBlockingEnabled ? 'ON' : 'OFF'}`;
    }
    if (includeEvents) {
      const events = security.getEvents(eventLimit);
      if (events.length > 0) {
        output += '\n\nRecent events:\n';
        for (const ev of events.slice(-eventLimit)) {
          output += `[${ev.type.toUpperCase()}] ${ev.category}: ${ev.reason} (${ev.url.slice(0, 80)})\n`;
        }
      }
    }

    return { toolName: 'browser_interact', success: true, output, metadata: { action: 'security_status', stats } };
  } catch (error) {
    return { toolName: 'browser_interact', success: false, output: `Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ---------------------------------------------------------------------------
// Main execute dispatcher
// ---------------------------------------------------------------------------
async function executeInteract(args: InteractArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { action } = args;
  if (!action) return { toolName: 'browser_interact', success: false, output: 'Error: "action" is required. Valid: fill_form, hover, evaluate, state, back, forward, reload, network, tabs, security_status' };

  try {
    switch (action) {
      case 'fill_form':       return await handleFillForm(args, context);
      case 'hover':           return await handleHover(args, context);
      case 'evaluate':        return await handleEvaluate(args, context);
      case 'state':           return await handleState(args);
      case 'back':            return await handleNavigation('back', context);
      case 'forward':         return await handleNavigation('forward', context);
      case 'reload':          return await handleNavigation('reload', context);
      case 'network':         return await handleNetwork(args, context);
      case 'tabs':            return await handleTabs(args, context);
      case 'security_status': return await handleSecurityStatus(args, context);
      default:
        return { toolName: 'browser_interact', success: false, output: `Unknown action: ${action}. Valid: fill_form, hover, evaluate, state, back, forward, reload, network, tabs, security_status` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    context.logger.error('browser_interact error', { action, error: msg });
    return { toolName: 'browser_interact', success: false, output: `${action} failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------
export const browserInteractTool: ToolDefinition<InteractArgs> = {
  name: 'browser_interact',
  description: `Perform advanced browser interactions. Choose an action:

**Actions:**
- **fill_form** — Fill multiple form fields at once (fields, submit?, formSelector?)
- **hover** — Hover over an element (selector, duration?)
- **evaluate** — Execute JavaScript in page context (script, selector?)
- **state** — Get browser URL, title, page info (includeConsole?, includeNetwork?)
- **back** / **forward** / **reload** — Browser history navigation
- **network** — Monitor network requests (type?, status?, limit?, urlPattern?, clear?)
- **tabs** — Manage tabs (tabAction: list/new/close/switch, url?, index?)
- **security_status** — Check security stats (includeEvents?, includeConfig?)

Most common pattern: action="state" to inspect, then action="fill_form" or action="evaluate" to interact.`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'moderate',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['fill_form', 'hover', 'evaluate', 'state', 'back', 'forward', 'reload', 'network', 'tabs', 'security_status'],
        description: 'Which browser interaction to perform',
      },
      // fill_form params
      fields: { type: 'array', description: 'Form fields to fill (fill_form): [{ref, name, type, value}]' },
      submit: { type: 'boolean', description: 'Submit form after filling (fill_form)' },
      formSelector: { type: 'string', description: 'Form CSS selector for submit (fill_form)' },
      // hover params
      selector: { type: 'string', description: 'CSS selector (hover, evaluate)' },
      duration: { type: 'number', description: 'Hover duration in ms (hover, default: 500)' },
      // evaluate params
      script: { type: 'string', description: 'JavaScript code to execute (evaluate)' },
      // state params
      includeConsole: { type: 'boolean', description: 'Include console logs (state)' },
      includeNetwork: { type: 'boolean', description: 'Include network requests (state)' },
      // network params
      type: { type: 'string', description: 'Filter resource type (network)' },
      status: { type: 'string', description: 'Filter status (network): all, success, error, pending' },
      limit: { type: 'number', description: 'Max results (network)' },
      clear: { type: 'boolean', description: 'Clear requests after retrieving (network)' },
      urlPattern: { type: 'string', description: 'Filter by URL pattern (network)' },
      // tabs params
      tabAction: { type: 'string', enum: ['list', 'new', 'close', 'switch'], description: 'Tab sub-action (tabs)' },
      index: { type: 'number', description: 'Tab index (tabs)' },
      url: { type: 'string', description: 'URL for new tab (tabs)' },
      // security_status params
      includeEvents: { type: 'boolean', description: 'Include security events (security_status)' },
      eventLimit: { type: 'number', description: 'Max events (security_status)' },
      includeConfig: { type: 'boolean', description: 'Include security config (security_status)' },
    },
    required: ['action'],
  },

  searchKeywords: [
    'browser', 'web', 'automation', 'form', 'fill', 'hover', 'evaluate', 'javascript',
    'state', 'back', 'forward', 'reload', 'network', 'tabs', 'security',
  ],

  inputExamples: [
    { action: 'state' },
    { action: 'fill_form', fields: [{ ref: 'e5', name: 'Email', type: 'textbox', value: 'test@example.com' }], submit: true },
    { action: 'hover', selector: '.dropdown-trigger' },
    { action: 'evaluate', script: 'document.title' },
    { action: 'back' },
    { action: 'network', type: 'xhr', status: 'error' },
  ],

  ui: {
    icon: 'MousePointerClick',
    label: 'Interact',
    color: 'text-violet-400',
    runningLabel: 'Interacting...',
    completedLabel: 'Done',
  },

  execute: executeInteract,
};
