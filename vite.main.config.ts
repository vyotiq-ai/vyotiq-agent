import { defineConfig } from 'vite';
import native from 'vite-plugin-native';

// https://vitejs.dev/config
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
      ],
    },
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
});
