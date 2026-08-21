import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { cleancode } from 'cleancode-kit'

// Domain-specific helpers from @notekit/core that must not be reimplemented per-file.
// Sourced from packages/core/src/lib/{gravatar,link-kind,file-paths,serialize,note-display,directory}.ts
const CORE_HELPERS = [
  'gravatarUrlFor',
  'detectLinkKind',
  'slugify',
  'notePathFor',
  'ticketPathFor',
  'linkPathFor',
  'serializeNote',
  'deserializeNote',
  'serializeTicket',
  'deserializeTicket',
  'noteTitle',
  'notePreview',
  'isEncryptedItemPath',
  'isNotFound',
]

export default [
  // Shared clean-code contract — complexity budgets, import/suppression hygiene,
  // type-safety, sonarjs, and the custom rules (no-emoji-as-icon, bind-fetch-globalthis,
  // no-reinvent-core). Seeded with NoteKit's core helpers and vendored globs.
  ...cleancode({
    coreHelpers: CORE_HELPERS,
    corePackage: '@notekit/core',
    ignoreReinventPathContains: ['/packages/core/'],
    vendored: ['apps/backoffice/src/components/ui/**'],
    ignores: [
      // other agents' git worktrees — not our source
      '.claude/**',
      // native build outputs & Capacitor-synced webviews — generated, never hand-edited
      '**/DerivedData/**',
      '**/ios/App/App/public/**',
      '**/android/app/src/main/assets/public/**',
      '**/*.min.js',
      // generated router tree — not hand-edited
      '**/routeTree.gen.ts',
    ],
  }),

  // React apps/packages (core + web + backoffice admin + landing marketing)
  {
    files: [
      'packages/core/**/*.{ts,tsx}',
      'apps/web/**/*.{ts,tsx}',
      'apps/backoffice/**/*.{ts,tsx}',
      'apps/landing/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
    },
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Backoffice admin + landing marketing — separately-deployed surfaces where
  // console output is acceptable; otherwise held to the same shared ruleset.
  {
    files: ['apps/backoffice/**/*.{ts,tsx}', 'apps/landing/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'warn',
    },
  },

  // Vendored shadcn/ui primitives also use upstream hook idioms our strict config
  // would reject (the preset's `vendored` option already drops the maintainability
  // heuristics; this drops the react-compiler hook rules + ref non-null on top).
  {
    files: ['apps/backoffice/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  // Node packages (api, desktop, cli, mcp)
  {
    files: ['apps/api/**/*.ts', 'apps/desktop/**/*.ts', 'apps/cli/**/*.ts', 'apps/mcp/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Logger files — console/stderr use is intentional inside the logger itself
  {
    files: [
      '**/lib/logger.ts',
      'packages/core/src/lib/logger.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // Dev scripts & docs tooling — console is expected
  {
    files: ['apps/api/scripts/**/*.ts', 'apps/*/scripts/**/*.ts', 'scripts/**/*.ts', 'docs/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]
