import { defineConfig } from 'vite';
import native from 'vite-plugin-native';

// https://vitejs.dev/config
// Performance optimizations for main process (2026 best practices)
export default defineConfig({
  plugins: [
    native({
      // Native modules that need special handling
      webpack: {
        // These modules contain native .node binaries
        native: ['better-sqlite3', 'node-pty'],
      },
    }),
  ],
  build: {
    // Enable minification for smaller bundle
    minify: 'esbuild',
    // Target modern Node.js for smaller output
    target: 'esnext',
    rollupOptions: {
      // Externalize native modules and packages that depend on them
      // This ensures they're loaded from node_modules at runtime
      external: [
        'node-pty',
        '@homebridge/node-pty-prebuilt-multiarch',
        'better-sqlite3',
        // ONNX Runtime packages
        'onnxruntime-node',
        'onnxruntime-common',
        'onnxruntime-web',
        // Huggingface transformers (contains nested onnxruntime)
        '@huggingface/transformers',
        // Electron internals
        'electron',
      ],
      output: {
        // Use ES modules format for better tree-shaking
        format: 'es',
        // Compact output
        compact: true,
      },
      // Advanced tree shaking
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        annotations: true,
      },
    },
    // Disable source maps in production for smaller bundle
    sourcemap: process.env.NODE_ENV === 'development',
    // Report only essentials
    reportCompressedSize: false,
  },
  // Prevent Vite from trying to transform native modules
  optimizeDeps: {
    exclude: [
      'node-pty',
      '@homebridge/node-pty-prebuilt-multiarch',
      'better-sqlite3',
      'onnxruntime-node',
      'onnxruntime-common',
      'onnxruntime-web',
      '@huggingface/transformers',
    ],
  },
  esbuild: {
    // Remove dead code in production
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    // Modern target
    target: 'esnext',
    // Enable tree shaking
    treeShaking: true,
    // Remove legal comments
    legalComments: 'none',
  },
});
