import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
// Performance optimizations based on 2026 best practices
export default defineConfig({
  plugins: [
    react({
      // Enable React compiler/fast refresh optimizations
      fastRefresh: true,
      // Exclude large dependencies from transformation
      exclude: /node_modules/,
      // Babel configuration for React Compiler (when available)
      babel: {
        plugins: [
          // Add React Compiler plugin when stable
          // ['babel-plugin-react-compiler', { target: '19' }],
        ],
      },
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
      // Pre-bundle markdown processing for faster first render
      'react-markdown',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
      'rehype-highlight',
    ],
    // Force optimization even in dev mode for consistent performance
    force: false,
    // Use esbuild for faster dep optimization
    esbuildOptions: {
      target: 'esnext',
      // Enable tree shaking for deps
      treeShaking: true,
      // Smaller bundle output
      legalComments: 'none',
    },
  },
  build: {
    // Modern browser targets for smaller bundles
    target: 'esnext',
    // Increase chunk size warning limit (Monaco is large)
    chunkSizeWarningLimit: 1500,
    // Use esbuild for fastest minification
    minify: 'esbuild',
    // Disable gzip size reporting for faster builds
    reportCompressedSize: false,
    // Source maps only for production debugging
    sourcemap: false,
    // Module preload for critical chunks
    modulePreload: {
      polyfill: false, // Modern browsers support it natively
    },
    rollupOptions: {
      output: {
        // Advanced chunking strategy for optimal loading
        manualChunks: (id) => {
          // Isolate Monaco Editor (largest dependency ~3MB)
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco-editor';
          }
          // React core - loaded immediately
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'react-vendor';
          }
          // Terminal components - deferred until needed
          if (id.includes('@xterm/')) {
            return 'terminal';
          }
          // Markdown processing - deferred until chat renders
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
            return 'markdown';
          }
          // Mermaid diagrams - lazy loaded
          if (id.includes('mermaid')) {
            return 'mermaid';
          }
          // UI utilities - commonly used
          if (id.includes('lucide-react') || id.includes('clsx') || id.includes('highlight.js') || id.includes('katex')) {
            return 'ui-utils';
          }
        },
        // Use hashed filenames for better caching
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
        // Compact output format
        compact: true,
        // Ensure dynamic imports work properly
        inlineDynamicImports: false,
      },
      // Advanced tree shaking configuration
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        // Enable pure annotations for better tree shaking
        annotations: true,
        // Prune unreachable code
        tryCatchDeoptimization: false,
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Use CSS minification
    cssMinify: 'esbuild',
  },
  // CSS optimizations
  css: {
    devSourcemap: false,
    // NOTE: Lightning CSS disabled due to issues with external @import url() for fonts
    // The default CSS processor handles external URLs correctly
  },
  // Performance hints via esbuild
  esbuild: {
    // Remove console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Modern JavaScript for smaller output
    target: 'esnext',
    // Enable tree shaking
    treeShaking: true,
    // Remove legal comments
    legalComments: 'none',
    // Minify identifiers
    minifyIdentifiers: process.env.NODE_ENV === 'production',
    minifySyntax: true,
    minifyWhitespace: process.env.NODE_ENV === 'production',
  },
  // Server optimizations for dev mode
  server: {
    // Warm up frequently used modules for faster HMR
    warmup: {
      clientFiles: [
        './src/renderer/App.tsx',
        './src/renderer/state/AgentProvider.tsx',
        './src/renderer/state/EditorProvider.tsx',
        './src/renderer/features/chat/ChatArea.tsx',
        './src/renderer/components/layout/MainLayout.tsx',
      ],
    },
    // Enable HTTP/2 for faster module loading
    strictPort: false,
  },
  // Optimize worker handling
  worker: {
    format: 'es',
  },
  // Enable caching for faster rebuilds
  cacheDir: '.vite',
});
