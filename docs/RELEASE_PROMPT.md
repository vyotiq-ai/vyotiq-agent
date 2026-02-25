# Vyotiq AI - Release & Commit Prompt Template

> **Copy this entire prompt below the line and give it to Copilot when you're ready to commit, version bump, and release.**

---

## 📋 RELEASE PROMPT

```
I need you to help me prepare a complete release for Vyotiq AI. Perform the following tasks in order to ensure a smooth and well-documented release process. Follow each step carefully and provide detailed outputs where applicable.

## 1. ANALYZE CHANGES
First, analyze all changes since the last release:
- Run `git diff v1.11.0..HEAD --stat` to see changed files
- Run `git log v1.11.0..HEAD --oneline` to see commits
- Identify all modified, added, and deleted files
- Categorize changes by type (features, fixes, docs, refactors, etc.)
- Note any breaking changes or important updates
- Summarize the overall scope and impact of the changes
- Identify any critical issues that should be highlighted in the release notes
- Determine if any changes require special attention (e.g., security fixes, performance improvements)
- Check if any dependencies were updated and if they introduce breaking changes
- Review commit messages for clarity and adherence to Conventional Commits format
- Assess if the changes align with the project's roadmap and goals
- Consider the potential impact on users and how to communicate it effectively in the release notes
- Ensure that all changes are properly documented in the codebase and that any necessary documentation updates are included in the release
- Verify that all tests pass and that there are no critical bugs before proceeding with the release
```

NOTE: Exclude any unnecessary files and documents to commit&release on GitHub (e.g., local config files, logs, etc.).

## 2. DETERMINE VERSION BUMP
Based on Semantic Versioning (semver.org):
- **MAJOR** (X.0.0): Breaking API changes, incompatible updates
- **MINOR** (1.X.0): New features, backward-compatible additions
- **PATCH** (1.3.X): Bug fixes, minor improvements, documentation
- **PRE-RELEASE** (1.3.0-alpha.1): Unstable, testing versions
- **NO BUMP**: Code style changes, refactors, tests, chores
- **DEPENDENCY UPDATE**: Depends on whether it introduces breaking changes or not
- **SECURITY FIX**: Always at least a PATCH, even if no code changes (document in release notes)
- **PERFORMANCE IMPROVEMENT**: Depends on scope - if it significantly improves performance, consider MINOR; otherwise PATCH
- **DOCUMENTATION ONLY**: PATCH (since it doesn't affect code but is still a change)
- **OTHER NON-CODE CHANGES**: None (e.g., updating README badges, CI config without code changes)
- **MULTIPLE CHANGE TYPES**: If there are multiple types of changes, the version bump should reflect the most significant change (e.g., if there are both features and fixes, it should be a MINOR bump)
- **PRE-RELEASES**: If the release is not ready for production, use pre-release labels like `-alpha`, `-beta`, or `-rc` to indicate its status (e.g., `1.3.0-alpha.1`)
- **BREAKING CHANGES**: If there are breaking changes, they must be clearly documented in the release notes with migration instructions. This should trigger a MAJOR version bump.

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
[X.X.X]: https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.11.0...vX.X.X
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

## 📖 Full Changelog
<Link to full changelog comparing this version to the previous one>

## Installation
<Instructions for installing the new version>

## Additional Notes
<Any additional information about the release>

## Links
- [GitHub Repository](https://github.com/vyotiq-ai/vyotiq-agent)

## Resources
- [Documentation](https://vyotiq-ai.github.io/vyotiq-agent/)
- [Support](https://github.com/vyotiq-ai/vyotiq-agent/issues)
- [Contributing](https://github.com/vyotiq-ai/vyotiq-agent/blob/main/CONTRIBUTING.md)
- [Changelog](https://github.com/vyotiq-ai/vyotiq-agent/blob/main/CHANGELOG.md)
- [License](https://github.com/vyotiq-ai/vyotiq-agent/blob/main/LICENSE)
- [Contact](mailto:support@vyotiq.ai)

---

**Full Changelog:** https://github.com/vyotiq-ai/vyotiq-agent/compare/v1.11.0...vX.X.X

## Installation

### From Release
Download the appropriate installer for your platform from the assets below. Follow the installation instructions provided in the README.
- [Windows Installer](#)
- [macOS Installer](#)
- [Linux AppImage](#)
- [Source Code](#)

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
- Internet connection for updates and LLM interactions
```

## 9. POST-RELEASE CHECKLIST
After the release, verify:
- [ ] Tag appears on GitHub (check: `git ls-remote --tags origin`)
- [ ] **GitHub Release is published** (NOT just the tag - verify at /releases page)
- [ ] Release notes are accurate and well-formatted
- [ ] Assets (if any) are attached to the release
- [ ] Release is linked to the correct previous version in CHANGELOG.md
- [ ] All links in release notes work correctly
- [ ] Release is announced on social media and relevant channels
- [ ] Contributors are acknowledged in release notes
- [ ] Version number is updated in all necessary files
- [ ] No critical bugs are reported immediately after release (monitor for hotfixes)
- [ ] Release is tagged as "Latest" if it's the most recent stable release
- [ ] CI/CD pipelines show the release as successful (if applicable)
- [ ] Update `RELEASE_PROMPT.md` with the new version for next release
- [ ] Communicate the release to the team and community
- [ ] Monitor for any issues or feedback post-release and be prepared to release hotfixes if necessary
- [ ] Update any relevant documentation or website content to reflect the new release
- [ ] Ensure that the release is properly indexed and discoverable on GitHub and package registries (if applicable)
- [ ] Verify that the release is correctly tagged in version control and that the tag points to the correct commit
- [ ] Check that the release is correctly linked to the corresponding issues and pull requests on GitHub
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

6. **Not following Conventional Commits**: This can lead to unclear commit history and incorrect version bumps.

7. **Not testing the release**: Always test the release locally before pushing to ensure there are no critical issues.

8. **Forgetting to update documentation**: Ensure all relevant documentation is updated to reflect changes in the new release.

9. **Not thanking contributors**: Acknowledge the efforts of contributors in the release notes to foster community engagement.

10. **Not verifying the release**: After pushing, verify that the release is correctly published on GitHub and that all links and references are accurate.

11. **Not using annotated tags**: Always use `git tag -a` to create annotated tags with messages for better traceability.

12. **Not including breaking changes in release notes**: If there are breaking changes, they must be clearly documented in the release notes with migration instructions.

13. **Not updating version in all necessary files**: Ensure that the version number is updated in `package.json`, `README.md`, and any other files that reference the version.

14. **Not using pre-release labels for testing**: If the release is not ready for production, use pre-release labels like `-alpha`, `-beta`, or `-rc` to indicate its status.

15. **Not following semantic versioning**: Ensure that the version bump (MAJOR, MINOR, PATCH) accurately reflects the nature of the changes made.

16. **Not providing a migration guide for breaking changes**: If there are breaking changes, provide clear instructions on how users can migrate to the new version.

17. **Not linking to the full changelog**: Always include a link to the full changelog in the release notes for users who want more details.

18. **Not testing the release process**: Regularly test the release process in a staging environment to catch any issues before they affect users.

19. **Not automating the release process**: Consider using tools like `semantic-release` or GitHub Actions to automate versioning and releases, reducing the chance of human error.

20. **Not communicating the release**: Announce the new release on social media, forums, and other channels to ensure users are aware of the updates.

21. **Not monitoring post-release**: After releasing, monitor for any issues or feedback from users and be prepared to release hotfixes if necessary.

---

## CONTEXT ABOUT CURRENT STATE

**Current Version:** 1.11.0
**Repository:** https://github.com/vyotiq-ai/vyotiq-agent
**Last Release Tag:** v1.11.0

**Project Stack:**
- Electron 39.2 + React 19.2 + TypeScript 5.9
- Tailwind CSS 4.1
- Playwright for browser automation
- SQLite for persistence
- Custom LLM provider integrations
- Modular tool system with dynamic loading
- Advanced file handling with inline viewers
- Full-text search and indexing
- Git integration for version control
- Language Server Protocol (LSP) support
- Comprehensive documentation and contribution guidelines
- Active community engagement and support
- Regular updates and improvements based on user feedback
- Strong focus on performance, reliability, and user experience
- Commitment to open-source principles and transparency
- Continuous integration and automated testing for quality assurance
- Robust error handling and logging for easier debugging
- Cross-platform support for Windows, macOS, and Linux
- Extensive test coverage with unit, integration, and end-to-end tests
- Modular architecture for easy maintenance and extensibility

**Key Files to Check:**
- `package.json` - Version field
- `README.md` - Badges, recent updates
- `CHANGELOG.md` - Create if missing
- `docs/*.md` - All documentation
- `src/**/*` - Source code changes

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

### Chore Commit
```Create a commit for this chore (build, ci, etc.).
Describe the maintenance task performed.
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
| Code style change | None | No version bump |
| Refactor (no behavior change) | None | No version bump |
| Test updates | None | No version bump |
| Chore (build, ci, etc.) | None | No version bump |
| Other non-code changes | None | No version bump |

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