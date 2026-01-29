# Contributing to Vyotiq AI

First off, thank you for considering contributing to Vyotiq AI! It's people like you that make Vyotiq such a great tool.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inspiring community for all. By participating, you are expected to uphold this standard. Please be respectful and constructive in all interactions.

## Getting Started

### Types of Contributions We Welcome

- 🐛 **Bug fixes**: Found a bug? We'd love a fix!
- ✨ **New features**: Have an idea? Let's discuss it!
- 📚 **Documentation**: Help us improve our docs
- 🧪 **Tests**: More test coverage is always welcome
- 🎨 **UI/UX improvements**: Make Vyotiq more beautiful and usable
- 🌐 **Translations**: Help us reach more developers worldwide

### Before You Start

1. **Check existing issues**: Someone might already be working on it
2. **Open an issue first**: For significant changes, let's discuss the approach
3. **Read the README**: Understand how the project works

## Development Setup

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- Git
- Visual Studio Build Tools (Windows) or Xcode Command Line Tools (macOS)

### Local Setup

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Vyotiq-AI.git
cd Vyotiq-AI

# Add upstream remote
git remote add upstream https://github.com/vyotiq-ai/Vyotiq-AI.git

# Install dependencies
npm install

# Start development server
npm start
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint
```

## Making Changes

### Branch Naming Convention

Use descriptive branch names:

- `feature/add-gemini-support` - New features
- `fix/terminal-crash-on-windows` - Bug fixes
- `docs/update-installation-guide` - Documentation
- `refactor/simplify-agent-system` - Refactoring

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples:**

```text
feat(editor): add syntax highlighting for Python

fix(terminal): resolve crash when running npm commands on Windows

docs(readme): update installation instructions for macOS
```

### Code Quality Checklist

Before submitting, ensure:

- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] New code has appropriate tests
- [ ] Documentation is updated if needed

## Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** and commit them

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub

6. **Fill out the PR template** completely

7. **Address review feedback** promptly

### PR Review Criteria

Your PR will be reviewed for:

- **Functionality**: Does it work as intended?
- **Code quality**: Is it clean, readable, and maintainable?
- **Tests**: Are there adequate tests?
- **Documentation**: Is the documentation updated?
- **Performance**: Are there any performance concerns?
- **Security**: Are there any security implications?

## Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Use interfaces for object shapes
- Prefer async/await over raw Promises

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
- Add prop types with TypeScript interfaces

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

### File Organization

```text
src/
├── main/           # Electron main process
├── renderer/       # React frontend
│   ├── features/   # Feature modules
│   ├── components/ # Shared components
│   ├── hooks/      # Custom hooks
│   ├── state/      # State management
│   └── utils/      # Utility functions
├── shared/         # Shared types & utilities
└── test/           # Test files
```

## Community

### Getting Help

- 💬 **Discussions**: Use [GitHub Discussions](https://github.com/vyotiq-ai/Vyotiq-AI/discussions) for questions
- 🐛 **Issues**: Report bugs via [GitHub Issues](https://github.com/vyotiq-ai/Vyotiq-AI/issues)
- 📧 **Email**: For sensitive matters, reach out directly

### Recognition

Contributors are recognized in:
- The README's acknowledgments section
- Release notes for their contributions
- The GitHub contributors page

---

Thank you for contributing to Vyotiq AI! 🎉
