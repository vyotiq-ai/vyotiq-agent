#!/usr/bin/env node

/**
 * Vyotiq AI - GitHub Release Publisher
 * 
 * Automates the process of publishing releases to GitHub.
 * Handles version validation, changelog verification, and asset upload.
 * 
 * Usage:
 *   npm run release -- --version 1.8.0 --draft
 *   npm run release -- --version 1.8.0 --prerelease
 *   npm run release -- --version 1.8.0 --publish
 * 
 * Requirements:
 *   - GITHUB_TOKEN environment variable set
 *   - Git repository remote "origin" configured
 *   - Version tag must exist (e.g., v1.8.0)
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline';
import { pathToFileURL } from 'url';

// Configuration
const CONFIG = {
  owner: 'vyotiq-ai',
  repo: 'vyotiq-agent',
  apiBaseUrl: 'https://api.github.com',
  releaseNotesPath: 'docs/RELEASE_NOTES_v{version}.md',
  changelogPath: 'CHANGELOG.md',
  packageJsonPath: 'package.json',
};

// Logging utilities
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  debug: (msg, data = null) => {
    if (process.env.DEBUG) {
      console.log(`🔍 ${msg}`, data ? JSON.stringify(data, null, 2) : '');
    }
  },
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    version: null,
    draft: false,
    prerelease: false,
    publish: false,
    skipBuild: false,
    skipValidation: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version' && args[i + 1]) {
      options.version = args[i + 1];
      i++;
    } else if (arg === '--draft') {
      options.draft = true;
    } else if (arg === '--prerelease') {
      options.prerelease = true;
    } else if (arg === '--publish') {
      options.publish = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--skip-validation') {
      options.skipValidation = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

// Validate environment and prerequisites
async function validateEnvironment(options) {
  logger.info('Validating release environment...');

  // Check GITHUB_TOKEN
  if (!process.env.GITHUB_TOKEN && !options.dryRun) {
    throw new Error('GITHUB_TOKEN environment variable not set. Export it from GitHub settings.');
  }

  // Check version
  if (!options.version) {
    throw new Error('Version is required. Use --version X.Y.Z');
  }

  // Validate version format
  if (!/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new Error(`Invalid version format: ${options.version}. Expected: X.Y.Z`);
  }

  // Check git repo
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    throw new Error('Not a git repository. Navigate to project root.');
  }

  // Check origin remote
  try {
    execSync('git remote get-url origin', { stdio: 'pipe' });
  } catch {
    throw new Error('No "origin" remote configured. Run: git remote add origin <url>');
  }

  logger.success('Environment validated');
}

// Read and parse JSON file
async function readJSON(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

// Validate version matches package.json
async function validateVersion(version) {
  logger.info(`Validating version ${version}...`);

  const packageJson = await readJSON(CONFIG.packageJsonPath);
  if (packageJson.version !== version) {
    throw new Error(
      `Version mismatch: package.json has ${packageJson.version} but release is ${version}. ` +
      `Update package.json before releasing.`
    );
  }

  logger.success(`Version ${version} matches package.json`);
}

// Validate release notes exist
async function validateReleaseNotes(version) {
  logger.info(`Validating release notes for v${version}...`);

  const notesPath = CONFIG.releaseNotesPath.replace('{version}', version);
  const fullPath = path.join(process.cwd(), notesPath);

  try {
    await fs.access(fullPath);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (content.length < 200) {
      throw new Error('Release notes too short. Add more details.');
    }

    logger.success(`Release notes validated (${Math.round(content.length / 1024)}KB)`);
    return { path: notesPath, content };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Release notes not found at ${notesPath}`);
    }
    throw err;
  }
}

// Validate changelog entry
async function validateChangelog(version) {
  logger.info(`Validating CHANGELOG.md for v${version}...`);

  const content = await fs.readFile(CONFIG.changelogPath, 'utf-8');
  const versionRegex = new RegExp(`\\[${version}\\]|## \\[${version}\\]`);

  if (!versionRegex.test(content)) {
    throw new Error(
      `Version ${version} not found in CHANGELOG.md. ` +
      `Add an entry before releasing.`
    );
  }

  logger.success('CHANGELOG.md validated');
}

// Validate git tag exists
async function validateGitTag(version) {
  logger.info(`Validating git tag v${version}...`);

  try {
    const refs = execSync('git tag -l', { encoding: 'utf-8' });
    if (!refs.includes(`v${version}`)) {
      throw new Error(`Git tag v${version} not found. Create it with: git tag v${version}`);
    }

    logger.success(`Git tag v${version} exists`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw err;
    }
    throw err;
  }
}

// Run full validation suite
async function runValidation(version, options) {
  if (options.skipValidation) {
    logger.warn('Skipping validation (--skip-validation)');
    return;
  }

  try {
    await validateVersion(version);
    await validateGitTag(version);
    await validateChangelog(version);
    await validateReleaseNotes(version);
    logger.success('All validations passed');
  } catch (err) {
    logger.error(`Validation failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Read release body from notes
async function getReleaseBody(version) {
  const notesPath = CONFIG.releaseNotesPath.replace('{version}', version);
  const fullPath = path.join(process.cwd(), notesPath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    // Extract body (skip title and metadata)
    const lines = content.split('\n');
    const bodyStart = lines.findIndex((line, i) =>
      i > 0 && line.startsWith('## ') || line.startsWith('---')
    );
    return bodyStart > 0 ? lines.slice(bodyStart).join('\n') : content;
  } catch {
    return `Release v${version} of Vyotiq AI. See changelog for details.`;
  }
}

// Create GitHub release via API
async function createGitHubRelease(version, options, releaseBody) {
  const tag = `v${version}`;
  const url = `${CONFIG.apiBaseUrl}/repos/${CONFIG.owner}/${CONFIG.repo}/releases`;

  const payload = {
    tag_name: tag,
    name: `Vyotiq AI ${version}`,
    body: releaseBody,
    draft: options.draft,
    prerelease: options.prerelease,
    generate_release_notes: false,
  };

  logger.info(`Creating GitHub release for tag ${tag}...`);
  logger.debug('Release payload:', payload);

  if (options.dryRun) {
    logger.warn('DRY RUN: Would create release');
    logger.info('Release details:');
    console.log(JSON.stringify(payload, null, 2));
    return { id: 'DRY_RUN', upload_url: 'DRY_RUN' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message || response.statusText}`);
    }

    const release = await response.json();
    logger.success(`Release created: ${release.html_url}`);
    return release;
  } catch (err) {
    logger.error(`Failed to create release: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Upload asset to GitHub release
async function uploadAsset(uploadUrl, assetPath, assetName) {
  const content = await fs.readFile(assetPath);
  const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`);

  logger.info(`Uploading asset: ${assetName}...`);

  if (process.env.DEBUG) {
    logger.debug(`Upload URL: ${url}`);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Upload failed: ${error.message || response.statusText}`);
    }

    const asset = await response.json();
    logger.success(`Asset uploaded: ${asset.name}`);
    return asset;
  } catch (err) {
    logger.error(`Asset upload failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Find build artifacts
async function findBuildArtifacts() {
  logger.info('Finding build artifacts...');

  const artifactDirs = ['.vite/build', 'out', 'dist'];
  const artifacts = [];

  for (const dir of artifactDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(exe|dmg|deb|rpm|zip|msi|AppImage)$/.test(entry.name)) {
          artifacts.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  if (artifacts.length === 0) {
    logger.warn('No build artifacts found. Run `npm run make` to create installers.');
  } else {
    logger.success(`Found ${artifacts.length} artifact(s)`);
    artifacts.forEach(a => logger.debug(`  - ${a}`));
  }

  return artifacts;
}

// Build application
async function buildApplication(options) {
  if (options.skipBuild) {
    logger.warn('Skipping build (--skip-build)');
    return [];
  }

  logger.info('Building application...');

  try {
    if (options.dryRun) {
      logger.warn('DRY RUN: Would build application');
      return [];
    }

    // Clean previous builds
    try {
      execSync('npm run clean', { stdio: 'inherit' });
    } catch {
      // Clean script may not exist
    }

    // Build Rust backend
    logger.info('Building Rust backend...');
    execSync('npm run rust:build', { stdio: 'inherit' });

    // Build Electron app
    logger.info('Building Electron application...');
    execSync('npm run make', { stdio: 'inherit' });

    logger.success('Build completed');
    return findBuildArtifacts();
  } catch (err) {
    logger.error(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// Interactive confirmation
async function confirmAction(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// Main function
async function main() {
  try {
    const options = parseArgs();

    logger.info('Vyotiq AI - GitHub Release Publisher');
    logger.info(`Version: ${options.version || 'auto-detect'}`);
    logger.info(`Mode: ${options.draft ? 'DRAFT' : options.prerelease ? 'PRERELEASE' : 'PRODUCTION'}`);
    logger.info('');

    // Validate environment
    await validateEnvironment(options);

    const version = options.version;

    // Run validation
    await runValidation(version, options);

    // Confirm before proceeding
    if (!options.dryRun) {
      const proceed = await confirmAction(
        `Ready to create release v${version}. Continue?`
      );
      if (!proceed) {
        logger.info('Release cancelled');
        process.exit(0);
      }
    }

    // Build application
    const artifacts = await buildApplication(options);

    // Get release notes
    logger.info('Preparing release notes...');
    const releaseBody = await getReleaseBody(version);

    // Create GitHub release
    const release = await createGitHubRelease(version, options, releaseBody);

    // Upload artifacts
    if (artifacts.length > 0 && release.upload_url && !options.dryRun) {
      logger.info(`Uploading ${artifacts.length} artifact(s)...`);
      for (const artifactPath of artifacts) {
        const assetName = path.basename(artifactPath);
        await uploadAsset(release.upload_url, artifactPath, assetName);
      }
    }

    // Summary
    logger.info('');
    logger.success('Release published successfully!');

    if (!options.dryRun) {
      logger.info(`GitHub Release: ${release.html_url}`);
      logger.info(`Download: https://github.com/${CONFIG.owner}/${CONFIG.repo}/releases/tag/v${version}`);
    }

    if (options.draft) {
      logger.warn('Release is in DRAFT state. Edit on GitHub to publish.');
    } else if (options.prerelease) {
      logger.warn('Release is marked as PRERELEASE. Mark as stable when ready.');
    }
  } catch (err) {
    logger.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      logger.debug('Stack trace:', err.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { main, createGitHubRelease, validateEnvironment };
