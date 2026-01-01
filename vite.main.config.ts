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
