# Vyotiq - AI Coding Agent Instructions

## Critical Guidelines (Read First)

### Before Any Code Changes
1. **Analyze First**: Always analyze the complete codebase to understand current state, features, patterns, and architecture before making changes
2. **Find Root Causes**: When fixing errors, trace through the entire call chain to find and fix root causes, not just symptoms
3. **Check Existing Files**: Before creating ANY new file, search the codebase for existing files with similar functionality:
   - Use `grep` or semantic search to find related code
   - If an existing file covers the same feature area, **extend it** rather than creating duplicates
   - Only create new files for genuinely distinct functionality
4. **Preserve Functionality**: When updating existing files, maintain all existing features while adding new ones

### Implementation Standards
- **No Placeholders**: Implement real, complete functionality - never use placeholder functions, TODO comments as implementations, or mock data where real logic is needed
- **No Monoliths**: Keep files focused and small (<300 lines preferred). Split large files into logical modules
- **Real Error Handling**: Implement actual error recovery, not just `console.error` statements

### ⚠️ STRICT: No Over-Engineering (MANDATORY)
**This is non-negotiable. Violating these rules wastes time and creates maintenance burden.**

1. **Implement ONLY what is explicitly requested** - Nothing more, nothing less
2. **No speculative features** - Don't add functionality "in case it's needed later"
3. **No premature abstractions** - Don't create interfaces, factories, or patterns until there are 3+ concrete use cases
4. **No unnecessary layers** - If a direct function call works, don't wrap it in a class/service/manager
5. **No configuration for single-use values** - Hardcode values that won't change; extract only when reuse is proven
6. **Simplest solution first but functional** - Always choose the straightforward approach over the "elegant" one
7. **Implement correct tool names in the codebase** - Use `@typescript-eslint/naming-convention` to enforce correct naming conventions
8. **No unnecessary dependencies** - Don't add dependencies that are not used in the codebase
9. **No unnecessary code** - Don't add code that is not used in the codebase
10. **No unnecessary files** - Don't add files that are not used in the codebase
11. **No unnecessary comments** - Don't add comments that are not used in the codebase
12. **No unnecessary imports** - Don't add imports that are not used in the codebase
13. **No unnecessary exports** - Don't add exports that are not used in the codebase
14. **No unnecessary types** - Don't add types that are not used in the codebase
15. **No unnecessary constants** - Don't add constants that are not used in the codebase 
16. **No unnecessary variables** - Don't add variables that are not used in the codebase
17. **No unnecessary functions** - Don't add functions that are not used in the codebase
18. **No unnecessary classes** - Don't add classes that are not used in the codebase
19. **No unnecessary modules** - Don't add modules that are not used in the codebase
20. **No unnecessary packages** - Don't add packages that are not used in the codebase
21. **No unnecessary libraries** - Don't add libraries that are not used in the codebase
22. **IMPORTANT NOTE**:- Always strictly and properly follow all the current complete existing architecture and patterns and best practices and implementations and structure and maintain existing styling everything else. Never remove current existing features and functionalities at all.



**Before adding ANY code, ask:**
- Is this directly solving the user's request? → If no, **don't add it**
- Does this abstraction have 3+ proven uses? → If no, **keep it concrete**
- Am I adding this "just in case"? → If yes, **delete it immediately**
- Could a junior developer understand this in 5 minutes? → If no, **simplify it**

**Examples of over-engineering to AVOID:**
```typescript
// ❌ WRONG: Factory pattern for a single implementation
class ButtonFactory { create(type: string) { return new Button(); } }

// ✅ CORRECT: Just use the component directly
<Button onClick={handleClick}>Save</Button>

// ❌ WRONG: Abstract base class with one subclass
abstract class BaseService<T> { abstract process(data: T): Promise<T>; }
class UserService extends BaseService<User> { ... }

// ✅ CORRECT: Simple function until more services exist
async function processUser(user: User): Promise<User> { ... }

// ❌ WRONG: Configuration object for hardcoded values
const CONFIG = { MAX_RETRIES: 3, TIMEOUT: 5000 };

// ✅ CORRECT: Inline until values need to change
await fetch(url, { timeout: 5000 });
```

**Separation of Concerns:**
- `components/ui/` - Generic, reusable UI primitives (Button, Modal, Input)
- `components/layout/` - App structure components (MainLayout, Sidebar)
- `features/{name}/` - Self-contained feature with its own components, hooks, types
- `hooks/` - Shared hooks used across multiple features
- `utils/` - Pure functions, no React dependencies

### File Organization Checklist
Before creating a file, answer:
1. Does this functionality already exist? → **Search first**
2. Is this reusable across features? → Place in `components/` or `hooks/`
3. Is this feature-specific? → Place in `features/{feature}/`
4. Is this a type definition? → Add to existing type files in `shared/`
5. Is this >300 lines? → **Split into smaller modules**


## Testing

Tests use **Vitest** with `@testing-library/react`:
```typescript
// src/test/setup.ts configures jsdom + mocks
// Place tests alongside code: component.test.tsx or in src/test/
```

## Adding Features or Components

1. **New Tool**: Add to `src/main/tools/implementations/`, export in index, register in `ALL_TOOLS`
2. **New Provider**: Extend `BaseProvider`, add to `src/main/agent/providers/index.ts`
3. **New UI Feature**: Create `src/renderer/features/{name}/` with components + barrel export
4. **New IPC Handler**: Add handler in `ipc.ts`, expose in `preload.ts`, call from renderer

## Code Quality Standards

### Refactoring Guidelines
- **Consolidate duplicates**: If two files do similar things, merge them into one well-designed module
- **Extract shared logic**: Common patterns should become utilities or hooks
- **Single responsibility**: Each file/function should do one thing well
- **Explicit dependencies**: Import what you need, don't rely on global state

### Error Handling Pattern
```typescript
// ✅ Correct: Specific error handling with recovery
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error: error instanceof Error ? error.message : String(error) });
  return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
}

// ❌ Wrong: Swallowing errors or generic handling
try { await someOperation(); } catch (e) { console.log(e); }
```

### State Management
- Use `AgentProvider` for global agent state (sessions, messages, status)
- Use `UIProvider` for UI-only state (modals, panels, layout)
- Use local `useState` for component-specific state
- Never duplicate state across providers

### Styling Standards
- Use Tailwind CSS v4 utility classes
- Use CSS variables for theming: `var(--color-surface-base)`, `var(--color-text-primary)`
- Dark mode is default - ensure all colors work in dark theme
- Use `cn()` utility from `utils/cn.ts` for conditional classes

## Debugging Checklist

When encountering errors:
1. Check `src/main/logger.ts` console output for main process errors
2. Check browser DevTools console for renderer errors
3. Verify IPC channel names match between `ipc.ts` and `preload.ts`
4. Ensure types are consistent across process boundaries (`shared/types.ts`)
5. Check if the error is in an async callback (common source of unhandled rejections)
