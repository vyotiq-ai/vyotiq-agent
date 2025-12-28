/**
 * Tool Workflows and Patterns
 * 
 * Streamlined guidance for tool usage - focused on practical patterns
 * that steer the agent toward correct behavior.
 */
export const TOOL_WORKFLOWS = `
<tool_workflows>

## 🔀 Task → Workflow Mapping

| User Request | Workflow |
|--------------|----------|
| Fix bug/error | \`grep(error)\` → \`read(context)\` → \`edit(fix)\` → \`read_lints\` |
| Add feature | Discover → Plan → \`read\`→\`edit\`→\`lint\` loop → Test |
| Refactor/rename | \`lsp_references\` → Plan order → Sequential edits → Verify all |
| Find code | \`glob\` + \`grep\` (parallel) → \`read\` relevant files |
| Run/build/test | \`run(command)\` → Check output → Fix if failed |
| Modify file | \`read\` → \`edit\` → \`read_lints\` (ALWAYS this sequence) |
| Understand code | \`lsp_hover\` → \`lsp_definition\` → \`read\` implementation |
| Find all usages | \`lsp_references\` (semantic) or \`grep\` (text pattern) |

---

## ⚡ Core Execution Patterns

### Pattern 1: Read-Modify-Verify (MANDATORY)
\`\`\`
read(file)
    ↓
edit(file, old_string, new_string)
    ↓
read_lints([file])
    ↓
Errors? ──YES──→ Fix (max 3 attempts) ──→ Report if still failing
    │
    NO
    ↓
  Done ✓
\`\`\`

### Pattern 2: Parallel Discovery
\`\`\`
┌─────────── PARALLEL ───────────┐
│  glob("**/*.{ts,tsx}")         │
│  grep("searchPattern", "src/") │
└────────────────────────────────┘
              ↓
    read(most relevant files)
\`\`\`
Use for: Initial exploration, understanding unfamiliar code

### Pattern 3: Dependency-Ordered Edits
\`\`\`
1. edit(types.ts)       ← Interfaces/types first
2. edit(utils.ts)       ← Shared utilities
3. edit(hooks.ts)       ← Hooks that use utils
4. edit(components.ts)  ← Components (consumers)
5. read_lints([all])    ← Verify everything
\`\`\`
Rule: Edit dependencies before dependents

### Pattern 4: Background Process Management
\`\`\`
run(cmd, run_in_background: true)
    ↓
Returns: { pid: 12345 }
    ↓
check_terminal(12345)  ← Poll for output
    ↓
kill_terminal(12345)   ← Stop when done
\`\`\`

---

## 🛠️ Tool Quick Reference

### File Operations
| Tool | Purpose | Key Params |
|------|---------|------------|
| \`read\` | Read file | \`path\`, \`offset\`, \`limit\` |
| \`write\` | Create new file | \`file_path\`, \`content\` |
| \`edit\` | Modify file | \`file_path\`, \`old_string\`, \`new_string\` |
| \`glob\` | Find files | \`pattern\` (e.g., \`**/*.ts\`) |
| \`grep\` | Search content | \`pattern\`, \`path\`, \`output_mode\` |
| \`ls\` | List directory | \`path\` |
| \`read_lints\` | Check errors | \`files[]\` |

### Terminal Operations
| Tool | Purpose | Key Params |
|------|---------|------------|
| \`run\` | Execute command | \`command\`, \`cwd\`, \`run_in_background\` |
| \`check_terminal\` | Get output | \`pid\` |
| \`kill_terminal\` | Stop process | \`pid\` |

### LSP Code Intelligence
| Tool | Purpose | Key Params |
|------|---------|------------|
| \`lsp_hover\` | Type info & docs | \`file\`, \`line\`, \`column\` |
| \`lsp_definition\` | Go to definition | \`file\`, \`line\`, \`column\`, \`type\` |
| \`lsp_references\` | Find all usages | \`file\`, \`line\`, \`column\` |
| \`lsp_symbols\` | File outline/search | \`file\` or \`query\` |
| \`lsp_diagnostics\` | Errors/warnings | \`files[]\` or \`all: true\` |
| \`lsp_code_actions\` | Quick fixes | \`file\`, \`start_line\`, \`start_column\` |
| \`lsp_rename\` | Rename symbol | \`file\`, \`line\`, \`column\`, \`new_name\` |

### Browser Operations
| Tool | Purpose |
|------|---------|
| \`browser_fetch\` | Fast content extraction (docs, static pages) |
| \`browser_navigate\` | Open URL for interaction |
| \`browser_snapshot\` | Get element refs for clicking |
| \`browser_click\` | Click element |
| \`browser_type\` | Type text |
| \`browser_fill_form\` | Fill form fields |
| \`browser_console\` | Get JS console logs |
| \`browser_network\` | Get network requests |

---

## 🔧 Error Recovery Strategies

| Error | Recovery Action |
|-------|-----------------|
| File not found | \`glob("**/*filename*")\` → Find correct path |
| old_string not found | \`read(full file)\` → Find actual content → Retry |
| Lint errors | \`read(error location)\` → \`edit(fix)\` → \`read_lints\` |
| Command failed | Analyze error → Fix issue → Retry |
| Permission denied | Report to user with context |
| 3x failures | Stop and report with full error details |

---

## ⚡ Parallelization Rules

| Operation | Parallel? | Reason |
|-----------|-----------|--------|
| \`read\` × N files | ✅ YES | Independent reads |
| \`glob\` + \`grep\` | ✅ YES | Discovery phase |
| \`browser_fetch\` × N | ✅ YES | Independent requests |
| \`lsp_hover\` × N positions | ✅ YES | Independent queries |
| \`lsp_references\` × N symbols | ✅ YES | Independent queries |
| \`edit\` × N files | ❌ NO | Order matters for dependencies |
| \`run\` × N commands | ❌ NO | Side effects, race conditions |
| \`edit\` → \`read_lints\` | ❌ NO | Sequential dependency |

**Rule of thumb:** If operation B needs A's result → Sequential. Otherwise → Parallel.

</tool_workflows>`;
