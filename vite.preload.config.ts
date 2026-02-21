import { defineConfig } from 'vite';

// Preload script configuration
// The preload script runs in a privileged context with access to Node.js APIs
// and communicates between the main and renderer processes via IPC.
//
// IMPORTANT: Minification is intentionally disabled for preload scripts.
// esbuild's const-to-minified-name transformation can cause TDZ (Temporal Dead Zone)
// errors when `const` declarations are reordered during minification.
// See: "Cannot access 'action2' before initialization" — this was caused by
// esbuild mangling `const` ordering in production builds.
// https://vitejs.dev/config
export default defineConfig({
  build: {
    // Disable minification to prevent TDZ errors from const reordering.
    // Preload scripts are small (~70KB) — minification saves negligible bytes
    // but risks breaking contextBridge.exposeInMainWorld() initialization order.
    minify: false,
    // Enable sourcemaps for accurate stack traces in preload error reports
    sourcemap: true,
    rollupOptions: {
      // Externalize Electron as it's available in the preload context
      external: ['electron'],
      output: {
        // Preserve module structure to avoid variable hoisting issues
        format: 'cjs',
      },
    },
  },
  esbuild: {
    // Keep names intact — prevents TDZ from renamed const declarations
    keepNames: true,
  },
});
