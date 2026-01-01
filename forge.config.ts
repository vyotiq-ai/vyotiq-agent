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
      unpack: '**/{*.node,*.dll,*.so,*.dylib,better-sqlite3/**/*,node-pty/**/*,bindings/**/*}',
    },
  },
  rebuildConfig: {
    // Rebuild native modules for Electron
    onlyModules: ['better-sqlite3'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native modules to the build path so they're included in the package
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const nativeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      const destNodeModules = path.join(buildPath, 'node_modules');
      
      // Create node_modules in build path if it doesn't exist
      await fs.mkdir(destNodeModules, { recursive: true });
      
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
