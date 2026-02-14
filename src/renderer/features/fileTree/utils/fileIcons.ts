/**
 * File Icons Utility
 *
 * Maps file extensions and folder names to clean, recognizable icons.
 *
 * Icon strategy:
 * - Tabler TbBrand* (outline brand logos) for major programming languages & tools
 * - Tabler TbFileType* (file-shaped) for common file formats
 * - Tabler generic icons (TbCode, TbTerminal, etc.) for less common languages
 * - Lucide icons for folders and a few remaining generic types
 *
 * All icons use stroke/outline style with strokeWidth support,
 * ensuring visual consistency at 15px in the file tree.
 */

import type { ComponentType } from 'react';

// ---- Tabler Brand Icons (outline-style language/tool logos) ----
import {
  TbBrandTypescript,
  TbBrandJavascript,
  TbBrandPython,
  TbBrandReact,
  TbBrandRust,
  TbBrandGolang,
  TbBrandSwift,
  TbBrandKotlin,
  TbBrandCpp,
  TbBrandCSharp,
  TbBrandPhp,
  TbBrandHtml5,
  TbBrandCss3,
  TbBrandSass,
  TbBrandTailwind,
  TbBrandVue,
  TbBrandSvelte,
  TbBrandAngular,
  TbBrandGraphql,
  TbBrandDocker,
  TbBrandGit,
  TbBrandNpm,
  TbBrandYarn,
  TbBrandPnpm,
  TbBrandNodejs,
  TbBrandVite,
  TbBrandMongodb,
  TbBrandMysql,
  TbBrandDjango,
  TbBrandLaravel,
  TbBrandFlutter,
  TbBrandNextjs,
  TbBrandNuxt,
  TbBrandAstro,
  TbBrandDeno,
  TbBrandPrisma,
  TbBrandVercel,
  TbBrandTerraform,
  TbBrandPowershell,
  TbBrandCypress,
  TbBrandStorybook,
  TbBrandGitlab,
  TbBrandFirebase,
  TbBrandRedux,
  TbBrandGithub,
} from 'react-icons/tb';

// ---- Tabler File-Type Icons (file shape with abbreviation) ----
import {
  TbFileTypeSql,
  TbFileTypeSvg,
  TbFileTypePng,
  TbFileTypeJpg,
  TbFileTypeBmp,
  TbFileTypePdf,
  TbFileTypeDoc,
  TbFileTypeDocx,
  TbFileTypeTxt,
  TbFileTypeCsv,
  TbFileTypeXml,
  TbFileTypeZip,
  TbFileTypeXls,
} from 'react-icons/tb';

// ---- Tabler Generic Icons ----
import {
  TbCode,
  TbTerminal,
  TbTerminal2,
  TbJson,
  TbMarkdown,
  TbHash,
  TbBraces,
  TbDatabase,
  TbFileCode,
  TbFileCode2,
  TbFileSettings,
  TbShieldLock,
  TbPackage,
  TbBook,
  TbGitBranch,
  TbCoffee,
  TbSection,
  TbMathFunction,
  TbKeyboard,
  TbBinary,
  TbPhoto,
  TbVideo,
  TbMusic,
  TbFileZip,
  TbTypography,
  TbLock,
  TbKey,
  TbFile,
} from 'react-icons/tb';

// ---- Lucide React: Folder icons ----
import {
  Folder,
  FolderOpen,
  FolderGit,
  FolderGit2,
  FolderCode,
  FolderCog,
  FolderDot,
  FolderKey,
  FolderLock,
  FolderOutput,
  FolderSearch,
  FolderKanban,
  FolderCheck,
  FolderInput,
  FolderArchive,
  FolderSync,
  FolderHeart,
  FolderClock,
  Package,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// Shared Icon Component Type
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = ComponentType<any>;

// =============================================================================
// File Extension -> Icon
// =============================================================================

const FILE_ICON_MAP: Record<string, IconComponent> = {
  // -- JavaScript / TypeScript --
  js:      TbBrandJavascript,
  mjs:     TbBrandJavascript,
  cjs:     TbBrandJavascript,
  jsx:     TbBrandReact,
  ts:      TbBrandTypescript,
  tsx:     TbBrandReact,
  'd.ts':  TbBrandTypescript,

  // -- Web --
  html:    TbBrandHtml5,
  htm:     TbBrandHtml5,
  css:     TbBrandCss3,
  scss:    TbBrandSass,
  sass:    TbBrandSass,
  less:    TbHash,
  styl:    TbHash,
  pcss:    TbHash,
  vue:     TbBrandVue,
  svelte:  TbBrandSvelte,
  astro:   TbBrandAstro,

  // -- Data / Config --
  json:    TbJson,
  jsonc:   TbJson,
  json5:   TbJson,
  yaml:    TbBraces,
  yml:     TbBraces,
  toml:    TbFileSettings,
  xml:     TbFileTypeXml,
  csv:     TbFileTypeCsv,
  tsv:     TbFileTypeCsv,
  graphql: TbBrandGraphql,
  gql:     TbBrandGraphql,

  // -- Documentation --
  md:      TbMarkdown,
  mdx:     TbMarkdown,
  txt:     TbFileTypeTxt,
  rtf:     TbFileTypeTxt,
  doc:     TbFileTypeDoc,
  docx:    TbFileTypeDocx,
  pdf:     TbFileTypePdf,
  rst:     TbFileTypeTxt,
  tex:     TbSection,
  latex:   TbSection,

  // -- Programming Languages --
  py:      TbBrandPython,
  pyw:     TbBrandPython,
  pyi:     TbBrandPython,
  pyx:     TbBrandPython,

  rb:      TbCode,
  erb:     TbCode,
  gemspec: TbCode,

  php:     TbBrandPhp,

  java:    TbCoffee,
  jar:     TbCoffee,
  class:   TbCoffee,

  kt:      TbBrandKotlin,
  kts:     TbBrandKotlin,

  go:      TbBrandGolang,

  rs:      TbBrandRust,

  c:       TbCode,
  h:       TbCode,

  cpp:     TbBrandCpp,
  cc:      TbBrandCpp,
  cxx:     TbBrandCpp,
  hpp:     TbBrandCpp,
  hxx:     TbBrandCpp,

  cs:      TbBrandCSharp,
  csx:     TbBrandCSharp,

  fs:      TbCode,
  fsx:     TbCode,
  fsi:     TbCode,

  swift:   TbBrandSwift,

  scala:   TbCode,
  sbt:     TbCode,

  dart:    TbBrandFlutter,

  r:       TbCode,
  R:       TbCode,
  rmd:     TbCode,

  lua:     TbCode,

  pl:      TbCode,
  pm:      TbCode,

  ex:      TbCode,
  exs:     TbCode,
  heex:    TbCode,

  erl:     TbCode,
  hrl:     TbCode,

  hs:      TbMathFunction,
  lhs:     TbMathFunction,

  clj:     TbCode,
  cljs:    TbCode,
  cljc:    TbCode,
  edn:     TbCode,

  jl:      TbCode,

  zig:     TbCode,

  nim:     TbCode,
  nimble:  TbCode,

  sol:     TbCode,

  cr:      TbCode,

  coffee:  TbCoffee,

  ml:      TbCode,
  mli:     TbCode,
  re:      TbCode,
  rei:     TbCode,

  f90:     TbCode,
  f95:     TbCode,
  f03:     TbCode,
  for:     TbCode,

  wasm:    TbBinary,
  wat:     TbBinary,
  as:      TbBinary,

  v:       TbBrandVue,

  // -- Shell / Terminal --
  sh:      TbTerminal,
  bash:    TbTerminal,
  zsh:     TbTerminal,
  fish:    TbTerminal,
  ps1:     TbBrandPowershell,
  psm1:    TbBrandPowershell,
  bat:     TbTerminal2,
  cmd:     TbTerminal2,

  // -- Images --
  png:     TbFileTypePng,
  jpg:     TbFileTypeJpg,
  jpeg:    TbFileTypeJpg,
  gif:     TbPhoto,
  svg:     TbFileTypeSvg,
  webp:    TbPhoto,
  ico:     TbPhoto,
  bmp:     TbFileTypeBmp,
  tiff:    TbPhoto,
  avif:    TbPhoto,

  // -- Video --
  mp4:     TbVideo,
  webm:    TbVideo,
  avi:     TbVideo,
  mov:     TbVideo,
  mkv:     TbVideo,

  // -- Audio --
  mp3:     TbMusic,
  wav:     TbMusic,
  ogg:     TbMusic,
  flac:    TbMusic,
  aac:     TbMusic,

  // -- Archives --
  zip:     TbFileTypeZip,
  tar:     TbFileZip,
  gz:      TbFileZip,
  rar:     TbFileZip,
  '7z':    TbFileZip,
  bz2:     TbFileZip,
  xz:      TbFileZip,
  tgz:     TbFileZip,

  // -- Database --
  sql:     TbFileTypeSql,
  db:      TbDatabase,
  sqlite:  TbDatabase,
  prisma:  TbBrandPrisma,
  mongo:   TbBrandMongodb,
  mongos:  TbBrandMongodb,
  mysql:   TbBrandMysql,

  // -- Misc code --
  asm:     TbBinary,
  s:       TbBinary,
  o:       TbBinary,
  lib:     TbFileCode,
  dll:     TbFileCode,
  so:      TbFileCode2,
  dylib:   TbFileCode2,

  // -- Config / env --
  env:     TbKey,
  ini:     TbFileSettings,
  cfg:     TbFileSettings,
  conf:    TbFileSettings,
  lock:    TbLock,
  proto:   TbBraces,

  // -- Fonts --
  ttf:     TbTypography,
  otf:     TbTypography,
  woff:    TbTypography,
  woff2:   TbTypography,
  eot:     TbTypography,

  // -- Certificates / Keys --
  pem:     TbKey,
  key:     TbKey,
  crt:     TbShieldLock,
  cert:    TbShieldLock,

  // Spreadsheets
  xls:     TbFileTypeXls,
  xlsx:    TbFileTypeXls,
};

// =============================================================================
// Special Filenames -> Icon
// =============================================================================

const SPECIAL_FILE_MAP: Record<string, IconComponent> = {
  // -- Package Managers --
  'package.json':         TbBrandNpm,
  'package-lock.json':    TbBrandNpm,
  'yarn.lock':            TbBrandYarn,
  'pnpm-lock.yaml':       TbBrandPnpm,
  'bun.lockb':            TbLock,
  'bun.lock':             TbLock,
  'cargo.toml':           TbBrandRust,
  'cargo.lock':           TbBrandRust,
  'go.mod':               TbBrandGolang,
  'go.sum':               TbBrandGolang,
  'gemfile':              TbCode,
  'gemfile.lock':         TbCode,
  'requirements.txt':     TbBrandPython,
  'pipfile':              TbBrandPython,
  'pipfile.lock':         TbBrandPython,
  'pyproject.toml':       TbBrandPython,
  'poetry.lock':          TbBrandPython,
  'setup.py':             TbBrandPython,
  'setup.cfg':            TbBrandPython,
  'composer.json':        TbBrandPhp,
  'composer.lock':        TbBrandPhp,
  'pubspec.yaml':         TbBrandFlutter,
  'pubspec.lock':         TbBrandFlutter,
  'build.gradle':         TbCode,
  'build.gradle.kts':     TbCode,
  'settings.gradle':      TbCode,
  'settings.gradle.kts':  TbCode,
  'pom.xml':              TbCoffee,
  'firebase.json':        TbBrandFirebase,
  'firestore.rules':      TbBrandFirebase,
  'firestore.indexes.json': TbBrandFirebase,
  '.firebaserc':          TbBrandFirebase,
  'storage.rules':        TbBrandFirebase,
  'manage.py':            TbBrandDjango,
  'urls.py':              TbBrandDjango,
  'wsgi.py':              TbBrandDjango,
  'asgi.py':              TbBrandDjango,
  'artisan':              TbBrandLaravel,
  '.env.laravel':         TbBrandLaravel,
  'store.ts':             TbBrandRedux,
  'store.js':             TbBrandRedux,
  'store/index.ts':       TbBrandRedux,
  '.nvmrc':               TbBrandNodejs,
  '.node-version':        TbBrandNodejs,
  '.npmrc':               TbBrandNodejs,
  'CODEOWNERS':           TbBrandGithub,
  'mix.exs':              TbCode,
  'mix.lock':             TbCode,
  'stack.yaml':           TbMathFunction,
  'cabal.project':        TbMathFunction,

  // -- TypeScript / JavaScript Config --
  'tsconfig.json':        TbBrandTypescript,
  'tsconfig.base.json':   TbBrandTypescript,
  'tsconfig.build.json':  TbBrandTypescript,
  'tsconfig.node.json':   TbBrandTypescript,
  'jsconfig.json':        TbBrandJavascript,
  'deno.json':            TbBrandDeno,
  'deno.jsonc':           TbBrandDeno,
  'bunfig.toml':          TbFileSettings,

  // -- Linting & Formatting --
  '.eslintrc':            TbBraces,
  '.eslintrc.js':         TbBraces,
  '.eslintrc.cjs':        TbBraces,
  '.eslintrc.json':       TbBraces,
  'eslint.config.js':     TbBraces,
  'eslint.config.ts':     TbBraces,
  'eslint.config.mjs':    TbBraces,
  '.prettierrc':          TbBraces,
  '.prettierrc.js':       TbBraces,
  '.prettierrc.json':     TbBraces,
  '.prettierrc.cjs':      TbBraces,
  '.prettierrc.toml':     TbBraces,
  '.prettierrc.yaml':     TbBraces,
  'prettier.config.js':   TbBraces,
  '.stylelintrc':         TbBraces,
  '.editorconfig':        TbFileSettings,
  'biome.json':           TbBraces,
  'biome.jsonc':          TbBraces,

  // -- Build Tools --
  'vite.config.ts':       TbBrandVite,
  'vite.config.js':       TbBrandVite,
  'vite.config.mjs':      TbBrandVite,
  'webpack.config.js':    TbBraces,
  'webpack.config.ts':    TbBraces,
  'rollup.config.js':     TbBraces,
  'rollup.config.ts':     TbBraces,
  'esbuild.config.js':    TbBraces,
  'turbo.json':           TbJson,
  'nx.json':              TbJson,
  'angular.json':         TbBrandAngular,
  'next.config.js':       TbBrandNextjs,
  'next.config.ts':       TbBrandNextjs,
  'next.config.mjs':      TbBrandNextjs,
  'nuxt.config.ts':       TbBrandNuxt,
  'nuxt.config.js':       TbBrandNuxt,
  'svelte.config.js':     TbBrandSvelte,
  'astro.config.mjs':     TbBrandAstro,
  'astro.config.ts':      TbBrandAstro,
  'tailwind.config.js':   TbBrandTailwind,
  'tailwind.config.ts':   TbBrandTailwind,
  'tailwind.config.cjs':  TbBrandTailwind,
  'postcss.config.js':    TbHash,
  'postcss.config.cjs':   TbHash,

  // -- Test Config --
  'vitest.config.ts':     TbCode,
  'vitest.config.js':     TbCode,
  'jest.config.js':       TbCode,
  'jest.config.ts':       TbCode,
  'jest.config.mjs':      TbCode,
  '.mocharc.yml':         TbCode,
  '.mocharc.json':        TbCode,
  'cypress.config.ts':    TbBrandCypress,
  'cypress.config.js':    TbBrandCypress,
  'playwright.config.ts': TbCode,
  'playwright.config.js': TbCode,

  // -- Git --
  '.gitignore':           TbBrandGit,
  '.gitattributes':       TbBrandGit,
  '.gitmodules':          TbBrandGit,
  '.gitkeep':             TbBrandGit,
  '.gitconfig':           TbGitBranch,
  '.gitflow':             TbGitBranch,

  // -- Docker --
  'dockerfile':           TbBrandDocker,
  'Dockerfile':           TbBrandDocker,
  'docker-compose.yml':   TbBrandDocker,
  'docker-compose.yaml':  TbBrandDocker,
  'compose.yml':          TbBrandDocker,
  'compose.yaml':         TbBrandDocker,
  '.dockerignore':        TbBrandDocker,

  // -- CI / CD --
  '.travis.yml':          TbCode,
  'jenkinsfile':          TbCode,
  'Jenkinsfile':          TbCode,
  '.gitlab-ci.yml':       TbBrandGitlab,
  '.github':              TbBrandGithub,

  // -- Cloud / Infrastructure --
  'vercel.json':          TbBrandVercel,
  'netlify.toml':         TbFileSettings,
  'terraform.tf':         TbBrandTerraform,
  'kubernetes.yml':       TbBraces,
  'kubernetes.yaml':      TbBraces,

  // -- Build Systems --
  'makefile':             TbTerminal,
  'Makefile':             TbTerminal,
  'cmakelists.txt':       TbBrandCpp,
  'CMakeLists.txt':       TbBrandCpp,
  'rakefile':             TbCode,
  'Rakefile':             TbCode,
  'lerna.json':           TbPackage,
  'rush.json':            TbPackage,
  '.yarnrc.yml':          TbPackage,

  // -- Security / Keys --
  '.env':                 TbKey,
  '.env.local':           TbKey,
  '.env.production':      TbKey,
  '.env.development':     TbKey,
  '.env.staging':         TbKey,
  '.env.example':         TbKey,
  '.env.test':            TbKey,

  // -- Documentation --
  'license':              TbBook,
  'license.md':           TbBook,
  'licence':              TbBook,
  'licence.md':           TbBook,
  'readme.md':            TbMarkdown,
  'readme':               TbBook,
  'changelog.md':         TbMarkdown,
  'contributing.md':      TbMarkdown,

  // -- Framework-specific --
  '.storybook':           TbBrandStorybook,
  'forge.config.ts':      TbBrandTypescript,
  'forge.config.js':      TbBrandJavascript,
  'electron-builder.yml': TbBraces,
  'keybindings.json':     TbKeyboard,
  'shortcuts.json':       TbKeyboard,
};

// =============================================================================
// Folder Name -> Icon
// =============================================================================

const FOLDER_ICON_MAP: Record<string, { closed: LucideIcon; open: LucideIcon }> = {
  '.git':            { closed: FolderGit, open: FolderGit2 },
  '.github':         { closed: FolderGit, open: FolderGit2 },
  '.vscode':         { closed: FolderCog, open: FolderOpen },
  '.idea':           { closed: FolderCog, open: FolderOpen },
  'node_modules':    { closed: Package, open: FolderArchive },
  'vendor':          { closed: Package, open: FolderArchive },
  'src':             { closed: FolderCode, open: FolderOpen },
  'lib':             { closed: FolderCode, open: FolderOpen },
  'app':             { closed: FolderCode, open: FolderOpen },
  'pages':           { closed: FolderCode, open: FolderOpen },
  'dist':            { closed: FolderOutput, open: FolderOpen },
  'build':           { closed: FolderOutput, open: FolderOpen },
  'out':             { closed: FolderOutput, open: FolderOpen },
  'target':          { closed: FolderOutput, open: FolderOpen },
  '.next':           { closed: FolderOutput, open: FolderOpen },
  'config':          { closed: FolderCog, open: FolderOpen },
  'configs':         { closed: FolderCog, open: FolderOpen },
  'settings':        { closed: FolderCog, open: FolderOpen },
  'test':            { closed: FolderCheck, open: FolderOpen },
  'tests':           { closed: FolderCheck, open: FolderOpen },
  '__tests__':       { closed: FolderCheck, open: FolderOpen },
  'spec':            { closed: FolderCheck, open: FolderOpen },
  'specs':           { closed: FolderCheck, open: FolderOpen },
  '__mocks__':       { closed: FolderCheck, open: FolderOpen },
  'fixtures':        { closed: FolderCheck, open: FolderOpen },
  'e2e':             { closed: FolderCheck, open: FolderOpen },
  'cypress':         { closed: FolderCheck, open: FolderOpen },
  'assets':          { closed: FolderHeart, open: FolderOpen },
  'images':          { closed: FolderHeart, open: FolderOpen },
  'icons':           { closed: FolderHeart, open: FolderOpen },
  'fonts':           { closed: FolderHeart, open: FolderOpen },
  'public':          { closed: FolderHeart, open: FolderOpen },
  'static':          { closed: FolderHeart, open: FolderOpen },
  'media':           { closed: FolderHeart, open: FolderOpen },
  'components':      { closed: FolderKanban, open: FolderOpen },
  'features':        { closed: FolderKanban, open: FolderOpen },
  'modules':         { closed: FolderKanban, open: FolderOpen },
  'widgets':         { closed: FolderKanban, open: FolderOpen },
  'utils':           { closed: FolderCog, open: FolderOpen },
  'helpers':         { closed: FolderCog, open: FolderOpen },
  'shared':          { closed: FolderSync, open: FolderOpen },
  'common':          { closed: FolderSync, open: FolderOpen },
  'hooks':           { closed: FolderInput, open: FolderOpen },
  'state':           { closed: FolderDot, open: FolderOpen },
  'store':           { closed: FolderDot, open: FolderOpen },
  'reducers':        { closed: FolderDot, open: FolderOpen },
  'types':           { closed: FolderKey, open: FolderOpen },
  'typings':         { closed: FolderKey, open: FolderOpen },
  '@types':          { closed: FolderKey, open: FolderOpen },
  'api':             { closed: FolderSearch, open: FolderOpen },
  'routes':          { closed: FolderSearch, open: FolderOpen },
  'docs':            { closed: FolderOpen, open: FolderOpen },
  'documentation':   { closed: FolderOpen, open: FolderOpen },
  'scripts':         { closed: FolderCog, open: FolderOpen },
  'bin':             { closed: FolderCog, open: FolderOpen },
  'services':        { closed: FolderSync, open: FolderOpen },
  'providers':       { closed: FolderSync, open: FolderOpen },
  'security':        { closed: FolderLock, open: FolderOpen },
  'auth':            { closed: FolderLock, open: FolderOpen },
  '.circleci':       { closed: FolderCog, open: FolderOpen },
  '.husky':          { closed: FolderCog, open: FolderOpen },
  'logs':            { closed: FolderClock, open: FolderOpen },
  'tmp':             { closed: FolderClock, open: FolderOpen },
  'temp':            { closed: FolderClock, open: FolderOpen },
  'cache':           { closed: FolderArchive, open: FolderOpen },
};

// =============================================================================
// Icon Getter Functions
// =============================================================================

const fileIconCache = new Map<string, IconComponent>();
const MAX_CACHE_SIZE = 500;

export function getFileIcon(filename: string): IconComponent {
  const cached = fileIconCache.get(filename);
  if (cached) return cached;

  let icon: IconComponent;
  const lowerName = filename.toLowerCase();

  // 1. Check special filenames (exact match)
  if (SPECIAL_FILE_MAP[lowerName]) {
    icon = SPECIAL_FILE_MAP[lowerName];
  } else if (SPECIAL_FILE_MAP[filename]) {
    icon = SPECIAL_FILE_MAP[filename];
  } else {
    // 2. Check by extension
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = filename.slice(lastDot + 1).toLowerCase();
      // Check compound extension (e.g. d.ts)
      const secondLastDot = filename.lastIndexOf('.', lastDot - 1);
      if (secondLastDot > 0) {
        const compoundExt = filename.slice(secondLastDot + 1).toLowerCase();
        if (FILE_ICON_MAP[compoundExt]) {
          icon = FILE_ICON_MAP[compoundExt];
        } else {
          icon = FILE_ICON_MAP[ext] || TbFile;
        }
      } else {
        icon = FILE_ICON_MAP[ext] || TbFile;
      }
    } else {
      icon = TbFile;
    }
  }

  if (fileIconCache.size >= MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(fileIconCache.keys()).slice(0, MAX_CACHE_SIZE / 2);
    keysToDelete.forEach((key) => fileIconCache.delete(key));
  }
  fileIconCache.set(filename, icon);
  return icon;
}

export function getFolderIcon(folderName: string, isOpen: boolean): LucideIcon {
  const lowerName = folderName.toLowerCase();
  const mapping = FOLDER_ICON_MAP[lowerName];
  if (mapping) {
    return isOpen ? mapping.open : mapping.closed;
  }
  return isOpen ? FolderOpen : Folder;
}

// =============================================================================
// Brand Colors
// =============================================================================

export function getIconColorClass(filename: string, type: 'file' | 'directory'): string {
  if (type === 'directory') {
    return getFolderColorClass(filename);
  }

  const lowerName = filename.toLowerCase();
  const specialColor = getSpecialFileColor(lowerName);
  if (specialColor) return specialColor;

  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = filename.slice(lastDot + 1).toLowerCase();
    return getExtensionColor(ext);
  }

  return 'text-[var(--color-text-dim)]';
}

function getExtensionColor(ext: string): string {
  switch (ext) {
    // JavaScript - #F7DF1E
    case 'js': case 'mjs': case 'cjs':
      return 'text-[#F7DF1E]';
    // TypeScript - #3178C6
    case 'ts':
      return 'text-[#3178C6]';
    // React - #61DAFB
    case 'jsx': case 'tsx':
      return 'text-[#61DAFB]';
    // Python - #3776AB
    case 'py': case 'pyw': case 'pyi': case 'pyx':
      return 'text-[#3776AB]';
    // Rust - #DEA584
    case 'rs':
      return 'text-[#DEA584]';
    // Go - #00ADD8
    case 'go':
      return 'text-[#00ADD8]';
    // Ruby - #CC342D
    case 'rb': case 'erb': case 'gemspec':
      return 'text-[#CC342D]';
    // PHP - #777BB4
    case 'php':
      return 'text-[#777BB4]';
    // Java - #ED8B00
    case 'java': case 'jar': case 'class':
      return 'text-[#ED8B00]';
    // Kotlin - #7F52FF
    case 'kt': case 'kts':
      return 'text-[#7F52FF]';
    // Swift - #F05138
    case 'swift':
      return 'text-[#F05138]';
    // Dart - #0175C2
    case 'dart':
      return 'text-[#0175C2]';
    // Scala - #DC322F
    case 'scala': case 'sbt':
      return 'text-[#DC322F]';
    // R - #276DC3
    case 'r': case 'R': case 'rmd':
      return 'text-[#276DC3]';
    // Lua - #2C2D72
    case 'lua':
      return 'text-[#2C2D72]';
    // Perl - #39457E
    case 'pl': case 'pm':
      return 'text-[#39457E]';
    // Elixir - #4B275F
    case 'ex': case 'exs': case 'heex':
      return 'text-[#4B275F]';
    // Erlang - #A90533
    case 'erl': case 'hrl':
      return 'text-[#A90533]';
    // Haskell - #5D4F85
    case 'hs': case 'lhs':
      return 'text-[#5D4F85]';
    // Clojure - #5881D8
    case 'clj': case 'cljs': case 'cljc': case 'edn':
      return 'text-[#5881D8]';
    // Julia - #9558B2
    case 'jl':
      return 'text-[#9558B2]';
    // C - #A8B9CC
    case 'c': case 'h':
      return 'text-[#A8B9CC]';
    // C++ - #00599C
    case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hxx':
      return 'text-[#00599C]';
    // C# - #512BD4
    case 'cs': case 'csx':
      return 'text-[#512BD4]';
    // F# - #378BBA
    case 'fs': case 'fsx': case 'fsi':
      return 'text-[#378BBA]';
    // Zig - #F7A41D
    case 'zig':
      return 'text-[#F7A41D]';
    // Nim - #FFE953
    case 'nim': case 'nimble':
      return 'text-[#FFE953]';
    // Solidity - lighter for dark theme
    case 'sol':
      return 'text-[#B4B4B4]';
    // Crystal
    case 'cr':
      return 'text-[#B4B4B4]';
    // CoffeeScript - #6F4E37
    case 'coffee':
      return 'text-[#6F4E37]';
    // OCaml - #EC6813
    case 'ml': case 'mli': case 're': case 'rei':
      return 'text-[#EC6813]';
    // Fortran - #734F96
    case 'f90': case 'f95': case 'f03': case 'for':
      return 'text-[#734F96]';
    // WebAssembly - #654FF0
    case 'wasm': case 'wat': case 'as':
      return 'text-[#654FF0]';
    // HTML5 - #E34F26
    case 'html': case 'htm':
      return 'text-[#E34F26]';
    // CSS3 - #1572B6
    case 'css':
      return 'text-[#1572B6]';
    // SCSS/Sass - #CC6699
    case 'scss': case 'sass':
      return 'text-[#CC6699]';
    // Less - #1D365D
    case 'less':
      return 'text-[#1D365D]';
    // Stylus
    case 'styl':
      return 'text-[#B4B4B4]';
    // PostCSS - #DD3A0A
    case 'pcss':
      return 'text-[#DD3A0A]';
    // Vue - #4FC08D
    case 'vue': case 'v':
      return 'text-[#4FC08D]';
    // Svelte - #FF3E00
    case 'svelte':
      return 'text-[#FF3E00]';
    // Astro - #BC52EE
    case 'astro':
      return 'text-[#BC52EE]';
    // JSON - #F5C211
    case 'json': case 'jsonc': case 'json5':
      return 'text-[#F5C211]';
    // YAML - #CB171E
    case 'yaml': case 'yml':
      return 'text-[#CB171E]';
    // TOML - #9C4121
    case 'toml':
      return 'text-[#9C4121]';
    // XML - #0060AC
    case 'xml':
      return 'text-[#0060AC]';
    // Markdown
    case 'md': case 'mdx':
      return 'text-[var(--color-text-muted)]';
    // GraphQL - #E10098
    case 'graphql': case 'gql':
      return 'text-[#E10098]';
    // Shell - #4EAA25
    case 'sh': case 'bash': case 'zsh': case 'fish':
      return 'text-[#4EAA25]';
    // PowerShell - #5391FE
    case 'ps1': case 'psm1':
      return 'text-[#5391FE]';
    // bat/cmd
    case 'bat': case 'cmd':
      return 'text-emerald-500';
    // Images
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'ico': case 'bmp': case 'tiff': case 'avif':
      return 'text-purple-500';
    case 'svg':
      return 'text-[#FFB13B]';
    // Database
    case 'sql': case 'db':
      return 'text-[#336791]';
    case 'sqlite':
      return 'text-[#003B57]';
    case 'prisma':
      return 'text-[#2D3748]';
    // Config/env
    case 'env': case 'lock':
      return 'text-yellow-600';
    // Keys/certs
    case 'pem': case 'key': case 'crt': case 'cert':
      return 'text-yellow-500';
    // Video
    case 'mp4': case 'webm': case 'avi': case 'mov': case 'mkv':
      return 'text-red-400';
    // Audio
    case 'mp3': case 'wav': case 'ogg': case 'flac': case 'aac':
      return 'text-pink-400';
    // Archives
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z': case 'bz2': case 'xz': case 'tgz':
      return 'text-amber-500';
    // Fonts
    case 'ttf': case 'otf': case 'woff': case 'woff2': case 'eot':
      return 'text-red-300';
    // Text
    case 'txt': case 'rtf': case 'doc': case 'docx': case 'rst': case 'tex': case 'latex':
      return 'text-[var(--color-text-muted)]';
    case 'pdf':
      return 'text-red-500';
    case 'csv': case 'tsv':
      return 'text-green-500';
    default:
      return 'text-[var(--color-text-dim)]';
  }
}

function getSpecialFileColor(lowerName: string): string | null {
  if (lowerName.startsWith('.env')) return 'text-yellow-600';

  if (lowerName === '.gitignore' || lowerName === '.gitattributes' || lowerName === '.gitmodules')
    return 'text-[#F05032]';

  if (lowerName.startsWith('dockerfile') || lowerName.startsWith('docker-compose') || lowerName === '.dockerignore' || lowerName.startsWith('compose.'))
    return 'text-[#2496ED]';

  if (lowerName === 'package.json' || lowerName === 'package-lock.json')
    return 'text-[#CB3837]';

  if (lowerName === 'yarn.lock') return 'text-[#2C8EBB]';
  if (lowerName === 'pnpm-lock.yaml') return 'text-[#F69220]';
  if (lowerName === 'bun.lockb' || lowerName === 'bun.lock' || lowerName === 'bunfig.toml')
    return 'text-[#FBF0DF]';

  if (lowerName === 'cargo.toml' || lowerName === 'cargo.lock')
    return 'text-[#DEA584]';
  if (lowerName === 'go.mod' || lowerName === 'go.sum')
    return 'text-[#00ADD8]';

  if (lowerName === 'requirements.txt' || lowerName === 'pipfile' || lowerName === 'pipfile.lock' || lowerName === 'pyproject.toml' || lowerName === 'poetry.lock' || lowerName === 'setup.py' || lowerName === 'setup.cfg')
    return 'text-[#3776AB]';

  if (lowerName === 'gemfile' || lowerName === 'gemfile.lock' || lowerName === 'rakefile')
    return 'text-[#CC342D]';

  if (lowerName.startsWith('tsconfig'))
    return 'text-[#3178C6]';

  if (lowerName === 'license' || lowerName === 'license.md' || lowerName === 'licence' || lowerName === 'licence.md')
    return 'text-[var(--color-text-muted)]';

  if (lowerName === 'readme.md' || lowerName === 'readme' || lowerName === 'changelog.md' || lowerName === 'contributing.md')
    return 'text-[var(--color-text-muted)]';

  if (lowerName.includes('eslint'))
    return 'text-[#4B32C3]';

  if (lowerName.includes('prettier'))
    return 'text-[#F7B93E]';

  if (lowerName.startsWith('vite.config'))
    return 'text-[#646CFF]';

  if (lowerName.startsWith('webpack.config'))
    return 'text-[#8DD6F9]';

  if (lowerName.startsWith('next.config'))
    return 'text-[var(--color-text-primary)]';

  if (lowerName.startsWith('vitest.config'))
    return 'text-[#729B1B]';

  if (lowerName.startsWith('jest.config'))
    return 'text-[#C21325]';

  if (lowerName === '.storybook')
    return 'text-[#FF4785]';

  return null;
}

function getFolderColorClass(folderName: string): string {
  const lowerName = folderName.toLowerCase();

  if (lowerName === '.git' || lowerName === '.github')
    return 'text-[#F05032]';

  if (lowerName === '.vscode' || lowerName === '.idea' || lowerName === 'config' || lowerName === 'configs')
    return 'text-[var(--color-text-dim)]';

  if (['test', 'tests', '__tests__', 'spec', 'specs', '__mocks__', 'fixtures', 'e2e', 'cypress'].includes(lowerName))
    return 'text-[#729B1B]';

  if (lowerName === 'node_modules' || lowerName === 'vendor')
    return 'text-[var(--color-text-muted)]';

  if (['dist', 'build', 'out', 'target', '.next'].includes(lowerName))
    return 'text-amber-400';

  if (['src', 'lib', 'app', 'pages'].includes(lowerName))
    return 'text-[#3178C6]';

  if (['components', 'features', 'modules', 'widgets'].includes(lowerName))
    return 'text-[var(--color-accent-secondary)]';

  return 'text-[var(--color-accent-primary)]';
}

// =============================================================================
// Git Status Colors
// =============================================================================

export function getGitStatusColor(status: string | null): string {
  switch (status) {
    case 'modified':   return 'text-yellow-500';
    case 'added':
    case 'untracked':  return 'text-green-500';
    case 'deleted':    return 'text-red-500';
    case 'renamed':    return 'text-blue-500';
    case 'conflicted': return 'text-red-600';
    case 'staged':     return 'text-blue-400';
    case 'ignored':    return 'text-gray-500 opacity-60';
    default:           return '';
  }
}