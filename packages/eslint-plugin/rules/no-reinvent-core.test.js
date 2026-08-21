import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './no-reinvent-core.js'

const tester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2022,
    },
  },
})

const helpers = ['gravatarUrlFor', 'detectLinkKind', 'slugify', 'notePathFor', 'serializeNote', 'deserializeNote', 'noteTitle', 'isEncryptedItemPath']

describe('no-reinvent-core', () => {
  it('passes valid cases and catches invalid cases', () => {
    tester.run('no-reinvent-core', rule, {
      valid: [
        // Non-colliding name
        {
          code: `function myCustomHelper() {}`,
          options: [{ helpers }],
        },
        // Nested function (not top-level) — not flagged
        {
          code: `function outer() { function slugify(x) { return x } }`,
          options: [{ helpers }],
        },
        // const that is not a function
        {
          code: `const slugify = "string"`,
          options: [{ helpers }],
        },
        // File inside packages/core — exempt (filename check)
        {
          code: `function slugify(text) { return text }`,
          options: [{ helpers }],
          filename: '/repo/packages/core/src/lib/file-paths.ts',
        },
        // Empty helpers list
        {
          code: `function slugify(text) { return text }`,
          options: [{ helpers: [] }],
        },
      ],
      invalid: [
        // Top-level function declaration with colliding name
        {
          code: `function slugify(text) { return text }`,
          options: [{ helpers }],
          errors: [{ messageId: 'noReinventCore', data: { name: 'slugify' } }],
        },
        // Arrow const with colliding name
        {
          code: `const gravatarUrlFor = (email) => ""`,
          options: [{ helpers }],
          errors: [{ messageId: 'noReinventCore', data: { name: 'gravatarUrlFor' } }],
        },
        // Function expression const
        {
          code: `const detectLinkKind = function(url) { return "github" }`,
          options: [{ helpers }],
          errors: [{ messageId: 'noReinventCore', data: { name: 'detectLinkKind' } }],
        },
        // Exported function declaration — the common shape of a reinvented helper
        {
          code: `export function slugify(text) { return text }`,
          options: [{ helpers }],
          errors: [{ messageId: 'noReinventCore', data: { name: 'slugify' } }],
        },
        // Exported arrow const
        {
          code: `export const notePathFor = (id) => ""`,
          options: [{ helpers: ['notePathFor'] }],
          errors: [{ messageId: 'noReinventCore', data: { name: 'notePathFor' } }],
        },
      ],
    })
  })
})
