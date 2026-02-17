# Vyotiq AI - Release & Commit Prompt Template

> **Copy this entire prompt below the line and give it to Copilot when you're ready to commit, version bump, and release.**

---

## 📋 RELEASE PROMPT

```
I need you to help me prepare a complete release for Vyotiq AI. Perform the following tasks in order:

## 1. ANALYZE CHANGES
First, analyze all changes since the last release:
- Run `git diff v1.8.0..HEAD --stat` to see changed files
- Run `git log v1.8.0..HEAD --oneline` to see commits
- Identify all modified, added, and deleted files
- Categorize changes by type (features, fixes, docs, refactors, etc.)

## 2. DETERMINE VERSION BUMP
Based on Semantic Versioning (semver.org):
- **MAJOR** (X.0.0): Breaking API changes, incompatible updates
- **MINOR** (1.X.0): New features, backward-compatible additions
- **PATCH** (1.3.X): Bug fixes, minor improvements, documentation

Tell me what the new version should be and why.

## 3. CREATE/UPDATE CHANGELOG
Create or update `CHANGELOG.md` following Keep a Changelog format (keepachangelog.com):

```markdown
# Changelog

All notable changes to Vyotiq AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [X.X.X] - YYYY-MM-DD

### Added
- New features (use `feat` commits)

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes (use `fix` commits)

### Security
- Vulnerability fixes

[Unreleased]: https://github.com/vyotiq-ai/vyotiq-agent/compare/vX.X.X...HEAD
[X.X.X]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.8.0...vX.X.X
```

## 4. UPDATE VERSION IN FILES
Update version number in these files:
- `package.json` → `"version": "X.X.X"`
- `README.md` → Update badges if version numbers are mentioned
- Any other files containing version references

## 5. UPDATE DOCUMENTATION
Review and update if needed:
- `README.md` - Ensure "Recent Updates" section reflects new changes
- `docs/ARCHITECTURE.md` - If architecture changed
- `docs/DEVELOPMENT.md` - If development workflow changed
- `docs/API.md` - If APIs changed
- `docs/TROUBLESHOOTING.md` - If new issues/solutions discovered
- `CONTRIBUTING.md` - If contribution guidelines changed

## 6. CREATE DETAILED COMMIT MESSAGE
Use Conventional Commits format with comprehensive body:

```
<type>(<scope>): <short summary in imperative mood> (vX.X.X)

<BLANK LINE>
## Summary
<2-3 sentence overview of this release>

## Changes

### Added
- <feature 1>
- <feature 2>

### Changed
- <change 1>
- <change 2>

### Fixed
- <fix 1>
- <fix 2>

### Technical Details
- <implementation detail 1>
- <implementation detail 2>

## Breaking Changes
<List any breaking changes or "None">

## Migration Guide
<If breaking changes, explain how to migrate>

Refs: #<issue numbers if applicable>
Release: vX.X.X
```

**Commit Types:**
- `feat`: New feature (MINOR version bump)
- `fix`: Bug fix (PATCH version bump)
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `build`: Build system changes
- `ci`: CI configuration changes

**Scopes for Vyotiq AI:**
- `agent` - Agent orchestrator, run executor
- `tools` - Tool system, implementations
- `editor` - File handling, inline viewers
- `terminal` - Terminal, pty integration
- `browser` - Browser automation, Playwright
- `mcp` - Model Context Protocol
- `search` - Full-text search, indexing
- `providers` - LLM providers
- `lsp` - Language Server Protocol
- `settings` - Settings, configuration
- `ui` - React components, styling
- `ipc` - IPC handlers
- `git` - Git integration

## 7. GIT COMMANDS TO EXECUTE

After all updates are made, run these commands:

\`\`\`bash
# Stage all changes
git add -A

# Commit with the detailed message
git commit -m "<commit message>"

# Create annotated tag
git tag -a vX.X.X -m "Release vX.X.X - <short description>"

# Push commit and tags
git push origin main
git push origin vX.X.X
\`\`\`

## 8. CREATE GITHUB RELEASE

**IMPORTANT:** Pushing a tag does NOT create a GitHub Release automatically. You must explicitly create the release using GitHub CLI or the web interface.

### Option A: Using GitHub CLI (Recommended)

```bash
# Create release with notes (replace X.X.X with actual version)
gh release create vX.X.X --title "vX.X.X - <short description>" --notes "<release notes>"

# Or create release from a file
gh release create vX.X.X --title "vX.X.X - <short description>" --notes-file RELEASE_NOTES.md

# Or open interactive editor
gh release create vX.X.X --title "vX.X.X - <short description>"
```

### Option B: Using GitHub Web Interface

1. Go to <https://github.com/vyotiq-ai/vyotiq-agent/releases/new>
2. Select the tag you just pushed (vX.X.X)
3. Fill in the release title and notes
4. Click "Publish release"

### Release Notes Template

```markdown
# Vyotiq AI vX.X.X

**Release Date:** YYYY-MM-DD

## 🎯 Highlights
<3-5 bullet points of the most important changes>

## ✨ New Features
<Detailed list of new features with descriptions>

## 🐛 Bug Fixes
<List of bugs fixed>

## 🔧 Improvements
<Performance, UX, developer experience improvements>

## 📚 Documentation
<Documentation updates>

## ⚠️ Breaking Changes
<Any breaking changes with migration instructions>

## 🔒 Security
<Security fixes if any>

## 📦 Dependencies
<Major dependency updates>

## 🙏 Acknowledgments
<Thank contributors if applicable>

---

**Full Changelog:** https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.8.0...vX.X.X

## Installation

### From Release
Download the appropriate installer for your platform from the assets below.

### From Source
\`\`\`bash
git clone https://github.com/vyotiq-ai/Vyotiq-AI.git
cd Vyotiq-AI
npm install
npm start
\`\`\`

## System Requirements
- Node.js 20.x or higher
- Windows 10/11, macOS 12+, or Linux (Ubuntu 20.04+)
- 8GB RAM recommended
- 500MB disk space
```

## 9. POST-RELEASE CHECKLIST
After the release, verify:
- [ ] Tag appears on GitHub (check: `git ls-remote --tags origin`)
- [ ] **GitHub Release is published** (NOT just the tag - verify at /releases page)
- [ ] Release shows as "Latest" on the repository page
- [ ] CHANGELOG.md is up to date
- [ ] package.json version is correct
- [ ] All documentation is current
- [ ] No broken links in docs
- [ ] CI/CD pipelines passed (if applicable)

### Quick Verification Commands
```bash
# Verify tag was pushed
git ls-remote --tags origin | grep vX.X.X

# Verify release exists (requires gh CLI)
gh release view vX.X.X

# List all releases
gh release list
```

---

## ⚠️ COMMON MISTAKES TO AVOID

1. **Pushing tag without creating release**: `git push origin vX.X.X` only pushes the tag. You MUST also run `gh release create vX.X.X` to create the actual GitHub Release.

2. **Forgetting to update RELEASE_PROMPT.md**: After each release, update the version references in this file so the next release compares against the correct version.

3. **Not staging all files**: Use `git add -A` to ensure all changes are staged, then verify with `git status`.

4. **Missing CHANGELOG.md**: Always create/update CHANGELOG.md before releasing.

5. **Wrong comparison base**: Ensure `git diff` and `git log` commands reference the correct previous version tag.

---

## CONTEXT ABOUT CURRENT STATE

**Current Version:** 1.8.0
**Repository:** https://github.com/vyotiq-ai/vyotiq-agent
**Last Release Tag:** v1.8.0

**Project Stack:**
- Electron 39.2 + React 19.2 + TypeScript 5.9
- Tailwind CSS 4.1
- Playwright for browser automation
- SQLite for persistence

**Key Files to Check:**
- `package.json` - Version field
- `README.md` - Badges, recent updates
- `CHANGELOG.md` - Create if missing
- `docs/*.md` - All documentation

Now analyze the changes and proceed with the release!
```text

---

## 📝 QUICK COMMIT PROMPTS (For Day-to-Day)

### Simple Feature Commit
```
Create a conventional commit for the new feature I just implemented.
Analyze the staged changes and generate a proper commit message.
```

### Bug Fix Commit
```
Create a conventional commit for this bug fix.
Include the root cause, solution, and any side effects.
```

### Documentation Update
```
Create a commit for my documentation updates.
Summarize what was added/changed/removed.
```

### Refactoring Commit
```
Create a commit for this refactoring.
Explain what was refactored and why, without changing functionality.
```

---

## 🔄 VERSION BUMP QUICK REFERENCE

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking API change | MAJOR | 1.3.0 → 2.0.0 |
| New feature (backward compatible) | MINOR | 1.3.0 → 1.4.0 |
| Bug fix | PATCH | 1.3.0 → 1.3.1 |
| Documentation only | PATCH | 1.3.0 → 1.3.1 |
| Performance improvement | PATCH/MINOR | Depends on scope |
| Security fix | PATCH | 1.3.0 → 1.3.1 |
| Dependency update (no breaking) | PATCH | 1.3.0 → 1.3.1 |
| Dependency update (breaking) | MAJOR | 1.3.0 → 2.0.0 |

---

## 📌 BEST PRACTICES (2026)

### Conventional Commits
1. **Imperative mood**: "add feature" not "added feature"
2. **Lowercase type**: `feat:` not `FEAT:`
3. **No period at end of subject line**
4. **Limit subject to 50 characters**
5. **Wrap body at 72 characters**
6. **Use body to explain what and why, not how**

### Semantic Versioning
1. **Never modify a released version** - always create new version
2. **Use pre-release labels** for testing: `2.0.0-alpha.1`, `2.0.0-beta.1`, `2.0.0-rc.1`
3. **Document breaking changes** prominently
4. **Provide migration guides** for major versions

### Keep a Changelog
1. **Human-readable** - not a git log dump
2. **Reverse chronological** - newest first
3. **Group by type** - Added, Changed, Fixed, etc.
4. **Include dates** in ISO format (YYYY-MM-DD)
5. **Link versions** to GitHub compare URLs

### GitHub Releases
1. **Use annotated tags** (`git tag -a`)
2. **Include assets** (installers, binaries) when applicable
3. **Write for end users** - not just developers
4. **Highlight breaking changes** at the top
5. **Thank contributors** by username

---

## 🚀 AUTOMATION TIP

Consider adding these scripts to `package.json`:

```json
{
  "scripts": {
    "version:patch": "npm version patch -m 'chore(release): v%s'",
    "version:minor": "npm version minor -m 'chore(release): v%s'",
    "version:major": "npm version major -m 'chore(release): v%s'",
    "release": "npm run version:patch && git push && git push --tags"
  }
}
```

---