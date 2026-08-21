import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './bind-fetch-globalthis.js'

const tester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2022,
    },
  },
})

describe('bind-fetch-globalthis', () => {
  it('passes valid cases and catches invalid cases', () => {
    tester.run('bind-fetch-globalthis', rule, {
      valid: [
        // bind to globalThis — correct
        { code: `const f = fetch.bind(globalThis)` },
        // member fetch bound to globalThis
        { code: `const f = window.fetch.bind(globalThis)` },
        // non-fetch bind
        { code: `const f = fn.bind(this)` },
        // fetch bound to other object
        { code: `const f = fetch.bind(obj)` },
      ],
      invalid: [
        // Direct fetch.bind(this)
        {
          code: `const f = fetch.bind(this)`,
          errors: [{
            messageId: 'bindFetchGlobalThis',
            suggestions: [{ messageId: 'suggestGlobalThis', output: `const f = fetch.bind(globalThis)` }],
          }],
        },
        // Member fetch bind(this)
        {
          code: `const f = this.fetch.bind(this)`,
          errors: [{
            messageId: 'bindFetchGlobalThis',
            suggestions: [{ messageId: 'suggestGlobalThis', output: `const f = this.fetch.bind(globalThis)` }],
          }],
        },
        // window.fetch.bind(this)
        {
          code: `const f = window.fetch.bind(this)`,
          errors: [{
            messageId: 'bindFetchGlobalThis',
            suggestions: [{ messageId: 'suggestGlobalThis', output: `const f = window.fetch.bind(globalThis)` }],
          }],
        },
      ],
    })
  })
})
