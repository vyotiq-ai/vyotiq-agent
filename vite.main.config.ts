import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Externalize native modules that can't be bundled
      external: [
        'node-pty',
        '@homebridge/node-pty-prebuilt-multiarch',
        'better-sqlite3',
      ],
    },
  },
  // Prevent Vite from trying to transform native modules
  optimizeDeps: {
    exclude: [
      'node-pty',
      '@homebridge/node-pty-prebuilt-multiarch',
      'better-sqlite3',
    ],
  },
});
