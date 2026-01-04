# Vyotiq AI - Development Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Building Features](#building-features)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Code Standards](#code-standards)
8. [Common Tasks](#common-tasks)

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **npm** 10.x or higher
- **Git** for version control
- **Visual Studio Build Tools** (Windows) or **Xcode Command Line Tools** (macOS)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/vyotiq-ai/Vyotiq-AI.git
cd Vyotiq-AI

# Install dependencies (may take a few minutes for native modules)
npm install

# Start development server
npm start
```

### Troubleshooting Installation

**Windows - Native module compilation errors:**
```bash
# Install Visual Studio Build Tools with "Desktop development with C++" workload
# Then rebuild native modules:
npm rebuild
npx electron-rebuild -f -w node-pty
```

**macOS - Xcode tools:**
```bash
xcode-select --install
```

**Linux - Build essentials:**
```bash
sudo apt-get install build-essential python3
```

---

## Project Structure

### Root Level

```
vyotiq-ai/
├── src/                      # Source code
│   ├── main/                 # Electron main process
│   ├── renderer/             # React frontend
│   └── shared/               # Shared types
├── docs/                     # Documentation
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.*.config.ts          # Vite build configuration
├── vitest.config.ts          # Test configuration
└── .eslintrc.json            # Linting rules
```

### Main Process (`src/main/`)

```
main/
├── agent/                    # AI agent system
│   ├── orchestrator.ts       # Main coordinator
│   ├── sessionManager.ts     # Session persistence
│   ├── runExecutor.ts        # Agent loop execution
│   ├── providers/            # LLM providers
│   ├── context/              # Context management
│   ├── cache/                # Caching systems
│   ├── compliance/           # Safety checks
│   ├── recovery/             # Error recovery
│   └── debugging/            # Execution tracing
├── tools/                    # Tool system
│   ├── implementations/      # Built-in tools
│   ├── factory/              # Dynamic tools
│   ├── executor/             # Tool execution
│   └── registry/             # Tool registry
├── browser/                  # Browser automation
├── lsp/                      # Language servers
├── workspaces/               # Workspace management
├── ipc.ts                    # IPC handlers
├── logger.ts                 # Logging
└── git.ts                    # Git integration
```

### Renderer Process (`src/renderer/`)

```
renderer/
├── features/                 # Feature modules
│   ├── chat/                 # Chat interface
│   ├── editor/               # Code editor
│   ├── terminal/             # Terminal emulator
│   ├── browser/              # Browser panel
│   ├── settings/             # Settings panel
│   ├── sessions/             # Session management
│   ├── undo/                 # Undo history
│   ├── workspaces/           # Workspace switcher
│   └── onboarding/           # First-run wizard
├── state/                    # State management
│   ├── AgentProvider.tsx     # Agent context
│   ├── EditorProvider.tsx    # Editor context
│   ├── UIProvider.tsx        # UI context
│   └── reducers/             # Reducer functions
├── components/               # Shared components
│   ├── layout/               # Layout components
│   └── ui/                   # UI primitives
├── hooks/                    # Custom hooks
├── utils/                    # Utilities
└── types/                    # Type definitions
```

---

## Development Workflow

### Starting Development

```bash
# Start the development server (watches for changes)
npm start

# In another terminal, run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following code standards

3. **Test your changes**:
   ```bash
   npm test
   npm run lint
   ```

4. **Commit with conventional commits**:
   ```bash
   git commit -m "feat(editor): add syntax highlighting for Python"
   ```

5. **Push and create a Pull Request**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Hot Reload

The development server supports hot reload:

- **Main process changes**: Requires restart (`npm start`)
- **Renderer changes**: Hot reload automatically
- **Type changes**: May require restart

---

## Building Features

### Adding a New Tool

Tools are the interface between the agent and the system.

**1. Create tool implementation:**

```typescript
// src/main/tools/implementations/myTool.ts
import type { Tool, ToolExecutor } from '../types';

export const myTool: Tool = {
  name: 'my_tool',
  description: 'Description of what the tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'First parameter',
      },
      param2: {
        type: 'number',
        description: 'Second parameter',
      },
    },
    required: ['param1'],
  },
};

export const executeMyTool: ToolExecutor = async (params, context) => {
  const { param1, param2 } = params as { param1: string; param2?: number };
  
  try {
    // Implement tool logic here
    const result = await doSomething(param1, param2);
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
```

**2. Register the tool:**

```typescript
// src/main/tools/implementations/index.ts
export { myTool, executeMyTool } from './myTool';

// Add to ALL_TOOLS array
export const ALL_TOOLS = [
  // ... existing tools
  myTool,
];
```

**3. Register executor:**

```typescript
// src/main/tools/executor/index.ts
import { executeMyTool } from '../implementations';

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ... existing executors
  my_tool: executeMyTool,
};
```

### Adding a New UI Feature

**1. Create feature directory:**

```
src/renderer/features/myFeature/
├── MyFeaturePanel.tsx        # Main component
├── hooks/                    # Feature-specific hooks
│   └── useMyFeature.ts
├── types.ts                  # Feature types
└── index.ts                  # Barrel export
```

**2. Create main component:**

```typescript
// src/renderer/features/myFeature/MyFeaturePanel.tsx
import React from 'react';
import { useMyFeature } from './hooks/useMyFeature';

interface MyFeaturePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyFeaturePanel: React.FC<MyFeaturePanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { data, loading, error } = useMyFeature();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl m-4 bg-[var(--color-surface-base)] rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <span className="text-xs font-medium">My Feature</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--color-surface-2)]">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {data && <div>{/* Render data */}</div>}
        </div>
      </div>
    </div>
  );
};
```

**3. Create custom hook:**

```typescript
// src/renderer/features/myFeature/hooks/useMyFeature.ts
import { useState, useEffect } from 'react';

export const useMyFeature = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await window.vyotiq.myFeature.getData();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
};
```

**4. Export from feature:**

```typescript
// src/renderer/features/myFeature/index.ts
export { MyFeaturePanel } from './MyFeaturePanel';
export type { MyFeatureType } from './types';
```

**5. Add IPC handler (if needed):**

```typescript
// src/main/ipc.ts
ipcMain.handle('myFeature:getData', async () => {
  // Implement handler logic
  return { /* data */ };
});
```

**6. Expose in preload:**

```typescript
// src/preload.ts
contextBridge.exposeInMainWorld('vyotiq', {
  // ... existing
  myFeature: {
    getData: () => ipcRenderer.invoke('myFeature:getData'),
  },
});
```

### Adding a New Provider

**1. Create provider implementation:**

```typescript
// src/main/agent/providers/myProvider.ts
import type { BaseProvider, LLMRequest, LLMResponse } from './types';

export class MyProvider implements BaseProvider {
  name = 'my_provider' as const;
  
  constructor(private apiKey: string) {}

  async call(request: LLMRequest): Promise<LLMResponse> {
    // Implement API call
    const response = await fetch('https://api.example.com/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      stopReason: data.choices[0].finish_reason,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }

  getStatus() {
    return { available: true, healthy: true };
  }
}
```

**2. Register provider:**

```typescript
// src/main/agent/providers/index.ts
import { MyProvider } from './myProvider';

export function buildProviderMap(settings: Settings) {
  const providers: Record<string, BaseProvider> = {};

  if (settings.apiKeys.myProvider) {
    providers.my_provider = new MyProvider(settings.apiKeys.myProvider);
  }

  return providers;
}
```

---

## Testing

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Tests use **Vitest** with **@testing-library/react**:

```typescript
// src/renderer/features/myFeature/MyFeaturePanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyFeaturePanel } from './MyFeaturePanel';

describe('MyFeaturePanel', () => {
  it('renders when open', () => {
    render(
      <MyFeaturePanel isOpen={true} onClose={vi.fn()} />
    );
    
    expect(screen.getByText('My Feature')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <MyFeaturePanel isOpen={false} onClose={vi.fn()} />
    );
    
    expect(container.firstChild).toBeNull();
  });
});
```

### Test Organization

- Place tests alongside code: `component.test.tsx`
- Or in `src/test/` directory
- Use descriptive test names
- Test behavior, not implementation

---

## Debugging

### Main Process Debugging

```bash
# Enable verbose logging
VYOTIQ_DEBUG=true npm start

# Open DevTools for main process
npm start
# Then press Ctrl+Shift+I
```

### Renderer Process Debugging

```bash
# Open Chrome DevTools
npm start
# Then press Ctrl+Shift+I in the app window
```

### Execution Tracing

Enable in Settings → Debug:

- **Verbose Logging**: More detailed logs
- **Capture Full Payloads**: Log complete request/response
- **Step Mode**: Pause on each tool execution
- **Export on Error**: Auto-export traces on failure

### Common Issues

**Terminal not working:**
- Ensure shell is in PATH
- Check terminal settings in Settings panel
- Verify `node-pty` is properly installed

**API key errors:**
- Verify key is entered correctly (no extra spaces)
- Check API key permissions on provider dashboard
- Try a different provider to isolate the issue

**Performance issues:**
- Enable context compression for long conversations
- Reduce tool result cache size
- Restart the app to clear memory

---

## Code Standards

### TypeScript

- Use strict mode (enabled by default)
- Prefer `const` over `let`, avoid `var`
- Use meaningful names
- Add JSDoc for public APIs
- Use interfaces for object shapes

#### Raw File Imports

Import text files as raw strings using the `?raw` suffix (useful for system prompts, templates):

```typescript
// Import a .txt file as a raw string
import systemPrompt from './prompts/system-prompt.txt?raw';

// Type declarations are in forge.env.d.ts
```

*Last updated: 2026-01-01*

```typescript
// ✅ Good
interface UserConfig {
  name: string;
  apiKey: string;
  maxTokens?: number;
}

async function createUser(config: UserConfig): Promise<User> {
  const { name, apiKey, maxTokens = 4096 } = config;
  // ...
}

// ❌ Avoid
function createUser(name, key, tokens) {
  return new Promise((resolve, reject) => {
    // ...
  });
}
```

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use meaningful prop names
- Add prop types with TypeScript

```typescript
// ✅ Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onClick,
  variant = 'primary',
  disabled = false,
}) => {
  return (
    <button
      className={cn('btn', `btn-${variant}`)}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
};
```

### Styling

- Use Tailwind CSS v4 utility classes
- Use CSS variables for theming
- Dark mode is default
- Use `cn()` utility for conditional classes

```typescript
// ✅ Good
<div className={cn(
  'p-4 rounded-lg',
  'bg-[var(--color-surface-base)]',
  'border border-[var(--color-border-subtle)]',
  isActive && 'ring-2 ring-[var(--color-accent-primary)]'
)}>
  Content
</div>
```

### Error Handling

```typescript
// ✅ Correct
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
}

// ❌ Wrong
try {
  await someOperation();
} catch (e) {
  console.log(e);
}
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance
- `perf`: Performance improvements

**Examples:**
```
feat(editor): add syntax highlighting for Python
fix(terminal): resolve crash when running npm commands on Windows
docs(readme): update installation instructions for macOS
```

---

## Common Tasks

### Adding a New Keyboard Shortcut

**1. Define in App.tsx:**

```typescript
// src/renderer/App.tsx
const commands = useMemo<CommandItem[]>(() => [
  {
    id: 'my-command',
    label: 'My Command',
    description: 'What it does',
    icon: CommandIcons.myIcon,
    shortcut: 'Ctrl+Shift+M',
    category: 'Actions',
    action: () => {
      // Handle action
    },
  },
  // ... other commands
], [/* dependencies */]);
```

**2. Add keyboard listener (if needed):**

```typescript
// src/renderer/hooks/useKeyboard.ts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      // Handle action
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### Adding a New Setting

**1. Update settings type:**

```typescript
// src/shared/types.ts
interface Settings {
  // ... existing settings
  myNewSetting: {
    enabled: boolean;
    value: string;
  };
}
```

**2. Add to settings store:**

```typescript
// src/main/agent/settingsStore.ts
const DEFAULT_SETTINGS: Settings = {
  // ... existing
  myNewSetting: {
    enabled: true,
    value: 'default',
  },
};
```

**3. Add UI in settings panel:**

```typescript
// src/renderer/features/settings/SettingsPanel.tsx
<div className="space-y-4">
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={settings.myNewSetting.enabled}
      onChange={(e) => updateSetting('myNewSetting.enabled', e.target.checked)}
    />
    <span>Enable My Setting</span>
  </label>
  
  <input
    type="text"
    value={settings.myNewSetting.value}
    onChange={(e) => updateSetting('myNewSetting.value', e.target.value)}
    placeholder="Enter value"
  />
</div>
```

### Updating Documentation

1. Edit relevant `.md` file in `docs/`
2. Follow Markdown best practices
3. Include code examples where helpful
4. Keep sections organized with headers
5. Update table of contents if adding new sections

---

## Performance Tips

### Optimization Strategies

1. **Code Splitting**: Lazy load heavy components
   ```typescript
   const SettingsPanel = lazy(() => import('./SettingsPanel'));
   ```

2. **Memoization**: Prevent unnecessary re-renders
   ```typescript
   const memoizedValue = useMemo(() => expensiveComputation(), [deps]);
   const memoizedCallback = useCallback(() => { /* ... */ }, [deps]);
   ```

3. **Virtualization**: Virtualize long lists
   ```typescript
   <VirtualizedList items={items} renderItem={renderItem} />
   ```

4. **Caching**: Cache tool results and LLM responses
   ```typescript
   const cache = new Map();
   if (cache.has(key)) return cache.get(key);
   ```

5. **Debouncing**: Debounce frequent updates
   ```typescript
   const debouncedUpdate = useDebounce(update, 500);
   ```

---

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vitest Documentation](https://vitest.dev)
- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)

---

## Getting Help

- 💬 **Discussions**: [GitHub Discussions](https://github.com/vyotiq-ai/Vyotiq-AI/discussions)
- 🐛 **Issues**: [GitHub Issues](https://github.com/vyotiq-ai/Vyotiq-AI/issues)
- 📖 **Documentation**: Check `docs/` directory
- 🔍 **Search**: Search existing issues and discussions
