/**
 * Patches @electron/node-gyp to recognize Visual Studio 2025 (version 18),
 * and disables Spectre mitigation requirement in node-pty (not available for all VS versions).
 * Run automatically via npm postinstall, or manually: node scripts/patch-node-gyp-vs2025.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// === Patch 1: @electron/node-gyp VS 2025 support ===
const gypFilePath = join(__dirname, '..', 'node_modules', '@electron', 'node-gyp', 'lib', 'find-visualstudio.js');

if (existsSync(gypFilePath)) {
  let content = readFileSync(gypFilePath, 'utf8');
  let patched = false;

  // 1. Add version 18 → 2025 mapping in getVersionInfo
  if (!content.includes('versionMajor === 18')) {
    content = content.replace(
      /if \(ret\.versionMajor === 17\) \{\s*\n\s*ret\.versionYear = 2022\s*\n\s*return ret\s*\n\s*\}/,
      (match) => match + `\n    if (ret.versionMajor === 18) {\n      ret.versionYear = 2025\n      return ret\n    }`
    );
    patched = true;
  }

  // 2. Add 2025 to supportedYears arrays ([2019, 2022] → [2019, 2022, 2025])
  if (!content.includes('2019, 2022, 2025')) {
    content = content.replaceAll('[2019, 2022]', '[2019, 2022, 2025]');
    patched = true;
  }

  // 3. Add v145 toolset for VS 2025
  if (!content.includes("versionYear === 2025")) {
    content = content.replace(
      /else if \(versionYear === 2022\) \{\s*\n\s*return 'v143'\s*\n\s*\}/,
      (match) => match + ` else if (versionYear === 2025) {\n      return 'v145'\n    }`
    );
    patched = true;
  }

  if (patched) {
    writeFileSync(gypFilePath, content, 'utf8');
    console.log('[patch-vs2025] Patched @electron/node-gyp to support Visual Studio 2025.');
  } else {
    console.log('[patch-vs2025] @electron/node-gyp already supports VS 2025.');
  }
} else {
  console.log('[patch-vs2025] @electron/node-gyp not found, skipping.');
}

// === Patch 2: Disable Spectre mitigation in node-pty ===
const spectrePaths = [
  join(__dirname, '..', 'node_modules', 'node-pty', 'binding.gyp'),
  join(__dirname, '..', 'node_modules', 'node-pty', 'deps', 'winpty', 'src', 'winpty.gyp'),
];

for (const gypPath of spectrePaths) {
  if (existsSync(gypPath)) {
    let content = readFileSync(gypPath, 'utf8');
    if (content.includes("'SpectreMitigation': 'Spectre'")) {
      content = content.replaceAll("'SpectreMitigation': 'Spectre'", "'SpectreMitigation': 'false'");
      writeFileSync(gypPath, content, 'utf8');
      console.log(`[patch-vs2025] Disabled Spectre mitigation in ${gypPath.split(/[\\/]/).pop()}.`);
    }
  }
}
