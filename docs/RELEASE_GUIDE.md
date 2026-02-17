# GitHub Release Publishing Guide

## Overview

This guide explains how to publish Vyotiq AI releases to GitHub. The process is automated using a release script that handles versioning, validation, building, and asset uploading.

---

## Prerequisites

Before releasing, ensure:

1. **GitHub Token**: Set `GITHUB_TOKEN` environment variable
   ```bash
   # Linux/macOS
   export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   
   # Windows (PowerShell)
   $env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
   ```
   
   Get token from: https://github.com/settings/tokens/new
   - Scopes: `repo`, `workflow`
   - Expiration: 90 days (recommended)

2. **Git Setup**: Repository must have `origin` remote
   ```bash
   git remote add origin https://github.com/vyotiq-ai/Vyotiq-AI.git
   ```

3. **Version Updated**: Update `package.json` version
   ```json
   {
     "version": "1.8.0"
   }
   ```

4. **Release Notes**: Create `/docs/RELEASE_NOTES_v1.8.0.md`

5. **Changelog Updated**: Add entry to `CHANGELOG.md`

6. **Git Tag Created**: Create version tag
   ```bash
   git tag v1.8.0
   git push origin v1.8.0
   ```

---

## Release Process

### Quick Release (Recommended)

For a production release with all checks:

```bash
npm run release -- --version 1.8.0 --publish
```

This will:
1. Validate version in package.json
2. Check git tag exists
3. Verify release notes and changelog
4. Build Rust backend
5. Build Electron app
6. Create GitHub release
7. Upload all artifacts

### Release Modes

#### Draft Release
```bash
npm run release -- --version 1.8.0 --draft
```
- Release appears in GitHub but not in main releases
- Edit manually before publishing
- Good for testing or previewing

#### Pre-release
```bash
npm run release -- --version 1.8.0 --prerelease
```
- Marked as "Pre-release" on GitHub
- Not recommended for regular users
- Useful for beta, rc, alpha versions

#### Production Release
```bash
npm run release -- --version 1.8.0 --publish
```
- Full validation and build
- Published immediately
- Recommended for stable releases

---

## Advanced Options

### Dry Run (Safety Check)
```bash
npm run release -- --version 1.8.0 --publish --dry-run
```
Shows what would happen without making changes.

### Skip Build
```bash
npm run release -- --version 1.8.0 --publish --skip-build
```
Re-release without rebuilding. Useful when build artifacts already exist.

### Skip Validation
```bash
npm run release -- --version 1.8.0 --publish --skip-validation
```
Bypass version checks (use with caution).

### Debug Mode
```bash
DEBUG=1 npm run release -- --version 1.8.0 --publish
```
Show additional debug information.

---

## Step-by-Step Release Guide

### 1. Prepare Release

Update version in `package.json`:
```json
{
  "version": "1.8.0"
}
```

### 2. Update Changelog

Add entry to `CHANGELOG.md`:
```markdown
## [1.8.0] - 2026-02-17

### Added
- Feature 1
- Feature 2

### Changed
- Change 1
- Change 2

### Fixed
- Bug fix 1
- Bug fix 2
```

### 3. Create Release Notes

Create `/docs/RELEASE_NOTES_v1.8.0.md`:
```markdown
# Vyotiq AI v1.8.0

**Release Date:** 2026-02-17

## Highlights
- Key feature 1
- Key feature 2

## New Features
...

## Bug Fixes
...
```

### 4. Commit Changes

```bash
git add package.json CHANGELOG.md docs/RELEASE_NOTES_v1.8.0.md
git commit -m "chore: prepare release v1.8.0"
git push origin main
```

### 5. Create Git Tag

```bash
git tag v1.8.0
git push origin v1.8.0
```

### 6. Set GitHub Token

```bash
export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 7. Run Release Script

```bash
npm run release -- --version 1.8.0 --publish
```

Follow the interactive prompts.

### 8. Verify Release

Check GitHub Releases: https://github.com/vyotiq-ai/Vyotiq-AI/releases

---

## Build Artifacts

The release script looks for build artifacts in these directories:

```
.vite/build/          # Vite build output
out/                  # Electron Forge output
dist/                 # Distribution folder
```

### Expected Artifacts

For a complete release, you should have:

- **Windows**: 
  - `Vyotiq AI 1.8.0 Setup.exe`
  - `Vyotiq AI 1.8.0.msi`
  
- **macOS**:
  - `Vyotiq AI 1.8.0.dmg`
  - `Vyotiq AI 1.8.0.zip` (portable)
  
- **Linux**:
  - `vyotiq-ai-1.8.0.deb`
  - `vyotiq-ai-1.8.0.rpm`
  - `Vyotiq AI 1.8.0.AppImage`

To build these, run:

```bash
npm run build:all
npm run make
```

---

## Environment Setup

### GitHub Token

Get token from https://github.com/settings/tokens/new

Required scopes:
- `repo` - Full repository access
- `workflow` - Actions access

Store securely:

```bash
# Linux/macOS
echo "export GITHUB_TOKEN=your_token_here" >> ~/.bashrc
source ~/.bashrc

# Windows (Permanent)
setx GITHUB_TOKEN "your_token_here"
```

### Release Checklist

Before publishing, verify:

- [ ] `package.json` version updated
- [ ] `CHANGELOG.md` has entry
- [ ] `/docs/RELEASE_NOTES_v*.md` created
- [ ] Git tag v*.*.* created and pushed
- [ ] `GITHUB_TOKEN` exported
- [ ] No uncommitted changes (`git status`)
- [ ] Build succeeds locally (`npm run make`)
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)

---

## Troubleshooting

### Error: GITHUB_TOKEN not set

Set the environment variable:
```bash
export GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Error: Git tag not found

Create and push the tag:
```bash
git tag v1.8.0
git push origin v1.8.0
```

### Error: Version mismatch

Update `package.json` to match release version:
```json
{
  "version": "1.8.0"
}
```

### Error: Release notes not found

Create release notes file:
```bash
touch docs/RELEASE_NOTES_v1.8.0.md
# Add content to file
```

### Build fails

Ensure build requirements are met:
```bash
npm install              # Install dependencies
npm run rust:build       # Build Rust backend
npm run make             # Create installers
```

### GitHub API error

Check rate limiting:
```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

Rate limit: 5000 requests/hour per token

### Upload fails

Ensure artifacts exist:
```bash
ls -la out/                    # Check output directory
npm run make                   # Rebuild if needed
```

---

## Automated Release (CI/CD)

For automated releases via GitHub Actions, use the workflow file:

```yaml
# .github/workflows/release.yml
name: Publish Release

on:
  push:
    tags:
      - v*.*.*

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Publish release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run release -- --version ${GITHUB_REF#refs/tags/v} --publish
```

---

## Release Notes Template

Use this template for consistent release notes:

```markdown
# Vyotiq AI vX.Y.Z

**Release Date:** YYYY-MM-DD  
**Status:** [Production Ready|Beta|Alpha]

## Executive Summary

One paragraph overview of the release.

## ✨ Major Features

### Feature 1

Description...

### Feature 2

Description...

## 🐛 Bug Fixes

- Fix 1
- Fix 2

## 📈 Performance

- Improvement 1
- Improvement 2

## 🔒 Security

- Fix 1
- Fix 2

## 📦 Dependencies

- Updated package X to v1.0
- Added package Y v2.0

## 🙏 Credits

Thanks to contributors...

## 📞 Support

- Issues: https://github.com/vyotiq-ai/Vyotiq-AI/issues
- Discussions: https://github.com/vyotiq-ai/Vyotiq-AI/discussions
```

---

## Post-Release Tasks

After successful release:

1. **Announce Release**
   - Post on GitHub Discussions
   - Update project website
   - Social media if applicable

2. **Update Documentation**
   - Update README version references
   - Update installation instructions
   - Add release notes to site

3. **Tag Release in Discord/Slack**
   - Notify team members
   - Link to release notes

4. **Monitor Issues**
   - Watch for bug reports
   - Plan hotfix if needed

---

## Quick Commands Reference

```bash
# Check current version
jq .version package.json

# Update version
npm version minor

# Preview release
npm run release -- --version 1.8.0 --dry-run

# Create draft release
npm run release -- --version 1.8.0 --draft

# Publish beta
npm run release -- --version 1.8.0 --prerelease

# Full production release
npm run release -- --version 1.8.0 --publish

# Check GitHub token
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user

# List releases
gh release list

# Download release
gh release download v1.8.0
```

---

## Related Documentation

- [Changelog Format](../CHANGELOG.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Build Instructions](./DEVELOPMENT.md)
- [GitHub CLI Reference](https://cli.github.com/manual/)

---

**Last Updated:** February 17, 2026  
**Maintained by:** Vyotiq AI Team
