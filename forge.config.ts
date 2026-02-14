import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Unpack native modules and binaries for proper loading
      unpack: '**/{*.node,*.dll,*.so,*.dylib,better-sqlite3/**/*,node-pty/**/*,bindings/**/*}',
    },
    // Optimize app name and metadata
    name: 'Vyotiq AI',
    // Prune dev dependencies for smaller package
    prune: true,
    // Use compression for smaller package size
    // Note: Using default compression for better compatibility
  },
  rebuildConfig: {
    // Rebuild native modules for Electron
    onlyModules: ['better-sqlite3', 'node-pty'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native modules and language servers to the build path so they're included in the package
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Native modules that need to be copied
      const nativeModules = ['better-sqlite3', 'node-pty', 'bindings', 'file-uri-to-path'];
      
      // Language server packages (bundled for LSP support)
      const languageServerPackages = [
        'typescript-language-server',
        'typescript', // Required by typescript-language-server
        'vscode-langservers-extracted',
        'vscode-languageserver',
        'vscode-languageserver-protocol',
        'vscode-languageserver-types',
        'vscode-languageserver-textdocument',
        'vscode-jsonrpc',
        'vscode-uri',
      ];
      
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      const destNodeModules = path.join(buildPath, 'node_modules');
      const destBinPath = path.join(destNodeModules, '.bin');
      
      // Create directories
      await fs.mkdir(destNodeModules, { recursive: true });
      await fs.mkdir(destBinPath, { recursive: true });
      
      // Copy native modules
      for (const mod of nativeModules) {
        const srcPath = path.join(nodeModulesPath, mod);
        const destPath = path.join(destNodeModules, mod);
        
        try {
          await fs.access(srcPath);
          await fs.cp(srcPath, destPath, { recursive: true });
          console.log(`Copied native module: ${mod}`);
        } catch {
          console.log(`Native module not found (skipping): ${mod}`);
        }
      }
      
      // Copy language server packages
      for (const pkg of languageServerPackages) {
        const srcPath = path.join(nodeModulesPath, pkg);
        const destPath = path.join(destNodeModules, pkg);
        
        try {
          await fs.access(srcPath);
          await fs.cp(srcPath, destPath, { recursive: true });
          console.log(`Copied language server package: ${pkg}`);
        } catch {
          console.log(`Language server package not found (skipping): ${pkg}`);
        }
      }
      
      // Copy .bin executables for language servers
      const srcBinPath = path.join(nodeModulesPath, '.bin');
      const binaries = [
        'typescript-language-server',
        'typescript-language-server.cmd',
        'vscode-css-language-server',
        'vscode-css-language-server.cmd',
        'vscode-html-language-server',
        'vscode-html-language-server.cmd',
        'vscode-json-language-server',
        'vscode-json-language-server.cmd',
        'vscode-eslint-language-server',
        'vscode-eslint-language-server.cmd',
        'vscode-markdown-language-server',
        'vscode-markdown-language-server.cmd',
      ];
      
      for (const bin of binaries) {
        const srcBin = path.join(srcBinPath, bin);
        const destBin = path.join(destBinPath, bin);
        
        try {
          await fs.access(srcBin);
          await fs.cp(srcBin, destBin, { recursive: true });
          console.log(`Copied binary: ${bin}`);
        } catch {
          // Binary doesn't exist (platform-specific)
        }
      }
    },
    // Optimize package after pruning by removing unnecessary files
    packageAfterPrune: async (_config, buildPath) => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Patterns to remove from node_modules (reduce package size)
      const removePatterns = [
        '**/README.md',
        '**/CHANGELOG.md',
        '**/LICENSE',
        '**/license',
        '**/*.d.ts.map',
        '**/.github',
        '**/.eslintrc*',
        '**/.prettierrc*',
        '**/tsconfig*.json',
        '**/docs/**',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/examples/**',
      ];
      
      const nodeModulesPath = path.join(buildPath, 'node_modules');
      
      // Helper to remove files matching patterns
      const removeByPattern = async (dir: string, pattern: string) => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const name = entry.name.toLowerCase();
            
            // Check if matches any pattern
            const shouldRemove = removePatterns.some(p => {
              const pLower = p.replace(/\*\*/g, '').replace(/\*/g, '').toLowerCase();
              return name.includes(pLower) || entry.name === p.replace(/\*\*/g, '').replace(/\*/g, '');
            });
            
            if (entry.isDirectory()) {
              // Recursively process directories
              await removeByPattern(fullPath, pattern);
              
              // Remove specific directories
              if (['docs', 'test', 'tests', '__tests__', 'examples', '.github'].includes(entry.name)) {
                try {
                  await fs.rm(fullPath, { recursive: true, force: true });
                } catch {
                  // Ignore errors
                }
              }
            } else if (shouldRemove) {
              try {
                await fs.rm(fullPath, { force: true });
              } catch {
                // Ignore errors
              }
            }
          }
        } catch {
          // Directory doesn't exist or can't be read
        }
      };
      
      try {
        await removeByPattern(nodeModulesPath, '');
        console.log('Optimized node_modules for packaging');
      } catch (err) {
        console.log('Package optimization skipped:', err);
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
