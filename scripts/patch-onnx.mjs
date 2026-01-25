/**
 * Patch ONNX Runtime trace.js for Electron compatibility
 * 
 * This script patches the onnxruntime-common trace.js file to add null checks
 * that prevent "Cannot read properties of null (reading 'trace')" errors in Electron.
 * 
 * Run this after npm install to ensure ONNX Runtime works correctly.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Find all trace.js files in onnxruntime-common packages
function findTraceFiles(dir, results = []) {
  if (!existsSync(dir)) return results;
  
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip certain directories
      if (entry.name === '.git' || entry.name === 'src') continue;
      findTraceFiles(fullPath, results);
    } else if (entry.name === 'trace.js' && fullPath.includes('onnxruntime-common')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

function patchTraceFile(filePath) {
  console.log(`Checking: ${filePath}`);
  
  let content = readFileSync(filePath, 'utf-8');
  
  // Check if already patched with V2 patch (fully safe version)
  if (content.includes('// PATCHED FOR ELECTRON V2')) {
    console.log('  Already patched (V2), skipping.');
    return false;
  }
  
  // Remove old partial patches and apply complete fix
  // The issue is that the ternary condition accesses env.wasm.trace when env.wasm could be null
  
  let patched = false;
  
  // For CJS format - completely rewrite the trace functions to be fully null-safe
  if (content.includes('env_impl_js_1')) {
    // Replace the entire TRACE function
    content = content.replace(
      /const TRACE = \(deviceType, label\) => \{[^}]+\};/gs,
      `const TRACE = (deviceType, label) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    const env = env_impl_js_1.env;
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    console.timeStamp(\`\${deviceType}::ORT::\${label}\`);
};`
    );
    
    // Replace TRACE_FUNC_BEGIN
    content = content.replace(
      /const TRACE_FUNC_BEGIN = \(extraMsg\) => \{[^}]+\};/gs,
      `const TRACE_FUNC_BEGIN = (extraMsg) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    const env = env_impl_js_1.env;
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    TRACE_FUNC('BEGIN', extraMsg);
};`
    );
    
    // Replace TRACE_FUNC_END
    content = content.replace(
      /const TRACE_FUNC_END = \(extraMsg\) => \{[^}]+\};/gs,
      `const TRACE_FUNC_END = (extraMsg) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    const env = env_impl_js_1.env;
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    TRACE_FUNC('END', extraMsg);
};`
    );
    patched = true;
  }
  
  // For ESM format
  if (content.includes('export const TRACE')) {
    content = content.replace(
      /export const TRACE = \(deviceType, label\) => \{[^}]+\};/gs,
      `export const TRACE = (deviceType, label) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    console.timeStamp(\`\${deviceType}::ORT::\${label}\`);
};`
    );
    
    content = content.replace(
      /export const TRACE_FUNC_BEGIN = \(extraMsg\) => \{[^}]+\};/gs,
      `export const TRACE_FUNC_BEGIN = (extraMsg) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    TRACE_FUNC('BEGIN', extraMsg);
};`
    );
    
    content = content.replace(
      /export const TRACE_FUNC_END = \(extraMsg\) => \{[^}]+\};/gs,
      `export const TRACE_FUNC_END = (extraMsg) => {
    // PATCHED FOR ELECTRON V2: Full null safety
    if (!env) return;
    const traceEnabled = env.trace ?? env.wasm?.trace ?? false;
    if (!traceEnabled) return;
    TRACE_FUNC('END', extraMsg);
};`
    );
    patched = true;
  }
  
  if (patched) {
    writeFileSync(filePath, content, 'utf-8');
    console.log('  Patched with V2 (full null safety).');
    return true;
  }
  
  console.log('  No patterns matched.');
  return false;
}

// Main execution
console.log('Patching ONNX Runtime trace.js for Electron compatibility...\n');

const nodeModules = join(projectRoot, 'node_modules');
const traceFiles = findTraceFiles(nodeModules);

console.log(`Found ${traceFiles.length} trace.js file(s):\n`);

let patchedCount = 0;
for (const file of traceFiles) {
  if (patchTraceFile(file)) {
    patchedCount++;
  }
}

console.log(`\nDone! Patched ${patchedCount} file(s).`);
