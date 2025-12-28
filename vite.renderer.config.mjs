import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
// Performance optimizations based on 2025 best practices
export default defineConfig({
  plugins: [
    react({
      // Enable React compiler/fast refresh optimizations
      fastRefresh: true,
      // Exclude large dependencies from transformation
      exclude: /node_modules/,
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    // Pre-bundle these dependencies for faster startup
    include: [
      'monaco-editor',
      'react',
      'react-dom',
      'lucide-react',
      'clsx',
      'highlight.js',
      // xterm needs pre-bundling for proper CJS → ESM interop
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-search',
      '@xterm/addon-web-links',
      '@xterm/addon-clipboard',
      '@xterm/addon-unicode11',
    ],
    // Force optimization even in dev mode for consistent performance
    force: false,
    // Use esbuild for faster dep optimization
    esbuildOptions: {
      target: 'esnext',
      // Enable tree shaking for deps
      treeShaking: true,
    },
  },
  build: {
    // Modern browser targets for smaller bundles
    target: 'esnext',
    // Increase chunk size warning limit (Monaco is large)
    chunkSizeWarningLimit: 1500,
    // Enable minification
    minify: 'esbuild',
    // Disable gzip size reporting for faster builds
    reportCompressedSize: false,
    // Source maps only for production debugging
    sourcemap: false,
    rollupOptions: {
      output: {
        // Optimized chunking strategy
        manualChunks: {
          // Isolate Monaco Editor (largest dependency)
          'monaco-editor': ['monaco-editor', '@monaco-editor/react'],
          // Group React ecosystem
          'react-vendor': ['react', 'react-dom'],
          // Terminal components
          'terminal': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-web-links'],
          // UI utilities
          'ui-utils': ['lucide-react', 'clsx', 'highlight.js', 'katex'],
        },
        // Use hashed filenames for better caching
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
      },
      // Tree shake unused exports
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
  },
  // Disable full page reload on CSS changes for smoother dev experience
  css: {
    devSourcemap: false,
  },
  // Performance hints
  esbuild: {
    // Remove console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Modern JavaScript for smaller output
    target: 'esnext',
    // Enable tree shaking
    treeShaking: true,
  },
  // Server optimizations for dev mode
  server: {
    // Warm up frequently used modules
    warmup: {
      clientFiles: [
        './src/renderer/App.tsx',
        './src/renderer/state/AgentProvider.tsx',
        './src/renderer/features/chat/ChatArea.tsx',
      ],
    },
  },
});
