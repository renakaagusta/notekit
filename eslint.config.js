import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import importX from 'eslint-plugin-import-x'
import sonarjs from 'eslint-plugin-sonarjs'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import notekitPlugin from '@notekit/eslint-plugin'

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

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/*.d.ts',
      '**/build/**',
      // other agents' git worktrees — not our source
      '.claude/**',
      // native build outputs & Capacitor-synced webviews — generated, never hand-edited
      '**/DerivedData/**',
      '**/ios/App/App/public/**',
      '**/android/app/src/main/assets/public/**',
      '**/*.min.js',
      // landing uses next lint separately
      'apps/landing/**',
      // backoffice has its own config
      'apps/backoffice/**',
    ],
  },

  // All TypeScript files — strict rules
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic,
    ],
    plugins: {
      'import-x': importX,
      sonarjs,
      'eslint-comments': eslintComments,
      '@notekit': notekitPlugin,
    },
    settings: {
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // Complexity limits — mirrors paprika gocyclo(15) / nestif(4) / funlen(80)
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipComments: true, skipBlankLines: true }],
      'max-params': ['error', 5],

      // Type safety
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // Code quality
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',

      // Import hygiene (CONVENTIONS #6 — no cycles)
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Cognitive complexity (CONVENTIONS #0)
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': ['error', { threshold: 5 }],

      // File size ceiling (CONVENTIONS #0 / #6)
      'max-lines': ['error', { max: 800, skipComments: true, skipBlankLines: true }],

      // Suppression hygiene (CONVENTIONS #7)
      'eslint-comments/require-description': 'error',
      'eslint-comments/no-unused-disable': 'error',

      // Custom @notekit rules
      '@notekit/no-reinvent-core': ['error', { helpers: CORE_HELPERS }],
      '@notekit/bind-fetch-globalthis': 'error',
    },
  },

  // JSX/TSX — also flag emoji-as-icon (CONVENTIONS #2), exempt test files
  {
    files: ['**/*.tsx'],
    ignores: ['**/*.test.tsx', '**/*.spec.tsx'],
    rules: {
      '@notekit/no-emoji-as-icon': 'error',
    },
  },

  // React packages (core + web)
  {
    files: ['packages/core/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
    },
    languageOptions: {
      globals: globals.browser,
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

  // Test files — repeated fixture literals and near-identical cases are idiomatic;
  // the sonarjs dedup/complexity heuristics are noise here (they target production code).
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
)
