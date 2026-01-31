import { defineConfig } from 'vite';

// Preload script configuration
// The preload script runs in a privileged context with access to Node.js APIs
// and communicates between the main and renderer processes via IPC.
// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Externalize Electron as it's available in the preload context
      external: ['electron'],
    },
  },
});
