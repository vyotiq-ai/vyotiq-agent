#!/usr/bin/env node
/**
 * Download HuggingFace Models Script
 * 
 * Pre-downloads embedding models during npm install or manually.
 * This ensures the model is available when the app starts.
 * 
 * Usage:
 *   node scripts/download-models.mjs
 *   npm run download-models
 */

import { pipeline } from '@huggingface/transformers';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Models to download
const MODELS = [
  {
    task: 'feature-extraction',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'fp32',
    description: 'Embedding model for semantic search',
  },
];

/**
 * Check if a model is already cached
 */
function isModelCached(modelId) {
  // Default transformers.js cache location
  const cacheLocations = [
    join(__dirname, '..', 'node_modules', '@huggingface', 'transformers', '.cache', modelId),
    join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'huggingface', 'hub', `models--${modelId.replace('/', '--')}`),
  ];
  
  for (const location of cacheLocations) {
    if (existsSync(location)) {
      return true;
    }
  }
  return false;
}

/**
 * Download a model with progress
 */
async function downloadModel(config) {
  const { task, modelId, dtype, description } = config;
  
  console.log(`\n📦 ${description}`);
  console.log(`   Model: ${modelId}`);
  console.log(`   Task: ${task}`);
  console.log(`   Dtype: ${dtype}`);
  
  // Check if already cached
  if (isModelCached(modelId)) {
    console.log('   ✅ Model already cached');
    return true;
  }
  
  console.log('   ⬇️  Downloading...');
  
  let lastProgress = 0;
  let currentFile = '';
  
  try {
    const progressCallback = (data) => {
      if (data.status === 'progress' && typeof data.progress === 'number') {
        const progress = Math.round(data.progress);
        if (progress !== lastProgress || data.file !== currentFile) {
          lastProgress = progress;
          currentFile = data.file || '';
          
          // Create progress bar
          const barWidth = 30;
          const filled = Math.round((progress / 100) * barWidth);
          const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
          
          process.stdout.write(`\r   [${bar}] ${progress}% ${data.file || ''}`);
        }
      } else if (data.status === 'done') {
        process.stdout.write('\n');
        console.log(`   ✅ Downloaded: ${data.file || 'file'}`);
      }
    };
    
    // Create the pipeline (this downloads the model)
    // Use device: 'cpu' for Node.js environment to ensure onnxruntime-node is used
    await pipeline(task, modelId, {
      dtype,
      device: 'cpu',
      progress_callback: progressCallback,
    });
    
    console.log('   ✅ Model ready');
    return true;
  } catch (error) {
    console.error(`\n   ❌ Failed to download: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        Vyotiq AI - Model Download Script           ║');
  console.log('╚════════════════════════════════════════════════════╝');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const model of MODELS) {
    const success = await downloadModel(model);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\n────────────────────────────────────────────────────');
  console.log(`✅ Downloaded: ${successCount} | ❌ Failed: ${failCount}`);
  
  if (failCount > 0) {
    console.log('\n⚠️  Some models failed to download.');
    console.log('   They will be downloaded on first app launch.');
    // Don't fail the install, just warn
  }
  
  console.log('');
}

main().catch(console.error);
