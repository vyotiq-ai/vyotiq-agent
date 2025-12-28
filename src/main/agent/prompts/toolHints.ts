/**
 * Tool-Specific Hints
 * 
 * Precise parameter guidance for tools that are commonly misused.
 * These hints help prevent common errors like incorrect paths, 
 * malformed old_string, etc.
 */
export const TOOL_HINTS = `
<tool_hints>

## 🔧 edit() — Most Critical Tool

The \`edit\` tool requires precision. Errors here cause cascading failures.

### old_string MUST BE:
| Requirement | Why |
|-------------|-----|
| **Byte-for-byte exact** | Including ALL whitespace, indentation, newlines |
| **3+ lines of context** | Single lines often match multiple locations |
| **No shortcuts** | Never use \`...\`, \`// ...\`, or \`# existing code\` |
| **Unique in file** | If ambiguous, add more surrounding context |

### Common Failure Patterns
\`\`\`
❌ FAILS — Missing indentation:
old_string: "function foo() {"

❌ FAILS — Missing newlines:
old_string: "function foo() { return true; }"

✅ WORKS — Exact match with context:
old_string: "  function foo() {\\n    return true;\\n  }"
\`\`\`

### Parameters
| Param | Required | Notes |
|-------|----------|-------|
| \`file_path\` | ✅ | ABSOLUTE path (workspace_root + relative) |
| \`old_string\` | ✅ | Exact content to find and replace |
| \`new_string\` | ✅ | Replacement content (empty string = delete) |
| \`replace_all\` | ❌ | Default: false. Set true for global replace |

---

## 📖 read() — File Reading

### Large File Strategy
\`\`\`json
{
  "path": "/workspace/src/large-file.ts",
  "offset": 100,  // Start at line 100
  "limit": 50     // Read 50 lines
}
\`\`\`

- Default: First ~150 lines
- Always read the section you plan to edit + surrounding context
- For unknown files, read first to understand structure

---

## 🔍 grep() — Content Search

### output_mode Selection
| Mode | Returns | Use When |
|------|---------|----------|
| \`"content"\` | Lines with context | Need to see the code |
| \`"files_with_matches"\` | File paths only | Finding which files to read |
| \`"count"\` | Match counts | Gauging scope of changes |

### Effective Patterns
\`\`\`json
// Find all usages of a function
{ "pattern": "\\\\bfunctionName\\\\(", "path": "src/", "output_mode": "files_with_matches" }

// Find imports
{ "pattern": "import.*from.*moduleName", "path": "src/" }

// Find TODO comments
{ "pattern": "TODO|FIXME|HACK", "path": "src/" }
\`\`\`

---

## 📁 glob() — File Discovery

### Pattern Reference
| Pattern | Matches |
|---------|---------|
| \`**/*.ts\` | All .ts files recursively |
| \`**/*.{ts,tsx}\` | All .ts and .tsx files |
| \`src/**/*.test.ts\` | Test files in src |
| \`**/components/**/*.tsx\` | Components anywhere |
| \`!**/node_modules/**\` | Exclude node_modules |

---

## 💻 run() — Terminal Execution

### Foreground vs Background
| Use Case | run_in_background | Example |
|----------|-------------------|---------|
| Install/Build/Test | \`false\` | \`npm install\`, \`npm test\`, \`tsc\` |
| Dev Servers | \`true\` | \`npm run dev\`, \`npm start\` |
| Quick Commands | \`false\` | \`git status\`, \`ls\`, \`cat\` |

### Background Process Lifecycle
\`\`\`
run(cmd, run_in_background: true) → returns { pid }
           ↓
check_terminal(pid) → get output, check if running
           ↓
kill_terminal(pid) → stop when done
\`\`\`

---

## 🌐 Browser Tools

### Quick Reference
| Task | Tool |
|------|------|
| Fetch docs/content | \`browser_fetch(url)\` — Fast, no JS |
| Interactive testing | \`browser_navigate(url)\` → \`browser_snapshot()\` |
| Click elements | \`browser_click(ref)\` — ref from snapshot |
| Fill forms | \`browser_fill_form(fields)\` |
| Debug JS | \`browser_console()\` |
| Debug network | \`browser_network()\` |

### Decision: fetch vs navigate
- **browser_fetch**: Static content, documentation, APIs
- **browser_navigate**: SPAs, interactive testing, forms

---

## 🧠 LSP Tools — Code Intelligence

LSP tools provide semantic code understanding. Use them for precise code navigation and analysis.

### When to Use LSP vs grep
| Task | Use LSP | Use grep |
|------|---------|----------|
| Find where function is defined | \`lsp_definition\` ✅ | ❌ |
| Find all usages of a symbol | \`lsp_references\` ✅ | ❌ |
| Understand what a variable is | \`lsp_hover\` ✅ | ❌ |
| Search for text patterns | ❌ | \`grep\` ✅ |
| Find files by name | ❌ | \`glob\` ✅ |

### LSP Tool Quick Reference
| Tool | Purpose | When to Use |
|------|---------|-------------|
| \`lsp_hover\` | Get type info & docs | Understanding unfamiliar code |
| \`lsp_definition\` | Jump to definition | Finding where something is defined |
| \`lsp_references\` | Find all usages | Before renaming, understanding impact |
| \`lsp_symbols\` | File outline or search | Understanding file structure |
| \`lsp_diagnostics\` | Get errors/warnings | After edits, checking code health |
| \`lsp_completions\` | Get suggestions | Exploring available APIs |
| \`lsp_code_actions\` | Get quick fixes | Finding automated fixes for errors |
| \`lsp_rename\` | Compute rename edits | Safe symbol renaming |

### LSP Parameters (1-indexed)
\`\`\`json
// All position-based tools use 1-indexed line/column
{ "file": "src/main.ts", "line": 10, "column": 15 }

// lsp_definition supports type variants
{ "file": "src/main.ts", "line": 10, "column": 15, "type": "definition" }  // default
{ "file": "src/main.ts", "line": 10, "column": 15, "type": "type" }        // type definition
{ "file": "src/main.ts", "line": 10, "column": 15, "type": "implementation" }
\`\`\`

### LSP Workflow Patterns
\`\`\`
Understanding unfamiliar code:
  lsp_hover(file, line, col) → Get type info
      ↓
  lsp_definition(file, line, col) → Jump to source
      ↓
  read(definition_file) → Read the implementation

Safe refactoring:
  lsp_references(file, line, col) → Find all usages
      ↓
  lsp_rename(file, line, col, new_name) → Get edit plan
      ↓
  Apply edits with edit() tool

Fixing errors:
  lsp_diagnostics({ files: ["src/file.ts"] }) → Get errors
      ↓
  lsp_code_actions(file, line, col) → Get quick fixes
      ↓
  Apply fix or manually edit
\`\`\`

</tool_hints>`;
