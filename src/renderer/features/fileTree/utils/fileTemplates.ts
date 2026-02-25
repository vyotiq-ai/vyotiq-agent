/**
 * File Templates
 *
 * Predefined file templates for common file types.
 * Used by the "New from Template" context menu action.
 */

export interface FileTemplate {
  /** Unique template ID */
  id: string;
  /** Display name */
  name: string;
  /** Default file name (with extension) */
  defaultFileName: string;
  /** Category for grouping */
  category: TemplateCategory;
  /** File content template — supports {{name}} placeholder */
  content: string;
  /** Description shown in selector */
  description?: string;
}

export type TemplateCategory = 'web' | 'react' | 'node' | 'config' | 'docs' | 'rust' | 'python' | 'other';

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, string> = {
  web: 'Web',
  react: 'React',
  node: 'Node.js',
  config: 'Config',
  docs: 'Documentation',
  rust: 'Rust',
  python: 'Python',
  other: 'Other',
};

/**
 * Built-in file templates.
 */
export const FILE_TEMPLATES: FileTemplate[] = [
  // ── React ──
  {
    id: 'react-component',
    name: 'React Component',
    defaultFileName: 'Component.tsx',
    category: 'react',
    description: 'Functional React component with TypeScript',
    content: `import React from 'react';

interface {{name}}Props {
  // TODO: define props
}

export const {{name}}: React.FC<{{name}}Props> = (props) => {
  return (
    <div>
      <h1>{{name}}</h1>
    </div>
  );
};
`,
  },
  {
    id: 'react-hook',
    name: 'React Hook',
    defaultFileName: 'useCustom.ts',
    category: 'react',
    description: 'Custom React hook with TypeScript',
    content: `import { useState, useCallback, useEffect } from 'react';

interface Use{{name}}Options {
  // TODO: define options
}

interface Use{{name}}Return {
  // TODO: define return type
}

export function use{{name}}(options?: Use{{name}}Options): Use{{name}}Return {
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    // TODO: implement effect
  }, []);

  return {
    // TODO: return values
  } as Use{{name}}Return;
}
`,
  },
  {
    id: 'react-context',
    name: 'React Context',
    defaultFileName: 'Context.tsx',
    category: 'react',
    description: 'React context with provider and hook',
    content: `import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface {{name}}State {
  // TODO: define state
}

interface {{name}}Actions {
  // TODO: define actions
}

const {{name}}Context = createContext<({{name}}State & {{name}}Actions) | null>(null);

export const {{name}}Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{{name}}State>({
    // TODO: initial state
  });

  const value = {
    ...state,
    // TODO: implement actions
  };

  return (
    <{{name}}Context.Provider value={value as {{name}}State & {{name}}Actions}>
      {children}
    </{{name}}Context.Provider>
  );
};

export function use{{name}}(): {{name}}State & {{name}}Actions {
  const context = useContext({{name}}Context);
  if (!context) throw new Error('use{{name}} must be used within {{name}}Provider');
  return context;
}
`,
  },

  // ── Web ──
  {
    id: 'html-page',
    name: 'HTML Page',
    defaultFileName: 'page.html',
    category: 'web',
    description: 'Basic HTML5 page',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <h1>{{name}}</h1>
</body>
</html>
`,
  },
  {
    id: 'css-module',
    name: 'CSS Module',
    defaultFileName: 'styles.module.css',
    category: 'web',
    description: 'CSS Module file',
    content: `.container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 600;
}
`,
  },

  // ── Node.js ──
  {
    id: 'node-module',
    name: 'TypeScript Module',
    defaultFileName: 'module.ts',
    category: 'node',
    description: 'TypeScript module with exports',
    content: `/**
 * {{name}} Module
 */

export interface {{name}}Options {
  // TODO: define options
}

export class {{name}} {
  private options: {{name}}Options;

  constructor(options: {{name}}Options) {
    this.options = options;
  }

  // TODO: implement methods
}
`,
  },
  {
    id: 'express-route',
    name: 'Express Route',
    defaultFileName: 'route.ts',
    category: 'node',
    description: 'Express.js route handler',
    content: `import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: implement handler
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
`,
  },
  {
    id: 'vitest-test',
    name: 'Vitest Test',
    defaultFileName: 'module.test.ts',
    category: 'node',
    description: 'Vitest test file',
    content: `import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('{{name}}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work', () => {
    // TODO: implement test
    expect(true).toBe(true);
  });
});
`,
  },

  // ── Config ──
  {
    id: 'tsconfig',
    name: 'tsconfig.json',
    defaultFileName: 'tsconfig.json',
    category: 'config',
    description: 'TypeScript configuration',
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`,
  },
  {
    id: 'eslint-config',
    name: 'ESLint Config',
    defaultFileName: 'eslint.config.js',
    category: 'config',
    description: 'ESLint flat config',
    content: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TODO: customize rules
    },
  },
];
`,
  },
  {
    id: 'env-file',
    name: '.env File',
    defaultFileName: '.env',
    category: 'config',
    description: 'Environment variables file',
    content: `# {{name}} Environment Variables
# Copy to .env.local for local overrides

NODE_ENV=development
PORT=3000
`,
  },
  {
    id: 'gitignore',
    name: '.gitignore',
    defaultFileName: '.gitignore',
    category: 'config',
    description: 'Git ignore rules',
    content: `# Dependencies
node_modules/

# Build output
dist/
build/
.next/

# Environment
.env.local
.env*.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
logs/
`,
  },

  // ── Docs ──
  {
    id: 'readme',
    name: 'README',
    defaultFileName: 'README.md',
    category: 'docs',
    description: 'Project README',
    content: `# {{name}}

## Overview

TODO: Project description.

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## License

MIT
`,
  },
  {
    id: 'changelog',
    name: 'Changelog',
    defaultFileName: 'CHANGELOG.md',
    category: 'docs',
    description: 'Project changelog',
    content: `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initial release

### Changed

### Fixed
`,
  },

  // ── Rust ──
  {
    id: 'rust-module',
    name: 'Rust Module',
    defaultFileName: 'module.rs',
    category: 'rust',
    description: 'Rust module with struct',
    content: `//! {{name}} module

/// {{name}} struct
pub struct {{name}} {
    // TODO: define fields
}

impl {{name}} {
    /// Create a new {{name}}
    pub fn new() -> Self {
        Self {
            // TODO: initialize fields
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let instance = {{name}}::new();
        // TODO: implement test
    }
}
`,
  },

  // ── Python ──
  {
    id: 'python-module',
    name: 'Python Module',
    defaultFileName: 'module.py',
    category: 'python',
    description: 'Python module with class',
    content: `"""{{name}} module."""


class {{name}}:
    """{{name}} class."""

    def __init__(self):
        """Initialize {{name}}."""
        pass

    def run(self):
        """Run the main logic."""
        raise NotImplementedError


if __name__ == "__main__":
    instance = {{name}}()
    instance.run()
`,
  },
  {
    id: 'python-test',
    name: 'Python Test',
    defaultFileName: 'test_module.py',
    category: 'python',
    description: 'pytest test file',
    content: `"""Tests for {{name}}."""

import pytest


class Test{{name}}:
    """Test suite for {{name}}."""

    def setup_method(self):
        """Set up test fixtures."""
        pass

    def test_example(self):
        """Test example case."""
        assert True
`,
  },
];

/**
 * Resolve template content with a given name.
 */
export function resolveTemplate(template: FileTemplate, name: string): string {
  return template.content.replace(/\{\{name\}\}/g, name);
}

/**
 * Get templates grouped by category.
 */
export function getTemplatesByCategory(): Map<TemplateCategory, FileTemplate[]> {
  const grouped = new Map<TemplateCategory, FileTemplate[]>();
  for (const tmpl of FILE_TEMPLATES) {
    const list = grouped.get(tmpl.category) ?? [];
    list.push(tmpl);
    grouped.set(tmpl.category, list);
  }
  return grouped;
}
