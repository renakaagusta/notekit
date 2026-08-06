import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/*.d.ts',
      '**/build/**',
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

  // Dev scripts — console is expected
  {
    files: ['apps/api/scripts/**/*.ts', 'apps/*/scripts/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
